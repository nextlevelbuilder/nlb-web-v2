import { DISCORD_INVITE_URL as DISCORD_INVITE_URL_FALLBACK } from "@/lib/constants/socials";
import { z } from "zod";

// Custom UUID validator that rejects placeholder UUIDs
const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";

// Check if we're in build mode (Next.js build process) or running on client-side
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build";
const isClient = typeof window !== "undefined";

// For development/build: use optional with defaults
// For production: validate properly (but still allow defaults for now)
const isDev = process.env.NODE_ENV !== "production";

// Always use optional with defaults - validate at runtime in production only
const validUUID = z.string().optional().default(PLACEHOLDER_UUID);

// Always use optional with defaults - validate at runtime in production only
const requiredString = (_fieldName: string) =>
  z.string().optional().default("");

const envSchema = z.object({
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_PROJECT_ID: z.string().regex(/^\d+$/).or(z.literal("")).optional(),
  POSTHOG_HOST: z.string().url().or(z.literal("")).optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().or(z.literal("")).optional(),
  CLICKHOUSE_URL: z.string().url().or(z.literal("")).optional(),
  CLICKHOUSE_DATABASE: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).or(z.literal("")).optional(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  TRAFFIC_HASH_SECRET: z.string().min(32).or(z.literal("")).optional(),

  // Polar.sh
  POLAR_ACCESS_TOKEN: requiredString("POLAR_ACCESS_TOKEN"),
  POLAR_ORG_ID: validUUID,
  POLAR_ORG_SLUG: requiredString("POLAR_ORG_SLUG"),
  POLAR_WEBHOOK_SECRET: z.string().optional().default(""),
  // "sandbox" targets sandbox-api.polar.sh; anything else (including unset) is production.
  POLAR_SERVER: z
    .string()
    .optional()
    .transform((value): "sandbox" | "production" => (value === "sandbox" ? "sandbox" : "production")),

  // Early-bird annual memberships: no longer sold, but still counted for entitlement.
  POLAR_PRODUCT_PREMIUM_EARLYBIRD_ANNUAL: z.string().optional().default(""),
  POLAR_PRODUCT_VIP_EARLYBIRD_ANNUAL: z.string().optional().default(""),

  // Post-checkout onboarding. Read per request through lib/onboarding/flags.ts; declared here for validation.
  ONBOARDING_V2_ENABLED: z.string().optional(),
  MEMBERSHIP_PAST_DUE_GRACE_DAYS: z.string().regex(/^\d+$/).or(z.literal("")).optional(),
  ONBOARDING_ENCRYPTION_KEY: z.string().optional(),
  LARK_ADMIN_WEBHOOK_URL: z.string().url().or(z.literal("")).optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_VIP_ROLE_ID: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_GROUP_CHAT_ID: z.string().optional(),

  // Polar.sh Product IDs - Premium Package
  POLAR_PRODUCT_PREMIUM_QUARTERLY: validUUID.default("c73457af-f2e7-4cda-a216-7c32f66e0b81"),
  POLAR_PRODUCT_PREMIUM_ANNUAL: validUUID.default("66b227b9-d3a4-41d3-9746-2705b2a1fbcd"),

  // Polar.sh Product IDs - VIP Package
  POLAR_PRODUCT_VIP_QUARTERLY: validUUID.default("2d1479ff-7fae-4222-82d3-1ae85d345539"),
  POLAR_PRODUCT_VIP_ANNUAL: validUUID.default("a5d4199f-6ffe-47f0-ac21-2b5e8b9bd255"),

  // Polar.sh Product IDs - Directory Submissions
  POLAR_PRODUCT_DIRECTORY_EARLY_BIRD: validUUID.default("d216882e-2975-4d0e-85c2-795bd35c5964"),
  POLAR_PRODUCT_DIRECTORY_STANDARD: validUUID.default("d09bcf17-d65d-4a82-ab66-77458d4fa582"),

  // Resend
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_FROM_EMAIL: z.string().email().optional().default("hi@nextlevelbuilder.io"),

  // LarkSuite Forms
  FORM01_LARK_URL: z.string().url().optional().default("https://example.com/form01"),

  // Discord
  DISCORD_INVITE_URL: z.string().url().optional().default(DISCORD_INVITE_URL_FALLBACK),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_PREMIUM_ROLE_ID: z.string().optional(),
  DISCORD_SALES_WEBHOOK_URL: z.string().url().optional(),
  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  MCP_OAUTH_ENABLED: z.enum(["true", "false"]).optional().default("false"),
  MCP_OAUTH_RESOURCE: z.string().url().optional().default("https://mcp.nextlevelbuilder.io/mcp"),
  MCP_DELEGATION_SECRET: z.string().min(32).optional(),

  // Builder League feature flag ("true" | "false"). Optional: a missing value means off.
  BUILDER_LEAGUE_ENABLED: z.enum(["true", "false"]).optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default("http://localhost:3000"),

  // Premium Package (Client-side)
  NEXT_PUBLIC_POLAR_PRODUCT_PREMIUM_QUARTERLY: validUUID.default(
    "c73457af-f2e7-4cda-a216-7c32f66e0b81",
  ),
  NEXT_PUBLIC_POLAR_PRODUCT_PREMIUM_ANNUAL: validUUID.default(
    "66b227b9-d3a4-41d3-9746-2705b2a1fbcd",
  ),

  // VIP Package (Client-side)
  NEXT_PUBLIC_POLAR_PRODUCT_VIP_QUARTERLY: validUUID.default(
    "2d1479ff-7fae-4222-82d3-1ae85d345539",
  ),
  NEXT_PUBLIC_POLAR_PRODUCT_VIP_ANNUAL: validUUID.default(
    "a5d4199f-6ffe-47f0-ac21-2b5e8b9bd255",
  ),

  // Directory Submissions (Client-side)
  NEXT_PUBLIC_POLAR_PRODUCT_DIRECTORY_EARLY_BIRD: validUUID.default("d216882e-2975-4d0e-85c2-795bd35c5964"),
  NEXT_PUBLIC_POLAR_PRODUCT_DIRECTORY_STANDARD: validUUID.default("d09bcf17-d65d-4a82-ab66-77458d4fa582"),

  NEXT_PUBLIC_DISCORD_URL: z.string().url().optional().default(DISCORD_INVITE_URL_FALLBACK),
});

// Parse and validate environment variables
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("\n❌ Environment validation failed!\n");
    console.error("The following environment variables have issues:\n");

    error.errors.forEach((err) => {
      const path = err.path.join(".");
      console.error(`  • ${path}: ${err.message}`);
    });

    console.error("\nPlease check your .env file and ensure all required environment variables are set correctly.");
    console.error("See .env.example for reference.\n");

    // In production runtime (not build time, not client-side), fail fast
    if (process.env.NODE_ENV === "production" && !isBuildTime && !isClient) {
      process.exit(1);
    }
  }
  throw error;
}

// Additional startup validation (skip during build and client-side)
function validateStartup() {
  // Skip validation during build time or on client-side
  if (isBuildTime) {
    console.log("ℹ️  Skipping environment validation during build (will validate at runtime)");
    return;
  }

  if (isClient) {
    // Client-side doesn't need server environment validation
    return;
  }

  const issues: string[] = [];

  // Check for placeholder UUIDs (belt-and-suspenders approach)
  const productIds = [
    { name: "POLAR_PRODUCT_PREMIUM_QUARTERLY", value: env.POLAR_PRODUCT_PREMIUM_QUARTERLY },
    { name: "POLAR_PRODUCT_PREMIUM_ANNUAL", value: env.POLAR_PRODUCT_PREMIUM_ANNUAL },
    { name: "POLAR_PRODUCT_VIP_QUARTERLY", value: env.POLAR_PRODUCT_VIP_QUARTERLY },
    { name: "POLAR_PRODUCT_VIP_ANNUAL", value: env.POLAR_PRODUCT_VIP_ANNUAL },
  ];

  productIds.forEach(({ name, value }) => {
    if (value === PLACEHOLDER_UUID) {
      issues.push(`${name} is using placeholder UUID - this will cause checkout failures`);
    }
  });

  // Check that access token is set
  if (!env.POLAR_ACCESS_TOKEN || env.POLAR_ACCESS_TOKEN.length < 10) {
    issues.push("POLAR_ACCESS_TOKEN appears to be invalid or not set");
  }

  // Check Form 01 URL
  if (env.FORM01_LARK_URL === "https://example.com/form01") {
    issues.push("FORM01_LARK_URL is using placeholder - Form 01 emails will contain an invalid link");
  }

  if (issues.length > 0) {
    console.warn("\n⚠️  Configuration warnings:\n");
    issues.forEach((issue) => console.warn(`  • ${issue}`));
    console.warn("");
  }
}

// Run startup validation
validateStartup();

export { env };
