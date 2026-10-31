import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export type ChatLeadStatus = "new" | "contacted" | "closed";

/**
 * Leads left through the website chat (Dewee agent). A row exists only after the visitor approved
 * the save in the widget's confirmation dialog, which is the consent; `consentedAt` records when.
 * `ipHash` is a keyed hash used for rate limiting, never the raw address.
 */
export const chatLeads = sqliteTable(
  "chat_leads",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    email: text("email").notNull(),
    need: text("need").notNull(),
    interest: text("interest"),
    wantsHuman: integer("wants_human", { mode: "boolean" }).default(false).notNull(),
    locale: text("locale").notNull(),
    pagePath: text("page_path"),
    userId: text("user_id"),
    ipHash: text("ip_hash"),
    status: text("status").$type<ChatLeadStatus>().notNull().default("new"),
    consentedAt: integer("consented_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  },
  (t) => [
    index("chat_leads_created_idx").on(t.createdAt),
    index("chat_leads_ip_created_idx").on(t.ipHash, t.createdAt),
  ]
);
