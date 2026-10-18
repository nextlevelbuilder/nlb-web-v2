"use client";

import { useEffect } from "react";

/**
 * Counts a visit to a shared Year in Review once per page view. Browsers that send Do Not Track or
 * Global Privacy Control are never counted and get no cookie.
 */
export default function ShareVisitBeacon({ token }: { token: string }) {
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
    const dnt = nav.doNotTrack === "1" || nav.msDoNotTrack === "1" || (window as Window & { doNotTrack?: string }).doNotTrack === "1";
    if (dnt || nav.globalPrivacyControl === true) return;
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const value = params.get(key);
      if (value) utm[key] = value;
    }
    void fetch("/api/v1/builder-wrapped/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, utm }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  }, [token]);
  return null;
}
