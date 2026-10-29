/**
 * OpenAPI paths and schemas for the Builder League evidence, projects and moderation API, merged
 * additively into lib/openapi.ts. Enumerations come from the runtime constants so docs never drift
 * from validation.
 */
import { EVIDENCE_MAX_FILE_BYTES, EVIDENCE_MAX_FILES } from "../evidence-storage";
import { DECISION_REASON_CODES } from "../moderation";
import { DISCORD_INGEST_KINDS, DISCORD_KIND_EVENT, INGEST_SECRET_HEADER } from "../discord-ingest";
import { EVIDENCE_STATUSES, STAGES, VISIBILITIES } from "../types";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const nullable = (type: string, extra: object = {}) => ({ type: [type, "null"], ...extra });
const date = { type: "string", format: "date-time" };
const pagination = ref("BuilderPagination");
const data = (schema: object, description: string) => ({
  description,
  content: json({ type: "object", required: ["data"], properties: { data: schema } }),
});
const page = (schema: object, description: string) => ({
  description,
  content: json({ type: "object", required: ["data", "pagination"], properties: { data: { type: "array", items: schema }, pagination } }),
});
const error = (description: string) => ({ description, content: json(ref("BuilderError")) });

const memberAuth = [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }];
const sessionAuth = [{ SessionAuth: [] }];
const memberTags = ["Builder League"];
const adminTags = ["Builder League Admin"];

const hidden = "Not found. While `BUILDER_LEAGUE_ENABLED` is off, every route answers 404 to callers who are neither admins nor on the pilot list.";
const readErrors = { "401": error("Authentication required"), "404": error(hidden) };
const writeErrors = {
  "400": error("Validation failed; `error.details` lists the failing fields"),
  "401": error("Authentication required"),
  "403": error("Not allowed for this caller (membership, ownership, cross-site form or caller type)"),
  "404": error(hidden),
  "409": error("Conflict with the current state (`error.code` names it, e.g. `evidence_locked`, `already_decided`)"),
  "429": error("Too many requests"),
};
const formNote =
  "Also accepts `application/x-www-form-urlencoded` or `multipart/form-data` from a same-site HTML form: without `Accept: application/json` the response is a 303 redirect to `returnTo` (a Builder League path) with `?notice=` or `?error=`.";

const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
const cursorParam = { name: "cursor", in: "query", required: false, schema: { type: "string" }, description: "Opaque cursor from `pagination.nextCursor`." };
const limitParam = { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } };
const idempotencyKey = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description: "Used as `clientKey` when the body has none. A retry with the same key returns the stored evidence with 200.",
  schema: { type: "string", maxLength: 128 },
};

const link = { type: "string", format: "uri", pattern: "^https?://" };
const evidenceFields = {
  eventType: { type: "string", description: "A member-submittable event type of the ruleset in force at `occurredAt`." },
  stage: { type: "string", enum: [...STAGES], description: "Optional; must match the event type's stage." },
  projectId: nullable("string", { description: "Own project; required for project-scoped stages (validate, build, ship)." }),
  title: { type: "string", minLength: 3, maxLength: 140 },
  summary: { type: "string", maxLength: 5000, description: "Outcome in your own words. Redact customer names, emails and payment details." },
  occurredAt: { type: "string", description: "ISO date-time or `YYYY-MM-DD` (midnight Asia/Saigon). Not in the future." },
  links: { type: "array", maxItems: 10, items: link },
  counterparty: { type: "string", description: "Builder id or `/builders/{id}` URL of the member you helped (peer help)." },
  visibility: { type: "string", enum: [...VISIBILITIES], default: "private" },
};
const fileField = {
  type: "array",
  maxItems: EVIDENCE_MAX_FILES,
  items: { type: "string", format: "binary" },
  description: `PNG, JPEG, GIF, WebP or PDF, at most ${EVIDENCE_MAX_FILE_BYTES / 1024 / 1024} MB each; content is sniffed and must match the type.`,
};

const allReasonCodes = [...new Set(Object.values(DECISION_REASON_CODES).flat())];

export const evidenceSchemas: Record<string, unknown> = {
  BuilderError: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: { code: { type: "string" }, message: { type: "string" }, details: {} },
      },
    },
  },
  BuilderPagination: {
    type: "object",
    required: ["nextCursor", "limit"],
    properties: { nextCursor: nullable("string"), limit: { type: "integer" } },
  },
  BuilderProject: {
    type: "object",
    required: ["id", "name", "slug", "summary", "stage", "productId", "visibility", "createdAt", "updatedAt"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      slug: { type: "string" },
      summary: nullable("string"),
      stage: { type: "string", enum: [...STAGES] },
      productId: nullable("string", { description: "Linked directory product the member owns." }),
      visibility: { type: "string", enum: [...VISIBILITIES] },
      createdAt: date,
      updatedAt: date,
    },
  },
  BuilderEvidence: {
    type: "object",
    required: ["id", "userId", "eventType", "stage", "title", "summary", "occurredAt", "links", "files", "status", "source", "visibility", "createdAt", "updatedAt"],
    properties: {
      id: { type: "string" },
      userId: { type: "string" },
      projectId: nullable("string"),
      eventType: { type: "string" },
      stage: { type: "string", enum: [...STAGES] },
      title: { type: "string" },
      summary: { type: "string" },
      occurredAt: date,
      links: { type: "array", items: { type: "string" } },
      files: {
        type: "array",
        description: "Private files, readable only by the owner and admins. Empty for the counterparty.",
        items: { type: "object", required: ["name", "url"], properties: { name: { type: "string" }, url: { type: "string" } } },
      },
      counterpartyUserId: nullable("string"),
      counterpartyConfirmedAt: nullable("string", { format: "date-time" }),
      status: { type: "string", enum: [...EVIDENCE_STATUSES] },
      source: { type: "string", enum: ["member", "api", "agent"], description: "Who submitted: a signed-in member, an API key or an MCP agent." },
      visibility: { type: "string", enum: [...VISIBILITIES] },
      clientKey: nullable("string"),
      decision: {
        type: ["object", "null"],
        properties: { reasonCodes: { type: "array", items: { type: "string" } }, note: nullable("string"), decidedAt: nullable("string", { format: "date-time" }) },
      },
      eventId: nullable("string", { description: "Builder event recorded on approval." }),
      appeal: {
        type: ["object", "null"],
        properties: { id: { type: "string" }, status: { type: "string" }, resolution: nullable("string"), createdAt: date, resolvedAt: nullable("string", { format: "date-time" }) },
      },
      createdAt: date,
      updatedAt: date,
    },
  },
  BuilderEvidenceInput: {
    type: "object",
    additionalProperties: false,
    required: ["eventType", "title", "occurredAt"],
    properties: { ...evidenceFields, clientKey: { type: "string", maxLength: 128, description: "Idempotency key: a retry returns the stored evidence." } },
  },
  BuilderAward: {
    type: "object",
    required: ["entryId", "rp", "created"],
    properties: {
      entryId: nullable("string"),
      rp: { type: "integer" },
      rulesetVersion: nullable("string"),
      created: { type: "boolean" },
      skippedReason: nullable("string", { description: "Why no RP was awarded (e.g. a cap was reached)." }),
    },
  },
  BuilderAppeal: {
    type: "object",
    required: ["id", "evidenceId", "status", "reason", "createdAt"],
    properties: {
      id: { type: "string" },
      evidenceId: { type: "string" },
      status: { type: "string", enum: ["open", "upheld", "overturned", "withdrawn"] },
      reason: { type: "string" },
      resolution: nullable("string"),
      createdAt: date,
      resolvedAt: nullable("string", { format: "date-time" }),
    },
  },
  BuilderQueueItem: {
    type: "object",
    required: ["evidence", "submitterName", "rulesetVersion", "awaitingCounterparty"],
    properties: {
      evidence: ref("BuilderEvidence"),
      submitterName: { type: "string" },
      projectName: nullable("string"),
      rulesetVersion: { type: "string" },
      rp: nullable("integer"),
      requiredVerification: nullable("string"),
      awaitingCounterparty: { type: "boolean" },
    },
  },
  BuilderLedgerEntry: {
    type: "object",
    required: ["id", "userId", "rp", "stage", "awardType", "occurredAt", "createdAt"],
    properties: {
      id: { type: "string" },
      userId: { type: "string" },
      rp: { type: "integer", description: "Negative for a reversal." },
      stage: { type: "string", enum: [...STAGES] },
      awardType: { type: "string" },
      reversesEntryId: nullable("string"),
      reason: nullable("string"),
      occurredAt: date,
      createdAt: date,
    },
  },
  BuilderBackfillReport: {
    type: "object",
    required: ["dryRun", "importedAt", "users", "totals"],
    properties: {
      dryRun: { type: "boolean" },
      importedAt: date,
      totals: {
        type: "object",
        properties: { created: { type: "integer" }, existing: { type: "integer" }, planned: { type: "integer" }, skipped: { type: "integer" } },
      },
      users: {
        type: "array",
        items: {
          type: "object",
          required: ["userId", "optedIn", "items"],
          properties: {
            userId: { type: "string" },
            optedIn: { type: "boolean" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productId: { type: "string" },
                  productSlug: { type: "string" },
                  title: { type: "string" },
                  occurredAt: date,
                  originalTable: { type: "string", enum: ["submissions", "products"] },
                  originalId: { type: "string" },
                  rulesetVersion: { type: "string" },
                  rp: { type: "integer" },
                  action: { type: "string", enum: ["created", "existing", "planned", "skipped"] },
                  reason: nullable("string"),
                  eventId: nullable("string"),
                  entryId: nullable("string"),
                },
              },
            },
          },
        },
      },
    },
  },
  BuilderPilotMember: {
    type: "object",
    required: ["userId", "addedAt"],
    properties: { userId: { type: "string" }, name: nullable("string"), email: nullable("string"), note: nullable("string"), addedBy: nullable("string"), addedAt: date },
  },
};

const SNOWFLAKE = { type: "string", pattern: "^[0-9]{15,22}$", description: "Discord id (snowflake)" };
const ingestResult = {
  type: "object",
  required: ["status", "evidence"],
  properties: { status: { type: "string", enum: ["created", "existing"] }, evidence: ref("BuilderEvidence") },
};

export const evidencePaths: Record<string, unknown> = {
  "/api/v1/builder-projects": {
    get: {
      operationId: "listBuilderProjects",
      summary: "List my Builder League projects",
      tags: memberTags,
      security: memberAuth,
      responses: { "200": data({ type: "array", items: ref("BuilderProject") }, "Own projects, by name"), ...readErrors },
    },
    post: {
      operationId: "createBuilderProject",
      summary: "Create a project",
      description: `Optionally links a directory product you own (organization owner or admin). ${formNote}`,
      tags: memberTags,
      security: memberAuth,
      requestBody: {
        required: true,
        content: json({
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 2, maxLength: 80 },
            summary: { type: "string", maxLength: 500 },
            stage: { type: "string", enum: [...STAGES], default: "validate" },
            productId: nullable("string"),
            visibility: { type: "string", enum: [...VISIBILITIES], default: "private" },
          },
        }),
      },
      responses: { "201": data(ref("BuilderProject"), "Created project"), ...writeErrors },
    },
  },
  "/api/v1/builder-evidence": {
    get: {
      operationId: "listBuilderEvidence",
      summary: "List my evidence",
      description: "Newest first, with the latest appeal of each item.",
      tags: memberTags,
      security: memberAuth,
      parameters: [{ name: "status", in: "query", required: false, schema: { type: "string", enum: [...EVIDENCE_STATUSES] } }, limitParam, cursorParam],
      responses: { "200": page(ref("BuilderEvidence"), "Own evidence"), ...readErrors },
    },
    post: {
      operationId: "submitBuilderEvidence",
      summary: "Submit evidence for a ruleset event",
      description:
        "Evidence is private by default and waits for a moderator (or the named counterparty, for peer help). The source is set from the caller: session `member`, API key `api`, MCP delegation `agent`. Callers can never set a status. " +
        formNote,
      tags: memberTags,
      security: memberAuth,
      parameters: [idempotencyKey],
      requestBody: {
        required: true,
        content: {
          ...json(ref("BuilderEvidenceInput")),
          "multipart/form-data": {
            schema: { type: "object", required: ["eventType", "title", "occurredAt"], properties: { ...evidenceFields, links: { type: "string", description: "One URL per line." }, clientKey: { type: "string" }, files: fileField } },
          },
        },
      },
      responses: {
        "200": data(ref("BuilderEvidence"), "Replay of an earlier submission with the same client key"),
        "201": data(ref("BuilderEvidence"), "Submitted"),
        ...writeErrors,
        "413": error("A file is larger than the limit"),
        "415": error("A file type is not allowed or does not match its content"),
      },
    },
  },
  "/api/v1/builder-evidence/{id}": {
    get: {
      operationId: "getBuilderEvidence",
      summary: "Get evidence",
      description: "Readable by its owner, admins and the named counterparty (without files).",
      tags: memberTags,
      security: memberAuth,
      parameters: [idParam],
      responses: { "200": data(ref("BuilderEvidence"), "Evidence"), ...readErrors },
    },
    patch: {
      operationId: "updateBuilderEvidence",
      summary: "Edit or withdraw evidence",
      description: `Only while \`submitted\` or \`needs_info\`; answering a \`needs_info\` request puts it back in the queue. Send \`{ "action": "withdraw" }\` to withdraw. HTML forms use POST on the same path. ${formNote}`,
      tags: memberTags,
      security: memberAuth,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: json({
          oneOf: [
            { type: "object", additionalProperties: false, minProperties: 1, properties: { ...evidenceFields, removeFiles: { type: "array", items: { type: "string" } } } },
            { type: "object", required: ["action"], properties: { action: { type: "string", const: "withdraw" } } },
          ],
        }),
      },
      responses: { "200": data(ref("BuilderEvidence"), "Updated evidence"), ...writeErrors },
    },
  },
  "/api/v1/builder-evidence/{id}/files/{key}": {
    get: {
      operationId: "getBuilderEvidenceFile",
      summary: "Download a private evidence file",
      description: "Owner and admins only; everyone else gets 404. Served with `Cache-Control: private, no-store`.",
      tags: memberTags,
      security: memberAuth,
      parameters: [idParam, { name: "key", in: "path", required: true, schema: { type: "string" }, description: "File name from `files[].name`." }],
      responses: { "200": { description: "File bytes", content: { "image/*": {}, "application/pdf": {} } }, ...readErrors },
    },
  },
  "/api/v1/builder-evidence/{id}/appeal": {
    post: {
      operationId: "appealBuilderEvidence",
      summary: "Appeal a rejection",
      description: `One appeal per rejection, never two open at once. ${formNote}`,
      tags: memberTags,
      security: memberAuth,
      parameters: [idParam],
      requestBody: { required: true, content: json({ type: "object", required: ["reason"], properties: { reason: { type: "string", minLength: 20, maxLength: 2000 } } }) },
      responses: { "201": data(ref("BuilderAppeal"), "Appeal opened"), ...writeErrors },
    },
  },
  "/api/v1/builder-evidence/{id}/confirm": {
    post: {
      operationId: "confirmBuilderPeerHelp",
      summary: "Confirm peer help as the counterparty",
      description:
        "Signed-in session only (API keys and agents get 403). Self-confirmation, accounts sharing a Discord identity and circular confirmations beyond the ruleset cap are refused. When the ruleset accepts peer confirmation the evidence is approved and RP awarded; otherwise it stays in the moderator queue. " +
        formNote,
      tags: memberTags,
      security: sessionAuth,
      parameters: [idParam],
      responses: {
        "200": data(
          {
            type: "object",
            properties: { evidence: ref("BuilderEvidence"), confirmed: { type: "boolean" }, requiresModerator: { type: "boolean" }, award: { oneOf: [ref("BuilderAward"), { type: "null" }] } },
          },
          "Confirmation result"
        ),
        ...writeErrors,
      },
    },
  },
  "/api/v1/builder-admin/queue": {
    get: {
      operationId: "listBuilderModerationQueue",
      summary: "Moderation queue",
      description: "Admin session only. Oldest first. `view=appeals` lists open appeals instead.",
      tags: adminTags,
      security: sessionAuth,
      parameters: [
        { name: "view", in: "query", required: false, schema: { type: "string", enum: ["evidence", "appeals"] } },
        { name: "status", in: "query", required: false, schema: { type: "string", enum: [...EVIDENCE_STATUSES], default: "submitted" } },
        { name: "stage", in: "query", required: false, schema: { type: "string", enum: [...STAGES] } },
        { name: "eventType", in: "query", required: false, schema: { type: "string" } },
        { name: "olderThanHours", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        limitParam,
        cursorParam,
      ],
      responses: { "200": page(ref("BuilderQueueItem"), "Queue page"), ...readErrors, "403": error("Admin session required") },
    },
  },
  "/api/v1/builder-admin/evidence/{id}/decision": {
    post: {
      operationId: "decideBuilderEvidence",
      summary: "Approve, reject or request information",
      description:
        "Admin session only; API keys and agents can never approve, and nobody decides on their own evidence. Approval records a moderator-verified event and awards RP exactly once, even under concurrent approvals. Every decision is audited. " +
        formNote,
      tags: adminTags,
      security: sessionAuth,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: json({
          type: "object",
          required: ["decision"],
          properties: {
            decision: { type: "string", enum: ["approve", "reject", "needs_info"] },
            reasonCodes: { type: "array", items: { type: "string", enum: allReasonCodes }, description: "Required for reject and needs_info; `other` needs a note." },
            note: { type: "string", maxLength: 2000 },
          },
        }),
      },
      responses: {
        "200": data(
          { type: "object", properties: { decision: { type: "string" }, decided: { type: "boolean" }, evidence: ref("BuilderEvidence"), award: { oneOf: [ref("BuilderAward"), { type: "null" }] } } },
          "Decision result; `decided: false` when this call replayed an earlier identical decision"
        ),
        ...writeErrors,
      },
    },
  },
  "/api/v1/builder-admin/evidence/{id}/appeal": {
    post: {
      operationId: "resolveBuilderAppeal",
      summary: "Uphold or overturn an appeal",
      description: `Admin session only. Overturning approves the evidence and awards RP. ${formNote}`,
      tags: adminTags,
      security: sessionAuth,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: json({
          type: "object",
          required: ["outcome", "resolution"],
          properties: { outcome: { type: "string", enum: ["uphold", "overturn"] }, resolution: { type: "string", minLength: 5, maxLength: 2000 }, appealId: { type: "string" } },
        }),
      },
      responses: {
        "200": data(
          {
            type: "object",
            properties: {
              appeal: ref("BuilderAppeal"),
              evidence: { oneOf: [ref("BuilderEvidence"), { type: "null" }], description: "The approved evidence when overturned." },
              award: { oneOf: [ref("BuilderAward"), { type: "null" }] },
            },
          },
          "Resolved appeal"
        ),
        ...writeErrors,
      },
    },
  },
  "/api/v1/builder-admin/ledger/{entryId}/reverse": {
    post: {
      operationId: "reverseBuilderLedgerEntry",
      summary: "Reverse a ledger entry",
      description: `Admin session only. Adds a negative entry and an audit row; idempotent per entry. ${formNote}`,
      tags: adminTags,
      security: sessionAuth,
      parameters: [{ name: "entryId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: json({ type: "object", required: ["reason"], properties: { reason: { type: "string", minLength: 5, maxLength: 1000 } } }) },
      responses: { "200": data(ref("BuilderLedgerEntry"), "Reversal entry"), ...writeErrors },
    },
  },
  "/api/v1/builder-admin/pilot": {
    get: {
      operationId: "listBuilderPilotMembers",
      summary: "List pilot members",
      tags: adminTags,
      security: sessionAuth,
      responses: { "200": data({ type: "array", items: ref("BuilderPilotMember") }, "Pilot allowlist"), ...readErrors },
    },
    post: {
      operationId: "updateBuilderPilotMembers",
      summary: "Add or remove a pilot member",
      description: `Admin session only; audited and idempotent. ${formNote}`,
      tags: adminTags,
      security: sessionAuth,
      requestBody: {
        required: true,
        content: json({
          type: "object",
          required: ["action"],
          properties: { action: { type: "string", enum: ["add", "remove"] }, userId: { type: "string" }, email: { type: "string", format: "email" }, note: { type: "string", maxLength: 500 } },
          description: "Exactly one of `userId` or `email`.",
        }),
      },
      responses: {
        "200": data({ type: "object", properties: { userId: { type: "string" }, action: { type: "string" }, changed: { type: "boolean" } } }, "Result"),
        ...writeErrors,
      },
    },
  },
  "/api/v1/builder-admin/backfill": {
    post: {
      operationId: "runBuilderBackfill",
      summary: "Backfill directory launches",
      description:
        "Admin session only. For members who opted in, imports each published product they own as a system-verified SHIP launch at its original approval date, scored by the ruleset in force then. Dry run unless `dryRun: false`; idempotent; never creates activity that did not happen. " +
        formNote,
      tags: adminTags,
      security: sessionAuth,
      requestBody: {
        required: false,
        content: json({
          type: "object",
          additionalProperties: false,
          properties: { userIds: { type: "array", maxItems: 500, items: { type: "string" } }, dryRun: { type: "boolean", default: true } },
        }),
      },
      responses: { "200": data(ref("BuilderBackfillReport"), "Backfill report"), ...writeErrors },
    },
  },
  "/api/v1/builder-access": {
    get: {
      operationId: "getBuilderAccess",
      summary: "Should the menu show the Builder League?",
      description:
        "Always 200. `showNav` is true while the Builder League is open to members, or when the caller may use it (admin, pilot member). Signed-out callers get the public answer. Used by the site menu once per browser tab.",
      tags: memberTags,
      security: [...memberAuth, {}],
      responses: {
        "200": data({ type: "object", required: ["showNav"], properties: { showNav: { type: "boolean" } } }, "Menu visibility for the caller"),
      },
    },
  },
  "/api/v1/builder-admin/ingest/discord": {
    post: {
      operationId: "ingestBuilderDiscordEvent",
      summary: "Ingest a Discord bot event as evidence",
      description:
        `For the community Discord bot. Authenticate with the shared \`${INGEST_SECRET_HEADER}\` header or an admin's API key minted with the \`builder:ingest\` scope (\`POST /api/v1/api-keys\` with \`scopes: ["builder:ingest"]\`). Admin sessions also work; full API keys and MCP delegation get 403, and a key with another scope gets 401. ` +
        `Only these kinds count, never message volume: ${DISCORD_INGEST_KINDS.map((kind) => `\`${kind}\` → \`${DISCORD_KIND_EVENT[kind]}\``).join(", ")}. ` +
        "The member is resolved from the Discord account linked during onboarding. The evidence is stored as `submitted` with source `discord` and waits for a moderator; this route never approves or awards. " +
        "Idempotent per member and `messageId` (client key `discord:{messageId}`): a retry answers 200 with the stored evidence. `help_confirmation` needs `counterpartDiscordUserId` (the helped member), who still confirms from their own account. SHIP evidence needs a project, which the member attaches before review.",
      tags: adminTags,
      security: [{ BuilderIngestSecret: [] }, { BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }],
      "x-nlb-api-key-scope": "builder:ingest",
      requestBody: {
        required: true,
        content: json({
          type: "object",
          additionalProperties: false,
          required: ["kind", "discordUserId", "messageId", "channelId", "occurredAt"],
          properties: {
            kind: { type: "string", enum: [...DISCORD_INGEST_KINDS] },
            discordUserId: { ...SNOWFLAKE, description: "Discord id of the member the event is about." },
            messageId: SNOWFLAKE,
            channelId: SNOWFLAKE,
            url: { ...link, maxLength: 2048, description: "Message link; defaults to the guild message URL when the guild id is configured." },
            occurredAt: { oneOf: [{ ...date }, { type: "integer", description: "Epoch milliseconds" }] },
            counterpartDiscordUserId: { ...SNOWFLAKE, description: "Required for `help_confirmation`: the member who was helped." },
            summary: { type: "string", maxLength: 2000 },
          },
        }),
      },
      responses: {
        "200": data(ingestResult, "Replay: the evidence already stored for this message"),
        "201": data(ingestResult, "Evidence created with status `submitted`"),
        "202": data(
          {
            type: "object",
            required: ["status", "reason"],
            properties: {
              status: { type: "string", enum: ["ignored"] },
              reason: { type: "string", enum: ["unknown_discord_user", "no_builder_access", "counterpart_required", "unknown_counterpart", "self_counterpart", "event_type_not_in_ruleset"] },
            },
          },
          "Accepted but ignored: nothing was stored"
        ),
        "400": error("Validation failed; `error.details` lists the failing fields"),
        "401": error("Missing or invalid secret or credentials (a key with another scope counts as none)"),
        "403": error("Not an admin, MCP delegation, or a full API key without the `builder:ingest` scope"),
      },
    },
  },
};
