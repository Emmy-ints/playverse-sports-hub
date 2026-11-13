import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { GlassPanel } from "@/components/game/GlassPanel";
import { GameButton } from "@/components/game/GameButton";
import { Switch } from "@/components/ui/switch";
import { settingsStore, type Settings } from "@/lib/settings";
import { avatarStore } from "@/lib/avatar";
import { guestStore } from "@/lib/guest-profile";

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
      <GameButton variant="glass" className="mt-6" onClick={() => { if (confirm("Delete your guest character and progress on this device?")) { avatarStore.clear(); guestStore.clear(); } }}>Reset guest data</GameButton>
    </PageShell>
  );
}
