import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin, bearer, deviceAuthorization, emailOTP } from "better-auth/plugins";
import { sendOtpEmail } from "@/lib/resend";
import { getDb, type AppDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getMcpOAuthPlugins, isMcpOAuthEnabled } from "@/lib/mcp-oauth-config";
import { SHARE_REF_COOKIE, recordSignupFromShareRef } from "@/lib/builder-league/attribution";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create or get the Better Auth instance for a specific database connection / request context.
 */
export function getAuth(customDb?: AppDb, options?: { oauthProvider: boolean }) {
  const oauthEnabled = options?.oauthProvider === true && isMcpOAuthEnabled();
  const isBuildTime = process.env.NEXT_PHASE === "phase-production-build";
  const isDevOrTest = isBuildTime || process.env.NODE_ENV !== "production";

  let secret = process.env.BETTER_AUTH_SECRET;
  let baseUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://nextlevelbuilder.io";
  let githubClientId = process.env.GITHUB_CLIENT_ID;
  let githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  let googleClientId = process.env.GOOGLE_CLIENT_ID;
  let googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    const cf = getCloudflareContext();
    if (cf && cf.env) {
      const cfEnv = cf.env as unknown as Record<string, string | undefined>;
      if (cfEnv.BETTER_AUTH_SECRET) secret = cfEnv.BETTER_AUTH_SECRET;
      if (cfEnv.BETTER_AUTH_URL) {
        baseUrl = cfEnv.BETTER_AUTH_URL;
      } else if (cfEnv.NEXT_PUBLIC_APP_URL) {
        baseUrl = cfEnv.NEXT_PUBLIC_APP_URL;
      }
      if (cfEnv.GITHUB_CLIENT_ID) githubClientId = cfEnv.GITHUB_CLIENT_ID;
      if (cfEnv.GITHUB_CLIENT_SECRET) githubClientSecret = cfEnv.GITHUB_CLIENT_SECRET;
      if (cfEnv.GOOGLE_CLIENT_ID) googleClientId = cfEnv.GOOGLE_CLIENT_ID;
      if (cfEnv.GOOGLE_CLIENT_SECRET) googleClientSecret = cfEnv.GOOGLE_CLIENT_SECRET;
    }
  } catch {
    // Outside Cloudflare Workers runtime (build, tests, Node)
  }

  // During build time and local testing, allow dev test key; in production throw if missing
  if (!secret) {
    if (isDevOrTest) {
      secret = "dev-test-secret-do-not-use-in-production-min-32-chars-long";
    } else {
      throw new Error("BETTER_AUTH_SECRET is required in production environment.");
    }
  }

  const db = customDb || getDb();

  return betterAuth({
    secret,
    baseURL: baseUrl,
    trustedOrigins: [
      baseUrl,
      ...(baseUrl === "https://nextlevelbuilder.io"
        ? ["https://www.nextlevelbuilder.io"]
        : []),
      ...(isDevOrTest ? ["http://localhost:3000"] : []),
    ],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        organization: schema.organizations,
        member: schema.members,
        invitation: schema.invitations,
        ...(oauthEnabled ? {
          oauthClient: schema.oauthClients,
          oauthResource: schema.oauthResources,
          oauthClientResource: schema.oauthClientResources,
          oauthAccessToken: schema.oauthAccessTokens,
          oauthRefreshToken: schema.oauthRefreshTokens,
          oauthConsent: schema.oauthConsents,
          oauthClientAssertion: schema.oauthClientAssertions,
          jwks: schema.jwksKeys,
        } : {}),
      },
    }),
    emailAndPassword: {
      enabled: false,
    },
    databaseHooks: {
      user: {
        create: {
          // Builder League share attribution; a no-op without the share cookie, never blocks signup.
          after: async (user, context) => {
            await recordSignupFromShareRef(db, user.id, context?.getCookie(SHARE_REF_COOKIE));
          },
        },
      },
    },
    socialProviders: {
      ...(githubClientId && githubClientSecret
        ? {
            github: {
              clientId: githubClientId,
              clientSecret: githubClientSecret,
            },
          }
        : {}),
      ...(googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {}),
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          await sendOtpEmail({ email, otp, type });
        },
      }),
      organization({
        allowUserToCreateOrganization: true,
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
      bearer(),
      deviceAuthorization(),
      ...(oauthEnabled ? getMcpOAuthPlugins() : []),
    ],
  });
}

// Provider initialization seeds OAuth resources. Keep ordinary API session checks independent.
export function getOAuthAuth(customDb?: AppDb) {
  return getAuth(customDb, { oauthProvider: true });
}

// Lazy proxy for auth to prevent eager module-level cold-start execution on Workers
export const auth = new Proxy({} as any, {
  get(_target, prop) {
    const instance = getAuth();
    const value = (instance as any)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
