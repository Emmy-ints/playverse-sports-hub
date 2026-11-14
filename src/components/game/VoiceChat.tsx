import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Status = "off" | "starting" | "waiting" | "connecting" | "live" | "error";
type Signal = { from: string; to?: string; sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit; reply?: boolean };

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

/**
 * Opt-in voice chat between the two players of an online match (peer-to-peer WebRTC audio;
 * signalling over a realtime broadcast). Off by default; nothing is recorded or sent to our servers.
 * Only participants of the match can connect; spectators never get audio.
 */
export function VoiceChat({ matchId }: { matchId: string }) {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [status, setStatus] = useState<Status>("off");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[] | null>(null);
  const ch = useRef<RealtimeChannel | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  // Who may talk: the match's participants (read with the player's own permissions).
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !me) return;
    void sb.from("match_participants").select("player_id").eq("match_id", matchId).then(({ data }) => {
      const ids = ((data ?? []) as { player_id: string }[]).map((r) => r.player_id);
      setPeers(ids.includes(me) ? ids.filter((id) => id !== me) : []);
    });
  }, [matchId, me]);

  const send = (event: string, payload: Signal) => void ch.current?.send({ type: "broadcast", event, payload });

  const stop = (notify = true) => {
    if (notify && me) send("bye", { from: me });
    pc.current?.close();
    pc.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    const sb = getSupabase();
    if (ch.current && sb) void sb.removeChannel(ch.current);
    ch.current = null;
    if (audio.current) audio.current.srcObject = null;
    pendingIce.current = [];
    setStatus("off");
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const makePc = (peer: string) => {
    pc.current?.close();
    const p = new RTCPeerConnection(ICE);
    stream.current?.getTracks().forEach((t) => p.addTrack(t, stream.current!));
    p.onicecandidate = (e) => e.candidate && me && send("ice", { from: me, to: peer, c: e.candidate.toJSON() });
    p.ontrack = (e) => {
      if (audio.current) {
        audio.current.srcObject = e.streams[0] ?? new MediaStream([e.track]);
        void audio.current.play().catch(() => {});
      }
    };
    p.onconnectionstatechange = () => {
      if (p.connectionState === "connected") setStatus("live");
      else if (p.connectionState === "failed") {
        setStatus("error");
        setError("Couldn't connect voice (a strict network or firewall may block it).");
      } else if (p.connectionState === "disconnected" || p.connectionState === "closed") setStatus((s) => (s === "off" ? s : "waiting"));
    };
    pc.current = p;
    return p;
  };

  const start = async () => {
    const sb = getSupabase();
    if (!sb || !me || !peers?.length) return;
    setError(null);
    setStatus("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      setStatus("error");
      setError("Microphone permission was denied.");
      return;
    }
    stream.current.getAudioTracks().forEach((t) => (t.enabled = !muted));
    const allowed = (s: Signal) => peers.includes(s.from) && (!s.to || s.to === me);
    const c = sb.channel(`voice:${matchId}`, { config: { broadcast: { self: false } } });
    c.on("broadcast", { event: "hello" }, async ({ payload }) => {
      const s = payload as Signal;
      if (!allowed(s)) return;
      if (!s.reply) send("hello", { from: me, to: s.from, reply: true });
      // The player with the smaller id makes the offer.
      if (me < s.from) {
        setStatus("connecting");
        const p = makePc(s.from);
        const offer = await p.createOffer();
        await p.setLocalDescription(offer);
        send("offer", { from: me, to: s.from, sdp: offer });
      }
    });
    c.on("broadcast", { event: "offer" }, async ({ payload }) => {
      const s = payload as Signal;
      if (!allowed(s) || !s.sdp) return;
      setStatus("connecting");
      const p = makePc(s.from);
      await p.setRemoteDescription(s.sdp);
      for (const ic of pendingIce.current.splice(0)) await p.addIceCandidate(ic).catch(() => {});
      const answer = await p.createAnswer();
      await p.setLocalDescription(answer);
      send("answer", { from: me, to: s.from, sdp: answer });
    });
    c.on("broadcast", { event: "answer" }, async ({ payload }) => {
      const s = payload as Signal;
      if (!allowed(s) || !s.sdp || !pc.current) return;
      await pc.current.setRemoteDescription(s.sdp);
      for (const ic of pendingIce.current.splice(0)) await pc.current.addIceCandidate(ic).catch(() => {});
    });
    c.on("broadcast", { event: "ice" }, async ({ payload }) => {
      const s = payload as Signal;
      if (!allowed(s) || !s.c) return;
      if (pc.current?.remoteDescription) await pc.current.addIceCandidate(s.c).catch(() => {});
      else pendingIce.current.push(s.c);
    });
    c.on("broadcast", { event: "bye" }, ({ payload }) => {
      const s = payload as Signal;
      if (!allowed(s)) return;
      pc.current?.close();
      pc.current = null;
      setStatus("waiting");
    });
    c.subscribe((st) => {
      if (st === "SUBSCRIBED") {
        setStatus("waiting");
        send("hello", { from: me });
      }
    });
    ch.current = c;
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !m));
  };

  if (!me || !peers?.length || typeof window === "undefined" || !("RTCPeerConnection" in window)) return null;
  const label = { off: "Voice chat (off)", starting: "Starting mic…", waiting: "Waiting for your opponent to turn voice on…", connecting: "Connecting voice…", live: "Voice on", error: error ?? "Voice error" }[status];
  return (
    <div className="fixed left-2 top-[calc(50%+3.25rem)] z-50 flex flex-col gap-1.5">
      <audio ref={audio} autoPlay playsInline className="hidden" />
      {status === "off" || status === "error" ? (
        <button type="button" onClick={() => void start()} title={label} aria-label="Turn on voice chat"
          className={cn("glass flex size-11 items-center justify-center rounded-full text-white active:scale-95", status === "error" && "ring-2 ring-destructive")}>
          <MicOff className="size-5" />
        </button>
      ) : (
        <>
          <button type="button" onClick={toggleMute} title={label} aria-label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={!muted}
            className={cn("flex size-11 items-center justify-center rounded-full text-white active:scale-95", status === "live" ? (muted ? "bg-white/20" : "bg-[#2fbf71]") : "glass animate-pulse")}>
            {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>
          <button type="button" onClick={() => stop()} aria-label="Leave voice chat" title="Leave voice chat" className="glass flex size-11 items-center justify-center rounded-full text-white active:scale-95">
            <PhoneOff className="size-5" />
          </button>
        </>
      )}
      <span className="sr-only" role="status">{label}</span>
    </div>
  );
}
