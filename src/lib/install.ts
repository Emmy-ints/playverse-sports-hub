/** Installable app support: service worker registration and the browser's install prompt. */
import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let started = false;

export function startInstallSupport() {
  if (started || typeof window === "undefined") return;
  started = true;
  if ("serviceWorker" in navigator && window.isSecureContext && window.self === window.top) {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[pwa] service worker not registered", e));
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

const snapshot = () => (installed || isStandalone() ? "installed" : deferred ? "available" : "unavailable");
export function useInstallState(): "installed" | "available" | "unavailable" {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), snapshot, () => "unavailable");
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  emit();
  return outcome === "accepted";
}
