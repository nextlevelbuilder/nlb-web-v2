import { getDb, type AppDb } from "@/lib/db";
import { apiKeys, users } from "@/lib/db/schema";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import crypto from "crypto";
import { MCP_ASSERTION_HEADER, verifyMcpDelegation, type McpDelegationContext } from "@/lib/auth-mcp-delegation";

export interface ResolvedCaller {
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
    image?: string | null;
    emailVerified: boolean;
  };
  authType: "session" | "api_key" | "delegation";
  apiKeyId?: string;
  apiKeyOrganizationId?: string | null;
  /** Scopes bound to the API key; `null` for a full key (the default). Only set when `authType` is `api_key`. */
  apiKeyScopes?: ApiKeyScope[] | null;
  session?: any;
}

/**
 * Narrow scopes an admin can bind an API key to, for machine callers that must not hold a full key:
 * - `builder:render`: the Year in Review render worker (`/api/v1/builder-admin/render-jobs/**`).
 * - `builder:ingest`: the Discord bot (`/api/v1/builder-admin/ingest/discord`).
 *
 * A scoped key authenticates only on a route that asks for one of its scopes; everywhere else it is
 * treated as no credential at all. Keys minted without scopes keep working as full keys.
 */
export const API_KEY_SCOPES = ["builder:render", "builder:ingest"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ResolveCallerOptions {
  /** The narrow scope this route accepts. Without it, scoped keys never authenticate. */
  apiKeyScope?: ApiKeyScope;
}

function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === "string" && (API_KEY_SCOPES as readonly string[]).includes(value);
}

/**
 * Reads the scopes stored in `api_keys.permissions`. Scoped keys store a JSON array of scope names.
 * A missing value, a blank string and the object shape older Better Auth rows may carry mean a full
 * key, which keeps those keys working as before. Anything else fails closed and the key authenticates
 * nowhere: unparseable text, a non-string or unknown entry, and an empty array `[]` (a key scoped to
 * nothing, never a full key).
 */
export function parseApiKeyScopes(permissions: string | null | undefined): ApiKeyScope[] | null {
  if (permissions == null || permissions.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(permissions);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed.every(isApiKeyScope) ? parsed : [];
  if (parsed && typeof parsed === "object") return null;
  return [];
}

/**
 * Hash raw API key with SHA-256 for secure storage.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Generate a cryptographically secure API key for a user.
 */
export async function createApiKeyForUser(
  {
    userId,
    name,
    organizationId,
    expiresDays,
    scopes,
  }: {
    userId: string;
    name: string;
    organizationId?: string;
    expiresDays?: number;
    /** Binds the key to these narrow scopes. Omit for a full key. Callers must check the user is an admin. */
    scopes?: readonly ApiKeyScope[];
  },
  customDb?: AppDb
) {
  const db = customDb || getDb();

  // Format: nlb_live_<48-hex-chars>
  const randomEntropy = crypto.randomBytes(24).toString("hex");
  const rawKey = `nlb_live_${randomEntropy}`;
  const hashedKey = hashApiKey(rawKey);
  const prefix = `nlb_live_${randomEntropy.slice(0, 4)}...`;
  const start = rawKey.slice(0, 15);

  const expiresAt = expiresDays
    ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
    : null;

  const id = crypto.randomUUID();
  const scopeList = scopes?.length ? [...new Set(scopes)] : null;
  if (scopeList && !scopeList.every(isApiKeyScope)) throw new Error("Unknown API key scope");

  const [record] = await db
    .insert(apiKeys)
    .values({
      id,
      name,
      prefix,
      start,
      key: hashedKey,
      userId,
      organizationId: organizationId || null,
      permissions: scopeList ? JSON.stringify(scopeList) : null,
      enabled: true,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return {
    rawKey,
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    start: record.start,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    scopes: scopeList,
  };
}

/**
 * Whether a user's ban is in force: banned with no expiry, or an expiry still in the future. Every
 * credential type (session, API key, MCP delegation) refuses a banned user, whichever way the ban was
 * written.
 */
export function isBanActive(user: { banned?: boolean | null; banExpires?: Date | string | null }, now = new Date()): boolean {
  if (!user.banned) return false;
  if (!user.banExpires) return true;
  return new Date(user.banExpires).getTime() > now.getTime();
}

/**
 * Verify a raw API key against stored hashed keys in database.
 */
export async function verifyApiKey(rawKey: string, customDb?: AppDb) {
  if (!rawKey || !rawKey.startsWith("nlb_live_")) {
    return null;
  }

  const db = customDb || getDb();
  const hashedKey = hashApiKey(rawKey);
  const now = new Date();

  const [keyRecord] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.key, hashedKey),
        eq(apiKeys.enabled, true),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))
      )
    )
    .limit(1);

  if (!keyRecord || !keyRecord.userId) {
    return null;
  }

  // Fetch associated user
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      image: users.image,
      emailVerified: users.emailVerified,
      banned: users.banned,
      banExpires: users.banExpires,
    })
    .from(users)
    .where(eq(users.id, keyRecord.userId))
    .limit(1);

  if (!user || isBanActive(user)) {
    return null;
  }

  const { banned: _banned, banExpires: _banExpires, ...publicUser } = user;
  return {
    user: publicUser,
    apiKey: keyRecord,
  };
}

/**
 * Resolve a Better Auth session, API key, or explicitly opted-in MCP delegation.
 * Compatible with REST API routes, @nextlevelbuilder/cli, and @nextlevelbuilder/mcp.
 *
 * A scoped API key resolves only when `options.apiKeyScope` is one of its scopes; full keys always
 * resolve, so a route that needs a scope must still check `apiKeyScopes` itself.
 */
export async function resolveCaller(
  headers: Headers,
  customDb?: AppDb,
  delegation?: McpDelegationContext,
  options: ResolveCallerOptions = {},
): Promise<ResolvedCaller | null> {
  if (headers.has(MCP_ASSERTION_HEADER)) {
    if (!delegation) return null;
    const userId = await verifyMcpDelegation(headers.get(MCP_ASSERTION_HEADER)!, delegation);
    if (!userId) return null;
    try {
      const db = customDb || getDb();
      const [user] = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        image: users.image,
        emailVerified: users.emailVerified,
        banned: users.banned,
        banExpires: users.banExpires,
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user || isBanActive(user)) {
        return null;
      }
      return {
        user: { id: user.id, name: user.name, email: user.email, role: user.role,
          image: user.image, emailVerified: user.emailVerified },
        authType: "delegation",
      };
    } catch {
      return null;
    }
  }
  // 1. Try Better Auth Session first
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers });
    if (session && session.user) {
      // A banned user's surviving session (ban written outside Better Auth's banUser) is refused too.
      if (isBanActive(session.user as { banned?: boolean | null; banExpires?: Date | string | null })) return null;
      return {
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: (session.user as any).role || "user",
          image: session.user.image,
          emailVerified: session.user.emailVerified,
        },
        session: session.session,
        authType: "session",
      };
    }
  } catch {
    // Fall through to API Key check
  }

  // 2. Try Authorization Bearer / x-api-key
  const authHeader = headers.get("authorization") || headers.get("Authorization");
  const xApiKey = headers.get("x-api-key");

  let tokenCandidate: string | null = null;

  if (xApiKey && xApiKey.startsWith("nlb_live_")) {
    tokenCandidate = xApiKey.trim();
  } else if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(nlb_live_[a-zA-Z0-9_]+)$/i);
    if (match) {
      tokenCandidate = match[1];
    }
  }

  if (tokenCandidate) {
    try {
      const verified = await verifyApiKey(tokenCandidate, customDb);
      if (verified && verified.user) {
        const scopes = parseApiKeyScopes(verified.apiKey.permissions);
        if (scopes && !(options.apiKeyScope && scopes.includes(options.apiKeyScope))) return null;
        return {
          user: verified.user,
          apiKeyId: verified.apiKey.id,
          apiKeyOrganizationId: verified.apiKey.organizationId,
          apiKeyScopes: scopes,
          authType: "api_key",
        };
      }
    } catch (err) {
      console.warn("API key verification error:", err);
    }
  }

  return null;
}
