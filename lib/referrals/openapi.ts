/**
 * OpenAPI paths and schemas of the affiliate program: the member API (`/api/v1/affiliates`, 404 while
 * `AFFILIATES_ENABLED` is off) and the finance operator API (`/api/v1/affiliate-admin`). Merged
 * additively into lib/openapi.ts behind `PUBLISH_AFFILIATE_OPENAPI`; every path, schema and operation
 * id is namespaced so the merge can never shadow an existing entry.
 */
const MEMBER_TAG = "NLB Affiliates";
const OPERATOR_TAG = "NLB Affiliates: Operators";

/** Public read: no credential needed. */
const PUBLIC_AUTH = [{}, { SessionAuth: [] }, { BearerAuth: [] }, { ApiKeyAuth: [] }];
/** Member calls: session, API key or MCP delegation (`mcp:read` for GET, `mcp:write` for writes). */
const CALLER_AUTH = [{ SessionAuth: [] }, { BearerAuth: [] }, { ApiKeyAuth: [] }];
/** Payout details: a signed-in browser session only. API keys and MCP get 403 `session_required`. */
const SESSION_AUTH = [{ SessionAuth: [] }];
/** Operator calls: a session, or an MCP delegation carrying `mcp:operator`. API keys are refused. */
const OPERATOR_AUTH = [{ SessionAuth: [] }];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const envelope = (data: unknown) => json({ type: "object", properties: { data } });
const body = (schema: unknown) => ({ required: true, content: json(schema) });
const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  additionalProperties: false,
  ...(required.length ? { required } : {}),
  properties,
});

const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };
const int = { type: "integer" };
const nullableInt = { type: ["integer", "null"] };
const bps = { type: "integer", minimum: 0, maximum: 10000, description: "Basis points (10000 = 100%)" };
const time = { type: "string", format: "date-time" };
const nullableTime = { type: ["string", "null"], format: "date-time" };

const idParam = { name: "id", in: "path", required: true, schema: str };
const limitParam = (fallback: number, max: number) => ({ name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: max, default: fallback } });
const idempotencyHeader = { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 128 } };
const approvalId = { type: "string", description: "Approved two-person approval for this exact action and arguments" };

const ERROR_TEXT: Record<number, string> = {
  400: "Invalid input (`validation_failed`, `invalid_input`, `invalid_json`)",
  401: "Sign in required (`unauthenticated`)",
  403: "Denied (`affiliate_suspended`, `account_not_eligible`, `session_required`, `payouts_disabled`, operator policy denies) or cross-site",
  404: "Not found (`not_found`, `not_enrolled`), or hidden while `AFFILIATES_ENABLED` is off",
  409: "Conflict with the current state (`conflict`, `invalid_transition`, `already_enrolled`, `code_taken`, approval failures)",
  422: "Rule refused (`over_budget`, `terms_not_accepted`)",
};

function errors(...statuses: number[]): Record<string, { description: string; content: unknown }> {
  return Object.fromEntries(statuses.map((status) => [String(status), { description: ERROR_TEXT[status] ?? "Error", content: json(ref("AffiliateError")) }]));
}

interface OperationInput {
  operationId: string;
  summary: string;
  description?: string;
  tag: string;
  security: unknown;
  parameters?: unknown[];
  requestBody?: unknown;
  ok: { status?: number; description: string; schema: unknown };
  errors: number[];
}

function operation(input: OperationInput) {
  return {
    operationId: input.operationId,
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    tags: [input.tag],
    security: input.security,
    ...(input.parameters ? { parameters: input.parameters } : {}),
    ...(input.requestBody ? { requestBody: input.requestBody } : {}),
    responses: { [String(input.ok.status ?? 200)]: { description: input.ok.description, content: envelope(input.ok.schema) }, ...errors(...input.errors) },
  };
}

const member = (input: Omit<OperationInput, "tag" | "security"> & { security?: unknown }) =>
  operation({ ...input, tag: MEMBER_TAG, security: input.security ?? CALLER_AUTH });
const operator = (input: Omit<OperationInput, "tag" | "security">) => operation({ ...input, tag: OPERATOR_TAG, security: OPERATOR_AUTH });

const linkFields = {
  label: { type: ["string", "null"], maxLength: 80 },
  discountBps: { type: "integer", minimum: 0, maximum: 9000, description: "Buyer discount; must fit the caller's current incentive budget" },
  destinationPath: { type: "string", maxLength: 200, description: "Allowlisted site path: `/`, `/vi`, `/courses…`, `/live…`, `/blog…`, `/affiliates…`" },
  utmCampaign: { type: ["string", "null"], pattern: "^[a-z0-9][a-z0-9_-]{0,63}$" },
};

const memberPaths: Record<string, unknown> = {
  "/api/v1/affiliates/program": {
    get: member({
      operationId: "affiliateGetProgram",
      summary: "Affiliate program rules",
      description: "Levels, incentive budgets, eligible plans, attribution window, hold days and payout fees of the active rules version. Public.",
      security: PUBLIC_AUTH,
      ok: { description: "Program", schema: ref("AffiliateProgram") },
      errors: [404],
    }),
  },
  "/api/v1/affiliates/me": {
    get: member({
      operationId: "affiliateGetMe",
      summary: "My affiliate account",
      ok: { description: "Account summary", schema: ref("AffiliateSummary") },
      errors: [401, 404],
    }),
    post: member({
      operationId: "affiliateEnroll",
      summary: "Join the affiliate program",
      description: "Accept the current Affiliate Agreement version. Verified, non-banned accounts only. Supports `Idempotency-Key`. Session callers must be same-site.",
      parameters: [idempotencyHeader],
      requestBody: body(object({ termsVersion: str }, ["termsVersion"])),
      ok: { status: 201, description: "Enrolled", schema: ref("AffiliateSummary") },
      errors: [400, 401, 403, 404, 409, 422],
    }),
  },
  "/api/v1/affiliates/preview": {
    get: member({
      operationId: "affiliatePreviewIncentive",
      summary: "Preview a buyer discount against my budget",
      description: "Commission left by `discountBps` under the caller's current budget and, with `priceMinor`, an indicative example. Over-budget discounts return `withinBudget: false`.",
      parameters: [
        { name: "discountBps", in: "query", required: true, schema: { type: "integer", minimum: 0, maximum: 9000 } },
        { name: "priceMinor", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
      ],
      ok: { description: "Preview", schema: ref("AffiliateIncentivePreview") },
      errors: [400, 401, 404],
    }),
  },
  "/api/v1/affiliates/links": {
    get: member({
      operationId: "affiliateListLinks",
      summary: "My referral links",
      ok: { description: "Links", schema: object({ links: { type: "array", items: ref("AffiliateLink") } }) },
      errors: [401, 404],
    }),
    post: member({
      operationId: "affiliateCreateLink",
      summary: "Create a referral link",
      description: "`code` is generated when omitted. Active affiliates only; at most 20 links. Supports `Idempotency-Key`. Session callers must be same-site.",
      parameters: [idempotencyHeader],
      requestBody: body(object({ code: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$" }, ...linkFields })),
      ok: { status: 201, description: "Created", schema: ref("AffiliateLink") },
      errors: [400, 401, 403, 404, 409, 422],
    }),
  },
  "/api/v1/affiliates/links/{id}": {
    patch: member({
      operationId: "affiliateUpdateLink",
      summary: "Edit one of my referral links",
      description: "The code never changes; every edit bumps `version`. `expectedVersion` turns a concurrent edit into 409. Another affiliate's link is 404.",
      parameters: [idParam],
      requestBody: body(object({ ...linkFields, status: { type: "string", enum: ["active", "paused", "archived"] }, expectedVersion: int })),
      ok: { description: "Updated", schema: ref("AffiliateLink") },
      errors: [400, 401, 403, 404, 409, 422],
    }),
  },
  "/api/v1/affiliates/conversions": {
    get: member({
      operationId: "affiliateListConversions",
      summary: "My conversions",
      description: "Date, plan and amounts of referred first purchases. Never the buyer's identity.",
      parameters: [limitParam(50, 200)],
      ok: { description: "Conversions", schema: object({ conversions: { type: "array", items: ref("AffiliateConversion") } }) },
      errors: [400, 401, 404],
    }),
  },
  "/api/v1/affiliates/commissions": {
    get: member({
      operationId: "affiliateGetCommissions",
      summary: "My balances and commission ledger",
      parameters: [limitParam(100, 500)],
      ok: { description: "Balances and ledger", schema: object({ balances: ref("AffiliateBalances"), ledger: { type: "array", items: ref("AffiliateLedgerEntry") } }) },
      errors: [400, 401, 404],
    }),
  },
  "/api/v1/affiliates/payouts": {
    get: member({
      operationId: "affiliateListPayouts",
      summary: "My payouts",
      ok: { description: "Payouts", schema: object({ payouts: { type: "array", items: ref("AffiliatePayoutItem") } }) },
      errors: [401, 404],
    }),
  },
  "/api/v1/affiliates/payout-method": {
    get: member({
      operationId: "affiliateGetPayoutMethod",
      summary: "My payout method (masked)",
      description: "Session only: API keys and MCP delegations get 403 `session_required`. `null` when none is set.",
      security: SESSION_AUTH,
      ok: { description: "Masked payout method", schema: { oneOf: [ref("AffiliatePayoutMethod"), { type: "null" }] } },
      errors: [401, 403, 404],
    }),
    put: member({
      operationId: "affiliateSetPayoutMethod",
      summary: "Replace my payout method",
      description: "PayPal, or a Vietnamese bank account for VN residents. Details are sealed at rest; only a masked hint is returned. Session only, same-site.",
      security: SESSION_AUTH,
      requestBody: body(
        object(
          {
            type: { type: "string", enum: ["paypal", "bank_vn"] },
            payeeType: { type: "string", enum: ["individual", "business"] },
            residency: { type: "string", enum: ["vn", "other"] },
            paypalEmail: { type: "string", format: "email" },
            bankName: { type: "string", maxLength: 100 },
            accountHolder: { type: "string", maxLength: 120 },
            accountNumber: { type: "string", pattern: "^[0-9 ]{6,30}$" },
          },
          ["type", "payeeType", "residency"]
        )
      ),
      ok: { description: "Masked payout method", schema: ref("AffiliatePayoutMethod") },
      errors: [400, 401, 403, 404],
    }),
  },
};

const statusParam = (values: string[]) => ({ name: "status", in: "query", required: false, schema: { type: "string", enum: values } });
const reasonBody = body(object({ reason: { type: "string", minLength: 3, maxLength: 300 } }, ["reason"]));
const emptyBody = { required: false, content: json(object({})) };
const sensitive = (action: string) =>
  `Sensitive \`${action}\`: request an approval at \`POST /api/v1/affiliate-admin/approvals\` with the same target, have a different operator approve it, then pass its \`approvalId\`. Missing or mismatched approvals are 409.`;

const operatorPaths: Record<string, unknown> = {
  "/api/v1/affiliate-admin/rules": {
    get: operator({
      operationId: "affiliateAdminGetRules",
      summary: "Active program rules",
      ok: { description: "Active version (0 = defaults)", schema: object({ version: int, rules: ref("AffiliateProgramRules"), program: ref("AffiliateProgram") }) },
      errors: [401, 403],
    }),
    post: operator({
      operationId: "affiliateAdminPublishRules",
      summary: "Publish a new rules version",
      description: `${sensitive("affiliate.rules.publish")} Approval target: \`{ rules, note }\`.`,
      requestBody: body(object({ rules: ref("AffiliateProgramRules"), note: { type: ["string", "null"], maxLength: 500 }, approvalId }, ["rules"])),
      ok: { status: 201, description: "Published", schema: object({ version: int, rules: ref("AffiliateProgramRules"), program: ref("AffiliateProgram") }) },
      errors: [400, 401, 403, 409],
    }),
  },
  "/api/v1/affiliate-admin/rules/preview": {
    post: operator({
      operationId: "affiliateAdminPreviewRules",
      summary: "Validate a rules document (no write)",
      requestBody: body(object({ rules: ref("AffiliateProgramRules") }, ["rules"])),
      ok: {
        description: "Normalized rules and budget table",
        schema: object({ valid: { type: "boolean" }, currentVersion: int, nextVersion: int, rules: ref("AffiliateProgramRules"), levels: { type: "array", items: { type: "object" } } }),
      },
      errors: [400, 401, 403],
    }),
  },
  "/api/v1/affiliate-admin/affiliates": {
    get: operator({
      operationId: "affiliateAdminListAffiliates",
      summary: "List affiliates",
      parameters: [statusParam(["active", "suspended"]), limitParam(50, 200)],
      ok: { description: "Affiliates", schema: object({ affiliates: { type: "array", items: ref("AffiliateOperatorAccount") } }) },
      errors: [400, 401, 403],
    }),
  },
  "/api/v1/affiliate-admin/affiliates/{id}/suspend": {
    post: operator({
      operationId: "affiliateAdminSuspendAffiliate",
      summary: "Suspend an affiliate",
      parameters: [idParam],
      requestBody: reasonBody,
      ok: { description: "Suspended", schema: ref("AffiliateOperatorStatus") },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/v1/affiliate-admin/affiliates/{id}/reinstate": {
    post: operator({
      operationId: "affiliateAdminReinstateAffiliate",
      summary: "Reinstate an affiliate",
      parameters: [idParam],
      requestBody: reasonBody,
      ok: { description: "Reinstated", schema: ref("AffiliateOperatorStatus") },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/v1/affiliate-admin/conversions": {
    get: operator({
      operationId: "affiliateAdminListConversions",
      summary: "List conversions",
      parameters: [statusParam(["pending", "available", "held", "reversed"]), limitParam(50, 200)],
      ok: { description: "Conversions", schema: object({ conversions: { type: "array", items: ref("AffiliateOperatorConversion") } }) },
      errors: [400, 401, 403],
    }),
  },
  "/api/v1/affiliate-admin/conversions/{id}/hold": {
    post: operator({
      operationId: "affiliateAdminHoldConversion",
      summary: "Hold a pending conversion",
      parameters: [idParam],
      requestBody: reasonBody,
      ok: { description: "Held", schema: ref("AffiliateOperatorConversion") },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/v1/affiliate-admin/conversions/{id}/release": {
    post: operator({
      operationId: "affiliateAdminReleaseConversion",
      summary: "Release a held conversion",
      parameters: [idParam],
      requestBody: emptyBody,
      ok: { description: "Released", schema: ref("AffiliateOperatorConversion") },
      errors: [400, 401, 403, 409],
    }),
  },
  "/api/v1/affiliate-admin/payouts/preview": {
    get: operator({
      operationId: "affiliateAdminPreviewPayouts",
      summary: "Preview the payouts of a closed month",
      parameters: [{ name: "period", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" } }],
      ok: { description: "Preview", schema: { type: "object" } },
      errors: [400, 401, 403, 409],
    }),
  },
  "/api/v1/affiliate-admin/payouts/batches": {
    get: operator({
      operationId: "affiliateAdminListPayoutBatches",
      summary: "List payout batches",
      parameters: [limitParam(24, 120)],
      ok: { description: "Batches", schema: object({ batches: { type: "array", items: ref("AffiliatePayoutBatch") } }) },
      errors: [401, 403],
    }),
    post: operator({
      operationId: "affiliateAdminCreatePayoutBatch",
      summary: "Create the payout batch of a closed month",
      description: "Locks each payable affiliate's available balance. One batch per period.",
      requestBody: body(object({ period: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" } }, ["period"])),
      ok: { status: 201, description: "Draft batch with items", schema: ref("AffiliatePayoutBatchDetail") },
      errors: [400, 401, 403, 409],
    }),
  },
  "/api/v1/affiliate-admin/payouts/batches/{id}": {
    get: operator({
      operationId: "affiliateAdminGetPayoutBatch",
      summary: "Get a payout batch with items",
      parameters: [idParam],
      ok: { description: "Batch", schema: ref("AffiliatePayoutBatchDetail") },
      errors: [401, 403, 404],
    }),
  },
  "/api/v1/affiliate-admin/payouts/batches/{id}/approve": {
    post: operator({
      operationId: "affiliateAdminApprovePayoutBatch",
      summary: "Approve a draft payout batch",
      description: `${sensitive("affiliate.payout.approve")} Approval target: \`{ batchId }\`.`,
      parameters: [idParam],
      requestBody: body(object({ approvalId })),
      ok: { description: "Approved", schema: ref("AffiliatePayoutBatch") },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/v1/affiliate-admin/payouts/batches/{id}/cancel": {
    post: operator({
      operationId: "affiliateAdminCancelPayoutBatch",
      summary: "Cancel a payout batch without recorded payments",
      parameters: [idParam],
      requestBody: emptyBody,
      ok: { description: "Cancelled", schema: ref("AffiliatePayoutBatch") },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/v1/affiliate-admin/payouts/items/{id}/mark-paid": {
    post: operator({
      operationId: "affiliateAdminMarkPayoutPaid",
      summary: "Record a payout transfer",
      description: "Session only (403 `session_required` for MCP). The batch must be approved; 403 `payouts_disabled` until `AFFILIATE_PAYOUTS_ENABLED` is on. Each external reference is recorded once.",
      parameters: [idParam],
      requestBody: body(
        object(
          {
            externalReference: { type: "string", pattern: "^[A-Za-z0-9._:/-]{4,120}$" },
            payoutCurrency: { type: "string", pattern: "^[a-z]{3}$" },
            fxRate: { type: ["string", "null"], pattern: "^\\d{1,9}(\\.\\d{1,9})?$" },
            payoutAmountMinor: { type: "integer", minimum: 1 },
            providerFeeMinor: { type: ["integer", "null"], minimum: 0 },
          },
          ["externalReference", "payoutCurrency", "payoutAmountMinor"]
        )
      ),
      ok: { description: "Recorded", schema: ref("AffiliatePayoutItem") },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/v1/affiliate-admin/payouts/items/{id}/details": {
    get: operator({
      operationId: "affiliateAdminRevealPayoutDetails",
      summary: "Reveal the payee's transfer details",
      description: "Session only (403 `session_required` for MCP). Every reveal is audited (item and method type, never the details).",
      parameters: [idParam],
      ok: {
        description: "Payee details",
        schema: object({ itemId: str, affiliateId: str, methodType: str, displayHint: str, payeeType: str, residency: str, details: { type: "object", additionalProperties: str } }),
      },
      errors: [401, 403, 404],
    }),
  },
  "/api/v1/affiliate-admin/ledger/adjustments": {
    post: operator({
      operationId: "affiliateAdminAdjustBalance",
      summary: "Adjust an affiliate's available balance",
      description: `${sensitive("affiliate.ledger.adjust")} Approval target: \`{ affiliateId, amountMinor, reason }\`. The ledger entry is keyed by the approval.`,
      requestBody: body(
        object({ affiliateId: str, amountMinor: { type: "integer", description: "Non-zero; positive credits, negative debits" }, reason: { type: "string", minLength: 5, maxLength: 300 }, approvalId }, [
          "affiliateId",
          "amountMinor",
          "reason",
        ])
      ),
      ok: { status: 201, description: "Adjusted", schema: object({ affiliateId: str, amountMinor: int, recorded: { type: "boolean" }, balances: ref("AffiliateBalances") }) },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/v1/affiliate-admin/reconciliation": {
    get: operator({
      operationId: "affiliateAdminReconciliation",
      summary: "Ledger-to-provider reconciliation",
      parameters: [
        { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "until", in: "query", required: false, schema: { type: "string", format: "date-time" } },
      ],
      ok: { description: "Report", schema: { type: "object" } },
      errors: [400, 401, 403],
    }),
  },
  "/api/v1/affiliate-admin/approvals": {
    get: operator({
      operationId: "affiliateAdminListApprovals",
      summary: "Approvals of affiliate actions",
      parameters: [
        statusParam(["pending", "approved", "rejected", "consumed", "expired"]),
        { name: "cursor", in: "query", required: false, schema: str },
        limitParam(50, 100),
      ],
      ok: { description: "Approvals", schema: { type: "array", items: { type: "object" } } },
      errors: [400, 401, 403],
    }),
    post: operator({
      operationId: "affiliateAdminRequestApproval",
      summary: "Request a two-person approval",
      requestBody: body(
        object(
          {
            action: { type: "string", enum: ["affiliate.rules.publish", "affiliate.payout.approve", "affiliate.ledger.adjust"] },
            target: { type: "object", description: "`{ rules, note? }`, `{ batchId }` or `{ affiliateId, amountMinor, reason }`" },
            reason: { type: "string", minLength: 1, maxLength: 500 },
            ttlMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          },
          ["action", "target", "reason"]
        )
      ),
      ok: { status: 201, description: "Pending approval", schema: object({ id: str, status: str, action: str, resource: str, argsHash: str, expiresAt: time }) },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/v1/affiliate-admin/approvals/{id}": {
    get: operator({
      operationId: "affiliateAdminGetApproval",
      summary: "Get an affiliate approval",
      parameters: [idParam],
      ok: { description: "Approval", schema: { type: "object" } },
      errors: [401, 403, 404],
    }),
  },
  "/api/v1/affiliate-admin/approvals/{id}/decision": {
    post: operator({
      operationId: "affiliateAdminDecideApproval",
      summary: "Approve or reject an affiliate approval",
      description: "The decider must be a different operator holding `affiliate:manage`.",
      parameters: [idParam],
      requestBody: body(object({ decision: { type: "string", enum: ["approve", "reject"] } }, ["decision"])),
      ok: { description: "Decided", schema: object({ id: str, status: { type: "string", enum: ["approved", "rejected"] } }) },
      errors: [400, 401, 403, 409],
    }),
  },
};

export const affiliatePaths: Record<string, unknown> = { ...memberPaths, ...operatorPaths };

const level = object({ key: str, minCustomers: int, ordinaryBudgetBps: bps, memberBudgetBps: bps }, ["key", "minCustomers", "ordinaryBudgetBps", "memberBudgetBps"]);
const balances = { pendingMinor: int, heldMinor: int, availableMinor: int, payout_lockedMinor: int, paidMinor: int };

export const affiliateSchemas: Record<string, unknown> = {
  AffiliateError: {
    type: "object",
    properties: { error: { type: "object", required: ["code", "message"], properties: { code: str, message: str, details: {} } } },
  },
  AffiliateProgramRules: object(
    {
      currency: { type: "string", pattern: "^[a-z]{3}$" },
      levels: { type: "array", minItems: 1, maxItems: 10, items: level },
      eligiblePlans: { type: "array", items: { type: "string", enum: ["premium", "vip"] } },
      attributionWindowDays: { type: "integer", minimum: 1, maximum: 90 },
      holdDays: { type: "integer", minimum: 30, maximum: 180 },
      payoutThresholdMinor: { type: "integer", minimum: 0 },
      paypalServiceFeeBps: bps,
      bankVnServiceFeeBps: bps,
      withholding: object({ vnIndividualBps: nullableInt, vnBusinessBps: nullableInt, otherBps: nullableInt }, ["vnIndividualBps", "vnBusinessBps", "otherBps"]),
      termsVersion: str,
    },
    ["currency", "levels", "eligiblePlans", "attributionWindowDays", "holdDays", "payoutThresholdMinor", "paypalServiceFeeBps", "bankVnServiceFeeBps", "withholding", "termsVersion"]
  ),
  AffiliateProgram: {
    type: "object",
    properties: {
      rulesVersion: int,
      currency: str,
      levels: { type: "array", items: level },
      eligiblePlans: { type: "array", items: str },
      attributionWindowDays: int,
      holdDays: int,
      payoutThresholdMinor: int,
      payoutFees: { type: "object", properties: { paypalServiceFeeBps: bps, bankVnServiceFeeBps: bps } },
      termsVersion: str,
      invariant: str,
    },
  },
  AffiliateBalances: { type: "object", properties: balances },
  AffiliatePayoutMethod: {
    type: "object",
    properties: { id: str, type: { type: "string", enum: ["paypal", "bank_vn"] }, displayHint: str, payeeType: str, residency: str, createdAt: time },
  },
  AffiliateSummary: {
    type: "object",
    properties: {
      affiliateId: str,
      status: { type: "string", enum: ["active", "suspended"] },
      termsVersion: str,
      joinedAt: time,
      level: str,
      qualifyingCustomers: int,
      nextLevel: { type: ["object", "null"], properties: { key: str, customersNeeded: int } },
      incentiveBasis: { type: "string", enum: ["ordinary", "member"] },
      budgetBps: bps,
      balances: ref("AffiliateBalances"),
      payoutMethod: { oneOf: [ref("AffiliatePayoutMethod"), { type: "null" }] },
    },
  },
  AffiliateIncentivePreview: {
    type: "object",
    required: ["budgetBps", "discountBps", "commissionBps", "withinBudget"],
    properties: {
      budgetBps: bps,
      discountBps: bps,
      commissionBps: bps,
      withinBudget: { type: "boolean" },
      example: { type: "object", properties: { priceMinor: int, discountMinor: int, buyerPaysMinor: int, commissionMinor: int, merchantKeepsMinor: int } },
    },
  },
  AffiliateLink: {
    type: "object",
    properties: {
      id: str,
      code: str,
      url: { type: "string", format: "uri" },
      label: nullableStr,
      discountBps: bps,
      commissionBps: bps,
      destinationPath: str,
      utmCampaign: nullableStr,
      status: { type: "string", enum: ["active", "paused", "archived"] },
      version: int,
      clicks: int,
      conversions: int,
      createdAt: time,
      updatedAt: time,
    },
  },
  AffiliateConversion: {
    type: "object",
    properties: {
      id: str,
      plan: nullableStr,
      currency: str,
      netMinor: int,
      discountMinor: int,
      commissionBps: bps,
      commissionMinor: int,
      refundedNetMinor: int,
      status: { type: "string", enum: ["pending", "available", "held", "reversed"] },
      paidAt: time,
      maturesAt: time,
    },
  },
  AffiliateLedgerEntry: {
    type: "object",
    properties: { id: str, kind: str, from: nullableStr, to: nullableStr, amountMinor: int, currency: str, conversionId: nullableStr, payoutItemId: nullableStr, reason: nullableStr, createdAt: time },
  },
  AffiliatePayoutItem: {
    type: "object",
    properties: {
      id: str,
      batchId: str,
      period: str,
      batchStatus: str,
      affiliateId: str,
      methodType: str,
      grossMinor: int,
      serviceFeeMinor: int,
      withholdingMinor: int,
      netMinor: int,
      status: { type: "string", enum: ["pending", "paid", "cancelled"] },
      payoutCurrency: nullableStr,
      fxRate: nullableStr,
      payoutAmountMinor: nullableInt,
      providerFeeMinor: nullableInt,
      externalReference: nullableStr,
      paidAt: nullableTime,
    },
  },
  AffiliatePayoutBatch: {
    type: "object",
    properties: {
      id: str,
      period: str,
      currency: str,
      status: { type: "string", enum: ["draft", "approved", "paid", "cancelled"] },
      rulesVersion: int,
      thresholdMinor: int,
      createdBy: str,
      approvedBy: nullableStr,
      approvedAt: nullableTime,
      cancelledAt: nullableTime,
      createdAt: time,
    },
  },
  AffiliatePayoutBatchDetail: {
    allOf: [
      ref("AffiliatePayoutBatch"),
      {
        type: "object",
        properties: {
          totals: { type: "object", properties: { items: int, grossMinor: int, netMinor: int } },
          items: { type: "array", items: ref("AffiliatePayoutItem") },
        },
      },
    ],
  },
  AffiliateOperatorAccount: {
    type: "object",
    properties: {
      affiliateId: str,
      userId: str,
      status: str,
      suspendedReason: nullableStr,
      termsVersion: str,
      joinedAt: time,
      level: str,
      qualifyingCustomers: int,
      incentiveBasis: str,
      budgetBps: bps,
      balances: ref("AffiliateBalances"),
    },
  },
  AffiliateOperatorStatus: { type: "object", properties: { affiliateId: str, userId: str, status: str, suspendedReason: nullableStr, updatedAt: time } },
  AffiliateOperatorConversion: {
    type: "object",
    properties: {
      id: str,
      affiliateId: str,
      buyerUserId: str,
      polarOrderId: str,
      plan: nullableStr,
      currency: str,
      netMinor: int,
      discountMinor: int,
      commissionBps: bps,
      commissionMinor: int,
      refundedNetMinor: int,
      status: str,
      holdReason: nullableStr,
      paidAt: time,
      maturesAt: time,
    },
  },
};
