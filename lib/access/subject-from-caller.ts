import type { ResolvedCaller } from "@/lib/auth-api-key";
import { LEGACY_API_KEY_SCOPES } from "./access-scopes";
import type { AccessSubject } from "./types";

export interface SubjectExtras {
  /** Scopes the credential carries. For a delegation, pass the scope its assertion was verified with. */
  scopes?: readonly string[];
  /** OAuth client behind a delegation, when known. */
  clientId?: string | null;
}

/**
 * Builds the policy subject for a resolved caller. Sessions get implicit member scopes; API keys get the
 * legacy member scopes unless narrower ones are given; delegations get only the scopes passed in.
 */
export function subjectFromCaller(caller: ResolvedCaller | null, extra: SubjectExtras = {}): AccessSubject {
  if (!caller) return { userId: null, authType: "anonymous" };
  switch (caller.authType) {
    case "session":
      return { userId: caller.user.id, authType: "session", scopes: extra.scopes };
    case "api_key":
      return { userId: caller.user.id, authType: "api_key", scopes: extra.scopes ?? LEGACY_API_KEY_SCOPES };
    case "delegation":
      return {
        userId: caller.user.id,
        authType: "delegation",
        clientId: extra.clientId ?? null,
        scopes: extra.scopes ?? [],
      };
    default:
      // An unknown credential kind is treated as anonymous (fail closed).
      return { userId: null, authType: "anonymous" };
  }
}
