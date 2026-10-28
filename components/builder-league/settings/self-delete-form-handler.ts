/**
 * Server-side handling of the "Delete my Builder League data" form on the settings page. Kept apart from
 * the server action so it can be tested without a request context: the action resolves the session
 * viewer, this runs the deletion and maps failures to the error keys the page knows how to show.
 */
import type { AppDb } from "@/lib/db";
import { BuilderApiError, enforceUserRateLimit } from "@/lib/builder-league/http";
import { deleteOwnBuilderData, type PrivacyBucket } from "@/lib/builder-league/privacy-requests";

export const SELF_DELETE_ERRORS = ["confirm", "admin", "rate", "storage", "failed"] as const;
export type SelfDeleteError = (typeof SELF_DELETE_ERRORS)[number];

export type SelfDeleteOutcome = { ok: true; nothingToDo: boolean } | { ok: false; error: SelfDeleteError };

export function isSelfDeleteError(value: unknown): value is SelfDeleteError {
  return typeof value === "string" && (SELF_DELETE_ERRORS as readonly string[]).includes(value);
}

const ERROR_BY_CODE: Record<string, SelfDeleteError> = {
  confirmation_mismatch: "confirm",
  admin_self_delete: "admin",
  rate_limited: "rate",
  storage_delete_failed: "storage",
};

/**
 * Deletes the signed-in member's own league data from the posted form. The caller must pass the viewer
 * resolved from the session cookie, never an id taken from the form.
 */
export async function handleSelfDeleteForm(
  db: AppDb,
  viewer: { userId: string; isAdmin: boolean },
  formData: FormData,
  options: { bucket?: PrivacyBucket } = {}
): Promise<SelfDeleteOutcome> {
  const raw = formData.get("confirm");
  const confirm = typeof raw === "string" ? raw.trim() : null;
  try {
    enforceUserRateLimit(viewer.userId, "builder-privacy-self");
    const result = await deleteOwnBuilderData(db, { userId: viewer.userId, isAdmin: viewer.isAdmin, confirm, bucket: options.bucket });
    return { ok: true, nothingToDo: result.nothingToDo };
  } catch (err) {
    if (err instanceof BuilderApiError && ERROR_BY_CODE[err.code]) return { ok: false, error: ERROR_BY_CODE[err.code] };
    console.error("builder privacy: self-service delete failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "failed" };
  }
}
