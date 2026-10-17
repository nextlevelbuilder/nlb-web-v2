import { sqliteTable, text, integer, primaryKey, unique, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

/**
 * Cloudflare D1 (SQLite) schema. Ported 1:1 from the Postgres schema:
 * uuid -> text (crypto.randomUUID), timestamp -> integer epoch ms, boolean -> integer 0/1,
 * app-owned jsonb/arrays -> text JSON (drizzle json mode). Better Auth-owned tables keep
 * JSON/array fields as plain text because the Better Auth adapter (de)serialises them itself.
 */
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

// ==========================================
// 1. Existing Commerce Tables (Unchanged for Parity)
// ==========================================

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  polarCustomerId: text("polar_customer_id").unique(),
  discordId: text("discord_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").references(() => customers.id).notNull(),
  polarSubscriptionId: text("polar_subscription_id").unique().notNull(),
  polarProductId: text("polar_product_id").notNull(),
  productName: text("product_name").notNull(),
  status: text("status").notNull(),
  currentPeriodStart: integer("current_period_start", { mode: "timestamp_ms" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").references(() => customers.id).notNull(),
  polarOrderId: text("polar_order_id").unique().notNull(),
  polarProductId: text("polar_product_id").notNull(),
  productName: text("product_name").notNull(),
  productSlug: text("product_slug"),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").unique().notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  processed: integer("processed", { mode: "boolean" }).default(false).notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  error: text("error"),
  /** Processing lease; null when free. Taken by insert or by a conditional reclaim once expired. */
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

// ==========================================
// 2. Transactional Outbox & Domain Event Ledger
// ==========================================

export const domainEvents = sqliteTable("domain_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").unique().notNull(),
  eventType: text("event_type").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  aggregateVersion: integer("aggregate_version").notNull().default(1),
  payload: text("payload", { mode: "json" }).notNull(),
  actorId: text("actor_id"),
  actorRole: text("actor_role"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const outboxEvents = sqliteTable("outbox_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").unique().notNull(),
  eventType: text("event_type").notNull(),
  targetQueue: text("target_queue").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
});

export const deliveryIntents = sqliteTable("delivery_intents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").notNull(),
  sink: text("sink").notNull(),
  status: text("status").notNull().default("pending"),
  idempotencyKey: text("idempotency_key").unique().notNull(),
  responsePayload: text("response_payload", { mode: "json" }),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
});

// ==========================================
// 3. Dormant Commerce Kernel
// ==========================================

export const offers = sqliteTable("offers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  allowedProcessors: text("allowed_processors", { mode: "json" }).$type<string[]>().notNull(),
  priceAmount: text("price_amount").notNull(),
  priceCurrency: text("price_currency").notNull().default("USD"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const purchases = sqliteTable("purchases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  intentNonce: text("intent_nonce").unique().notNull(),
  userId: text("user_id").notNull(),
  orgId: text("org_id"),
  offerId: text("offer_id").references(() => offers.id).notNull(),
  processor: text("processor").notNull(),
  externalReference: text("external_reference"),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const entitlements = sqliteTable("entitlements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  orgId: text("org_id"),
  purchaseId: text("purchase_id").references(() => purchases.id),
  featureKey: text("feature_key").notNull(),
  validFrom: integer("valid_from", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  validUntil: integer("valid_until", { mode: "timestamp_ms" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
}, (t) => [unique("entitlements_user_feature_unique").on(t.userId, t.featureKey)]);

// ==========================================
// 4. Better Auth Schema Tables
// ==========================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").unique().notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  impersonatedBy: text("impersonated_by"),
  activeOrganizationId: text("active_organization_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  issuer: text("issuer"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));
export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull().default("member"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  inviterId: text("inviter_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  permissions: text("permissions"),
  refillInterval: integer("refill_interval"),
  refillAmount: integer("refill_amount"),
  lastRefillAt: integer("last_refill_at", { mode: "timestamp_ms" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }).default(false),
  rateLimitTimeWindow: integer("rate_limit_time_window"),
  rateLimitMax: integer("rate_limit_max"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

// ==========================================
// 5. NLB Directory Catalog & Block Revisions
// ==========================================

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  slug: text("slug").unique().notNull(),
  title: text("title").notNull(),
  tagline: text("tagline").notNull(),
  websiteUrl: text("website_url").notNull(),
  logoUrl: text("logo_url"),
  status: text("status").notNull().default("draft"),
  currentRevisionId: text("current_revision_id"),
  isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
  // Legacy cumulative vote counter; projectProductTrust derives the public 0–100 score.
  trustScore: integer("trust_score").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const productRevisions = sqliteTable("product_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  revisionNumber: integer("revision_number").notNull().default(1),
  schemaVersion: integer("schema_version").notNull().default(1),
  contentHash: text("content_hash").notNull(),
  title: text("title").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  document: text("document", { mode: "json" }).notNull(),
  categoriesSnapshot: text("categories_snapshot", { mode: "json" }).$type<string[]>().default([]),
  tagsSnapshot: text("tags_snapshot", { mode: "json" }).$type<string[]>().default([]),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const productPulseMonitors = sqliteTable("product_pulse_monitors", {
  productId: text("product_id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
  nextCheckAt: integer("next_check_at", { mode: "timestamp_ms" }).notNull(),
  leaseUntil: integer("lease_until", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("product_pulse_monitors_lease_idx").on(t.leaseUntil)]);

export const productPulseSamples = sqliteTable("product_pulse_samples", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  websiteUrl: text("website_url").notNull(),
  checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull().default(nowMs).$defaultFn(() => new Date()),
  outcome: text("outcome").$type<"up" | "down" | "unknown">().notNull(),
  latencyMs: integer("latency_ms"),
  httpStatus: integer("http_status"),
  reason: text("reason"),
}, (t) => [index("product_pulse_samples_product_checked_idx").on(t.productId, t.checkedAt)]);

export const productCategories = sqliteTable(
  "product_categories",
  {
    productId: text("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "cascade" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] })]
);

export const productTags = sqliteTable(
  "product_tags",
  {
    productId: text("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
    tagId: text("tag_id").references(() => tags.id, { onDelete: "cascade" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.tagId] })]
);

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull(),
  productId: text("productId").references(() => products.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").unique().notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  status: text("status").notNull().default("staging"),
  publicUrl: text("public_url"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  promotedAt: integer("promoted_at", { mode: "timestamp_ms" }),
});

// ==========================================
// 6. Moderation Queue & Audit
// ==========================================

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  revisionId: text("revision_id").references(() => productRevisions.id, { onDelete: "cascade" }).notNull(),
  submitterId: text("submitter_id").notNull(),
  status: text("status").notNull().default("awaiting_human"),
  submissionNotes: text("submission_notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
});

export const moderationCases = sqliteTable("moderation_cases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text("submission_id").references(() => submissions.id, { onDelete: "cascade" }).notNull(),
  assignedReviewerId: text("assigned_reviewer_id"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  aiAnalysisSummary: text("ai_analysis_summary", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const moderationChecks = sqliteTable("moderation_checks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  caseId: text("case_id").references(() => moderationCases.id, { onDelete: "cascade" }).notNull(),
  checkType: text("check_type").notNull(),
  status: text("status").notNull(),
  details: text("details", { mode: "json" }),
  performedAt: integer("performed_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const moderationDecisions = sqliteTable("moderation_decisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  caseId: text("case_id").references(() => moderationCases.id, { onDelete: "cascade" }).notNull(),
  decision: text("decision").notNull(),
  reasonCodes: text("reason_codes", { mode: "json" }).$type<string[]>().notNull(),
  humanReviewerId: text("human_reviewer_id").notNull(),
  reviewerRole: text("reviewer_role").notNull(),
  notes: text("notes"),
  decisionHash: text("decision_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const appeals = sqliteTable("appeals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text("submission_id").references(() => submissions.id, { onDelete: "cascade" }).notNull(),
  appellantId: text("appellant_id").notNull(),
  appealReason: text("appeal_reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
});

// ==========================================
// 7. Analytics Ledger, Votes & Rankings
// ==========================================

export const analyticsEvents = sqliteTable("analytics_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").unique().notNull(),
  eventType: text("event_type").notNull(),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  referrerHost: text("referrer_host"),
  countryCode: text("country_code"),
  deviceCategory: text("device_category"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    voteDate: text("vote_date").notNull(), // YYYY-MM-DD UTC
    turnstileVerified: integer("turnstile_verified", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  },
  (t) => [unique("votes_product_user_date_unique").on(t.productId, t.userId, t.voteDate)]
);

export const rankingSnapshots = sqliteTable("ranking_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  windowType: text("window_type").notNull(),
  windowDate: text("window_date").notNull(),
  rulesetVersion: text("ruleset_version").notNull().default("v1"),
  ranks: text("ranks", { mode: "json" }).notNull(),
  isFinal: integer("is_final", { mode: "boolean" }).notNull().default(false),
  snapshotHash: text("snapshot_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

// OAuth provider and signing keys. Fields follow Better Auth 1.7.2.

export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  clientDiscoveryId: text("client_discovery_id"),
  disabled: integer("disabled", { mode: "boolean" }).default(false),
  skipConsent: integer("skip_consent", { mode: "boolean" }),
  enableEndSession: integer("enable_end_session", { mode: "boolean" }),
  subjectType: text("subject_type"),
  scopes: text("scopes"),
  clientCredentialsScopes: text("client_credentials_scopes").default("[]"),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts"),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: text("redirect_uris").notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris"),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  backchannelLogoutSessionRequired: integer("backchannel_logout_session_required", { mode: "boolean" }),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  applicationType: text("application_type"),
  jwks: text("jwks"),
  jwksUri: text("jwks_uri"),
  grantTypes: text("grant_types"),
  responseTypes: text("response_types"),
  requirePKCE: integer("require_pkce", { mode: "boolean" }),
  dpopBoundAccessTokens: integer("dpop_bound_access_tokens", { mode: "boolean" }).default(false),
  referenceId: text("reference_id"),
  metadata: text("metadata"),
});

export const oauthResources = sqliteTable("oauth_resources", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes"),
  customClaims: text("custom_claims"),
  dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", { mode: "boolean" }).default(false),
  disabled: integer("disabled", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  policyVersion: integer("policy_version").default(1),
  metadata: text("metadata"),
});

export const oauthClientResources = sqliteTable("oauth_client_resources", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => oauthResources.identifier, { onDelete: "cascade" }),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
}, (table) => [unique().on(table.clientId, table.resourceId)]);

export const oauthRefreshTokens = sqliteTable("oauth_refresh_tokens", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requested_user_info_claims"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  revoked: integer("revoked", { mode: "timestamp_ms" }),
  rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
  rotationReplayResponse: text("rotation_replay_response"),
  rotationReplayExpiresAt: integer("rotation_replay_expires_at", { mode: "timestamp_ms" }),
  authTime: integer("auth_time", { mode: "timestamp_ms" }),
  confirmation: text("confirmation"),
  scopes: text("scopes").notNull(),
});

export const oauthAccessTokens = sqliteTable("oauth_access_tokens", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requested_user_info_claims"),
  refreshId: text("refresh_id").references(() => oauthRefreshTokens.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  revoked: integer("revoked", { mode: "timestamp_ms" }),
  confirmation: text("confirmation"),
  scopes: text("scopes").notNull(),
});

export const oauthConsents = sqliteTable("oauth_consents", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requested_user_info_claims"),
  scopes: text("scopes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const oauthClientAssertions = sqliteTable("oauth_client_assertions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const jwksKeys = sqliteTable("jwks_keys", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  alg: text("alg"),
  crv: text("crv"),
});

// ==========================================
// 9. Blog (widget page-builder posts)
// ==========================================

/**
 * Blog posts are stored as an ordered list of typed widget blocks (see lib/blog/blocks/registry.ts).
 * `version` is an optimistic-concurrency counter: writers must send the version they read, a stale
 * version is rejected with 409. Every write snapshots the previous state into blog_post_revisions.
 */
export const blogPosts = sqliteTable(
  "blog_posts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    locale: text("locale").$type<"en" | "vi">().notNull().default("en"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    blocks: text("blocks", { mode: "json" }).$type<unknown[]>().notNull().default([]),
    coverUrl: text("cover_url"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    seo: text("seo", { mode: "json" }).$type<Record<string, string | boolean>>().notNull().default({}),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name"),
    status: text("status").$type<"draft" | "published" | "archived">().notNull().default("draft"),
    translationKey: text("translation_key"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  },
  (t) => [
    unique("blog_posts_locale_slug_unique").on(t.locale, t.slug),
    index("blog_posts_listing_idx").on(t.locale, t.status, t.publishedAt),
    index("blog_posts_translation_idx").on(t.translationKey),
  ]
);

export const blogPostRevisions = sqliteTable(
  "blog_post_revisions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text("post_id").references(() => blogPosts.id, { onDelete: "cascade" }).notNull(),
    version: integer("version").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    actorId: text("actor_id").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  },
  (t) => [index("blog_post_revisions_post_idx").on(t.postId, t.version)]
);

// ==========================================
// 10. Courses (per-video purchase, Cloudflare Stream)
// ==========================================

/**
 * One row per course video. Each published video owns exactly one Polar product (created on publish)
 * so a paid order for that product grants the `video:<id>` entitlement.
 */
export const courseVideos = sqliteTable(
  "course_videos",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    locale: text("locale").$type<"en" | "vi">().notNull().default("vi"),
    weekNumber: integer("week_number"),
    streamUid: text("stream_uid"),
    /** True once Stream confirmed `requireSignedURLs` for `streamUid`; tokens are only issued when set. */
    streamSignedOnly: integer("stream_signed_only", { mode: "boolean" }).notNull().default(false),
    durationSec: integer("duration_sec").notNull().default(0),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    polarProductId: text("polar_product_id").unique(),
    thumbnailUrl: text("thumbnail_url"),
    status: text("status").$type<"draft" | "published" | "archived">().notNull().default("draft"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  },
  (t) => [index("course_videos_listing_idx").on(t.status, t.publishedAt)]
);

// ==========================================
// 11. API idempotency (Idempotency-Key replay store)
// ==========================================

/**
 * Stored responses for write requests that carried an `Idempotency-Key` header.
 * Keyed per caller so two callers can reuse the same key value. `requestHash` detects a reused
 * key with a different body (rejected with 422). Rows older than 24h are ignored and overwritten.
 */
export const apiIdempotencyKeys = sqliteTable(
  "api_idempotency_keys",
  {
    callerId: text("caller_id").notNull(),
    key: text("key").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code").notNull(),
    responseBody: text("response_body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  },
  (t) => [primaryKey({ columns: [t.callerId, t.key] })]
);

export * from "./builder-league-schema";
