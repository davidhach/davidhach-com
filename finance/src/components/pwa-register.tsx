"use client";
import { useEffect } from "react";

/**
 * Registers the service worker once on mount. Silent on failure — service
 * workers are an enhancement, not a blocker.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // skip in dev to avoid stale chunk caching
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
