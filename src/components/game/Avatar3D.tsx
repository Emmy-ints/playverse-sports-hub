import { useEffect, useRef, useState } from "react";
import type { AvatarConfig } from "@/lib/avatar";
import { useGameSettings } from "@/lib/game-settings";
import { AvatarPreview } from "./AvatarPreview";
import type { AvatarViewer } from "@/game/character/avatar-viewer";

/**
 * The player's realistic 3D athlete (drag to turn, tap to celebrate). Shows the 2D preview while the
 * model loads, if WebGL is unavailable, or when Settings → Graphics is Classic.
 */
export function Avatar3D({ config, interactive = false }: { config: AvatarConfig; interactive?: boolean }) {
  const [settings] = useGameSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<AvatarViewer | null>(null);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const realistic = settings.graphics === "realistic" && !failed;

  useEffect(() => {
    if (!realistic || !canvasRef.current) return;
    let cancelled = false;
    let viewer: AvatarViewer | null = null;
    import("@/game/character/avatar-viewer")
      .then(({ createAvatarViewer }) => createAvatarViewer(canvasRef.current!, configRef.current, { interactive }))
      .then((v) => {
        if (cancelled) return v.destroy();
        viewer = v;
        viewerRef.current = v;
        v.set(configRef.current);
        setReady(true);
      })
      .catch((e) => {
        console.warn("[avatar] 3D preview unavailable", e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      viewer?.destroy();
      viewerRef.current = null;
      setReady(false);
    };
  }, [realistic, interactive]);

  useEffect(() => {
    viewerRef.current?.set(config);
  }, [config]);

  return (
    <div className="relative h-full w-full">
      {(!realistic || !ready) && <AvatarPreview config={config} />}
      {realistic && (
        <canvas
          ref={canvasRef}
          onClick={() => viewerRef.current?.celebrate()}
          className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"} ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`}
          aria-label={`3D preview of ${config.nickname}${interactive ? ". Drag to turn, tap to celebrate." : ""}`}
        />
      )}
    </div>
  );
}
