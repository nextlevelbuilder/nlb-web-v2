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
  session?: any;
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
  }: {
    userId: string;
    name: string;
    organizationId?: string;
    expiresDays?: number;
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
 */
export async function resolveCaller(
  headers: Headers,
  customDb?: AppDb,
  delegation?: McpDelegationContext,
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
        return {
          user: verified.user,
          apiKeyId: verified.apiKey.id,
          apiKeyOrganizationId: verified.apiKey.organizationId,
          authType: "api_key",
        };
      }
    } catch (err) {
      console.warn("API key verification error:", err);
    }
  }

  return null;
}
