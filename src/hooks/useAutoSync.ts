import { useEffect, useRef } from "react";

interface AutoSyncOptions {
  /** Run once immediately on mount (default true) */
  immediate?: boolean;
  /** Interval in ms (default 5 minutes). Set to 0 to disable. */
  intervalMs?: number;
  /** Also sync when the tab regains focus (default true) */
  syncOnFocus?: boolean;
}

/**
 * Triggers a background sync on a schedule (and optionally on focus).
 * Intended to replace manual "Sync" buttons.
 */
export function useAutoSync(
  sync: () => Promise<unknown>,
  { immediate = true, intervalMs = 5 * 60 * 1000, syncOnFocus = true }: AutoSyncOptions = {}
) {
  const inFlightRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await sync();
      } catch (err) {
        // Never let background sync errors crash the app (e.g. transient 503/BOOT_ERROR)
        console.warn('[AutoSync] Background sync failed (will retry on next tick):', err);
      } finally {
        inFlightRef.current = false;
      }
    };

    if (immediate) {
      // fire-and-forget
      void run();
    }

    let timer: number | undefined;
    if (intervalMs && intervalMs > 0) {
      timer = window.setInterval(() => void run(), intervalMs);
    }

    const onFocus = () => {
      if (!syncOnFocus) return;
      void run();
    };

    if (syncOnFocus) {
      window.addEventListener("focus", onFocus);
    }

    return () => {
      if (timer) window.clearInterval(timer);
      if (syncOnFocus) window.removeEventListener("focus", onFocus);
    };
  }, [sync, immediate, intervalMs, syncOnFocus]);
}
