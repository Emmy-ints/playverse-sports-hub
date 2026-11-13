import { Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";
import { useTouchMode } from "@/lib/input-mode";
import { cn } from "@/lib/utils";

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

function isFull() {
  const d = document as FsDoc;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/**
 * Full-screen toggle for phones and tablets (hides the browser bars so the game gets the whole
 * screen). Optionally locks to landscape for games that play best sideways. Hidden where the
 * browser can't do it (e.g. iPhone Safari — there, "Add to Home Screen" gives full screen).
 */
export function FullscreenButton({ landscape = false, className }: { landscape?: boolean; className?: string }) {
  const touch = useTouchMode();
  const [supported, setSupported] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const el = document.documentElement as FsEl;
    setSupported(!!(el.requestFullscreen ?? el.webkitRequestFullscreen));
    const on = () => setFull(isFull());
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
    };
  }, []);
  // Leaving the game leaves full screen too.
  useEffect(() => () => {
    if (isFull()) void (document.exitFullscreen?.() ?? (document as FsDoc).webkitExitFullscreen?.())?.catch?.(() => {});
  }, []);
  if (!supported || !touch) return null;
  const toggle = async () => {
    try {
      if (isFull()) {
        await (document.exitFullscreen?.() ?? (document as FsDoc).webkitExitFullscreen?.());
        return;
      }
      const el = document.documentElement as FsEl;
      await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
      if (landscape) await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape").catch(() => {});
    } catch {
      /* the browser said no; nothing to do */
    }
  };
  return (
    <button type="button" onClick={toggle} className={cn("glass pointer-events-auto rounded-full p-2 text-white", className)} aria-label={full ? "Exit full screen" : "Full screen"}>
      {full ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
    </button>
  );
}
