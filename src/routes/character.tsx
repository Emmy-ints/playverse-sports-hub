import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Dices, RotateCcw, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AvatarPreview } from "@/components/game/AvatarPreview";
import { GameButton } from "@/components/game/GameButton";
import { GlassPanel } from "@/components/game/GlassPanel";
import { Logo } from "@/components/game/Logo";
import {
  ACCESSORIES,
  avatarConfigSchema,
  avatarStore,
  DEFAULT_AVATAR,
  FACES,
  GENDER_PRESENTATIONS,
  HAIR_COLORS,
  HAIRSTYLES,
  KIT_COLORS,
  OUTFITS,
  SHOES,
  SKIN_TONES,
  type AvatarConfig,
} from "@/lib/avatar";
import { useMyProfile } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/character")({
  head: () => ({
    meta: [
      { title: "Character studio — PLAYVERSE" },
      { name: "description", content: "Create and customize your PLAYVERSE player." },
      { property: "og:title", content: "Character studio — PLAYVERSE" },
      { property: "og:description", content: "Create and customize your PLAYVERSE player." },
    ],
  }),
  component: CharacterStudio,
});

const TABS = ["Body", "Hair", "Kit", "Extras"] as const;
type Tab = (typeof TABS)[number];

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");

function randomAvatar(nickname: string): AvatarConfig {
  return {
    version: 1,
    nickname,
    genderPresentation: pick(GENDER_PRESENTATIONS),
    skinTone: pick(SKIN_TONES),
    face: pick(FACES),
    hairstyle: pick(HAIRSTYLES),
    hairColor: pick(HAIR_COLORS),
    outfit: pick(OUTFITS),
    outfitColor: pick(KIT_COLORS),
    shoes: pick(SHOES),
    shoeColor: pick(KIT_COLORS),
    accessory: pick(ACCESSORIES),
  };
}

function CharacterStudio() {
  const localSaved = avatarStore.useValue();
  const { profile } = useMyProfile();
  const saved = profile?.avatar_config ?? localSaved;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AvatarConfig>(saved ?? DEFAULT_AVATAR);
  const [tab, setTab] = useState<Tab>("Body");
  const [error, setError] = useState<string | null>(null);

  // localStorage is read after hydration; adopt the saved character once it appears.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current) return;
    if (saved) {
      setDraft(saved);
      adopted.current = true;
    } else if (profile) {
      setDraft((d) => ({ ...d, nickname: profile.username }));
      adopted.current = true;
    }
  }, [saved, profile]);

  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const result = avatarConfigSchema.safeParse({ ...draft, nickname: draft.nickname.trim() });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check your character details");
      setTab("Extras");
      return;
    }
    avatarStore.write(result.data);
    const sb = getSupabase();
    if (profile && sb) {
      setSaving(true);
      const { error: dbError } = await sb
        .from("profiles")
        .update({ avatar_config: result.data, display_name: result.data.nickname })
        .eq("id", profile.id);
      setSaving(false);
      if (dbError) {
        setError("Couldn't save to your account. Check your connection and try again.");
        setTab("Extras");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["my-profile"] });
    }
    navigate({ to: "/hub" });
  };

  return (
    <div className="min-h-dvh pb-safe pt-safe">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to={saved ? "/hub" : "/"} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        <Logo />
        <span className="w-14" aria-hidden />
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <section aria-label="Character preview" className="lg:sticky lg:top-6 lg:self-start">
          <GlassPanel className="relative flex h-80 flex-col items-center justify-center overflow-hidden sm:h-[28rem]">
            <div aria-hidden className="absolute inset-x-10 bottom-6 h-10 rounded-full bg-primary/25 blur-2xl" />
            <div className="h-full w-full max-w-64">
              <AvatarPreview config={draft} />
            </div>
          </GlassPanel>
          <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            2D preview · 3D character viewer coming later
          </p>
          <p className="mt-3 text-center font-display text-3xl font-black uppercase">{draft.nickname || "—"}</p>
        </section>

        <section aria-label="Customize" className="min-w-0">
          <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-accent">Character studio</p>
          <h1 className="font-display text-4xl font-black uppercase leading-none sm:text-5xl">Build your player</h1>

          <div role="tablist" aria-label="Customization sections" className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "h-10 shrink-0 rounded-xl px-4 font-display text-base font-bold uppercase tracking-wider transition-colors",
                  tab === t ? "bg-gradient-primary text-primary-foreground shadow-glow" : "glass text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <GlassPanel className="mt-4 space-y-6" role="tabpanel">
            {tab === "Body" && (
              <>
                <OptionRow title="Presentation" options={GENDER_PRESENTATIONS} value={draft.genderPresentation} onChange={(v) => set("genderPresentation", v)} />
                <SwatchRow title="Skin tone" options={SKIN_TONES} value={draft.skinTone} onChange={(v) => set("skinTone", v)} />
                <OptionRow title="Face" options={FACES} value={draft.face} onChange={(v) => set("face", v)} />
              </>
            )}
            {tab === "Hair" && (
              <>
                <OptionRow title="Hairstyle" options={HAIRSTYLES} value={draft.hairstyle} onChange={(v) => set("hairstyle", v)} />
                <SwatchRow title="Hair colour" options={HAIR_COLORS} value={draft.hairColor} onChange={(v) => set("hairColor", v)} />
              </>
            )}
            {tab === "Kit" && (
              <>
                <OptionRow title="Clothing" options={OUTFITS} value={draft.outfit} onChange={(v) => set("outfit", v)} />
                <SwatchRow title="Clothing colour" options={KIT_COLORS} value={draft.outfitColor} onChange={(v) => set("outfitColor", v)} />
                <OptionRow title="Shoes" options={SHOES} value={draft.shoes} onChange={(v) => set("shoes", v)} />
                <SwatchRow title="Shoe colour" options={KIT_COLORS} value={draft.shoeColor} onChange={(v) => set("shoeColor", v)} />
              </>
            )}
            {tab === "Extras" && (
              <>
                <OptionRow title="Accessory" options={ACCESSORIES} value={draft.accessory} onChange={(v) => set("accessory", v)} />
                <div>
                  <label htmlFor="nickname" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Nickname
                  </label>
                  <input
                    id="nickname"
                    value={draft.nickname}
                    maxLength={16}
                    autoComplete="off"
                    onChange={(e) => {
                      setError(null);
                      set("nickname", e.target.value);
                    }}
                    aria-invalid={!!error}
                    aria-describedby="nickname-help"
                    className={cn(
                      "h-12 w-full rounded-xl border border-input bg-navy-deep/60 px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/30",
                      error && "border-destructive",
                    )}
                  />
                  <p id="nickname-help" className={cn("mt-1 text-sm", error ? "text-destructive" : "text-muted-foreground")}>
                    {error ?? "3–16 letters, numbers or underscores."}
                  </p>
                </div>
              </>
            )}
          </GlassPanel>

          <div className="mt-5 flex flex-wrap gap-3">
            <GameButton variant="hot" size="lg" onClick={save} disabled={saving}>
              <Save aria-hidden /> {saving ? "Saving…" : "Save player"}
            </GameButton>
            <GameButton variant="glass" size="lg" onClick={() => setDraft(randomAvatar(draft.nickname))}>
              <Dices aria-hidden /> Randomize
            </GameButton>
            <GameButton variant="ghost" size="lg" onClick={() => setDraft({ ...DEFAULT_AVATAR, nickname: draft.nickname })}>
              <RotateCcw aria-hidden /> Reset
            </GameButton>
          </div>
        </section>
      </div>
    </div>
  );
}

function OptionRow<T extends string>({ title, options, value, onChange }: { title: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "h-10 rounded-xl px-4 text-sm font-semibold transition-all active:scale-95",
              value === o ? "bg-primary text-primary-foreground shadow-glow" : "bg-secondary text-foreground hover:bg-muted",
            )}
          >
            {label(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SwatchRow<T extends string>({ title, options, value, onChange }: { title: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</legend>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            aria-label={`${title} option ${i + 1}`}
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "size-10 rounded-full border-2 transition-transform active:scale-90",
              value === o ? "scale-110 border-foreground ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border hover:scale-105",
            )}
            style={{ backgroundColor: o }}
          />
        ))}
      </div>
    </fieldset>
  );
}
