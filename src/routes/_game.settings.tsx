import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/game/PageShell";
import { GameSettingsPanel } from "@/components/game/GameSurface";
import { GlassPanel } from "@/components/game/GlassPanel";
import { GameButton } from "@/components/game/GameButton";
import { Switch } from "@/components/ui/switch";
import { settingsStore, type Settings } from "@/lib/settings";
import { avatarStore } from "@/lib/avatar";
import { guestStore } from "@/lib/guest-profile";
import { authService } from "@/lib/auth-service";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_game/settings")({
  head: () => ({ meta: [{ title: "Settings — PLAYVERSE" }, { name: "description", content: "Sound, motion and data settings." }, { property: "og:title", content: "Settings — PLAYVERSE" }, { property: "og:description", content: "Sound, motion and data settings." }] }),
  component: SettingsPage,
});

const LABELS: Record<keyof Settings, string> = { sound: "Sound effects", music: "Music", haptics: "Vibration", reducedMotion: "Reduce motion" };

function SettingsPage() {
  const s = settingsStore.useValue();
  return (
    <PageShell title="Settings" description="Saved on this device.">
      <GlassPanel className="space-y-4">
        {(Object.keys(LABELS) as (keyof Settings)[]).map((k) => (
          <label key={k} className="flex items-center justify-between font-semibold">{LABELS[k]}
            <Switch checked={s[k]} onCheckedChange={(v) => settingsStore.write({ ...s, [k]: v })} />
          </label>
        ))}
      </GlassPanel>
      <GlassPanel className="mt-6">
        <h2 className="mb-1 text-2xl font-bold uppercase">Controls & camera</h2>
        <p className="mb-4 text-sm text-muted-foreground">Used in every game. You can also change these during a match with the gear button.</p>
        <GameSettingsPanel />
      </GlassPanel>
      <AccountPanel />
      <GameButton variant="glass" className="mt-6" onClick={() => { if (confirm("Delete your guest character and progress on this device?")) { avatarStore.clear(); guestStore.clear(); } }}>Reset guest data</GameButton>
    </PageShell>
  );
}

function AccountPanel() {
  const { status, session } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") return null;
  return (
    <GlassPanel className="mt-6">
      <h2 className="text-2xl font-bold uppercase">Account</h2>
      {status === "signed_in" ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as {session?.user.email}</p>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <GameButton asChild variant="glass"><Link to="/reset-password">Change password</Link></GameButton>
            <GameButton
              variant="hot"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await authService.signOut();
                setBusy(false);
                if (!res.ok) return setError(res.message);
                qc.clear();
                navigate({ to: "/" });
              }}
            >
              {busy ? "Signing out…" : "Sign out"}
            </GameButton>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">You're playing as a guest. Progress is saved on this device only.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <GameButton asChild variant="hot"><Link to="/register">Create account</Link></GameButton>
            <GameButton asChild variant="glass"><Link to="/login">Log in</Link></GameButton>
          </div>
        </>
      )}
    </GlassPanel>
  );
}
