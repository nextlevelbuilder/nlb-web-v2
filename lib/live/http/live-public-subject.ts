import type { AccessSubject } from "@/lib/access/types";

/**
 * Subject for public Live reads whose answer must not depend on the viewer (event list and detail).
 * `authorize()` resolves the public `live:event` read rule for it without touching the database.
 */
export const ANONYMOUS_SUBJECT: AccessSubject = Object.freeze({ userId: null, authType: "anonymous" });
