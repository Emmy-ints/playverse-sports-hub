import { useSyncExternalStore } from "react";

/** Tiny typed localStorage store, SSR-safe (server + first client render use the fallback). */
export function createLocalStore<T>(key: string, fallback: T, parse: (raw: unknown) => T | null) {
  const listeners = new Set<() => void>();
  let cacheRaw: string | null | undefined;
  let cacheVal: T = fallback;

  function read(): T {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw === cacheRaw) return cacheVal;
    cacheRaw = raw;
    try {
      cacheVal = raw ? (parse(JSON.parse(raw)) ?? fallback) : fallback;
    } catch {
      cacheVal = fallback;
    }
    return cacheVal;
  }
  function write(value: T) {
    window.localStorage.setItem(key, JSON.stringify(value));
    listeners.forEach((l) => l());
  }
  function clear() {
    window.localStorage.removeItem(key);
    listeners.forEach((l) => l());
  }
  function subscribe(l: () => void) {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => e.key === key && l();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }
  function useValue(): T {
    return useSyncExternalStore(subscribe, read, () => fallback);
  }
  return { read, write, clear, useValue, key };
}
