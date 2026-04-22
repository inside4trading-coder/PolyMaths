import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Converts unhandled errors into user-visible toasts instead of blank screens.
 */
export function GlobalErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // Avoid spamming; keep message short.
      const msg = event?.error?.message || event.message || "Unexpected error";
      console.error("[GlobalErrorListener] window.error:", event.error || event);
      toast.error("App error", { description: msg });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = (event as any)?.reason;
      const msg = reason?.message || String(reason || "Unhandled rejection");
      console.error("[GlobalErrorListener] unhandledrejection:", reason);
      toast.error("Request failed", { description: msg });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
