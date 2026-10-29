"use client";

import { useRouter } from "next/navigation";

/** Re-renders the server page (e.g. after a Polar payment, to pick up the new ticket). */
export function LiveRefreshButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>
      {label}
    </button>
  );
}
