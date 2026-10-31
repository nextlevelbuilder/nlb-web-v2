import { z, type ZodType, type ZodTypeDef } from "zod";
import { ToolError, type ToolContext } from "../tool-context.js";
import type { McpToolDefinition, resolveToolEnv } from "./index.js";

type ResolveToolEnv = typeof resolveToolEnv;

const credentialArgs = { api_key: z.string().optional(), api_url: z.string().optional() };
const credentialProps = {
  api_key: { type: "string", description: "NLB admin API key; otherwise uses the configured NLB_API_KEY (ignored for OAuth calls)" },
  api_url: { type: "string", description: "Allowed directory API endpoint (optional)" }
};

const ADMIN_NOTE = "Requires an admin identity (OAuth mcp:write as an admin, or an admin API key).";
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase-hyphen slug").max(120);
const streamUidSchema = z.string().regex(/^[a-f0-9]{32}$/, "Expected 32 lowercase hex characters");
const slugProp = { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 120, description: "Video slug, e.g. nlb-weekly-41-bai-hoc-trien-khai-ai-cho-doanh-nghiep" };
const streamUidProp = { type: "string", pattern: "^[a-f0-9]{32}$", description: "Stream video uid (from course_create_upload)" };

const videoFieldProps = {
  title: { type: "string", maxLength: 200, description: "e.g. \"NLB Weekly #41: …\"" },
  description: { type: "string", maxLength: 5000, description: "Summary, then a blank line and \"Diễn giả: <name> · YYYY-MM-DD\"" },
  locale: { type: "string", enum: ["en", "vi"], description: "Default vi" },
  weekNumber: { type: ["integer", "null"], minimum: 0, maximum: 1000 },
  streamUid: { type: ["string", "null"], pattern: "^[a-f0-9]{32}$" },
  durationSec: { type: "integer", minimum: 0, description: "From course_get_upload once ready" },
  priceCents: { type: "integer", minimum: 50, description: "Minor units; NLB Weekly recordings use 900 (9 USD). Locked once published." },
  currency: { type: "string", pattern: "^[a-zA-Z]{3}$", description: "Default usd" },
  thumbnailUrl: { type: ["string", "null"], description: "https URL or null" }
};

function parseArgs<T>(schema: ZodType<T, ZodTypeDef, unknown>, args: unknown, tool: string): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    throw new ToolError(`Invalid arguments for ${tool}: ${details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join("; ")}`, { details });
  }
  return result.data;
}

interface CourseCall {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
  /** Public reads never borrow the server's configured API key. */
  anonymous?: boolean;
}

async function courseRequest(
  resolveEnv: ResolveToolEnv,
  args: { api_key?: string; api_url?: string },
  context: ToolContext | undefined,
  call: CourseCall
): Promise<unknown> {
  const { apiUrl, apiKey } = resolveEnv(args, context);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey && !call.anonymous) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  if (call.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await (context?.fetch ?? fetch)(`${apiUrl}${call.path}`, {
    method: call.method,
    headers,
    body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = undefined;
  }
  if (!response.ok) {
    // Courses routes answer `{ error, code, details? }`.
    const body = json as { error?: unknown; code?: unknown; details?: unknown } | undefined;
    const code = typeof body?.code === "string" ? body.code : undefined;
    const message = typeof body?.error === "string" ? body.error : (text.trim().slice(0, 500) || response.statusText || "Request failed");
    const data: Record<string, unknown> = { status: response.status };
    if (code) data.code = code;
    if (body?.details !== undefined) data.details = body.details;
    if (response.status === 401 || response.status === 403) {
      data.hint = context?.oauth
        ? "The NLB API rejected this OAuth identity; course management requires an admin account connected with mcp:write."
        : "Course management requires an admin account API key (api_key or NLB_API_KEY).";
    }
    throw new ToolError(`Courses API error (HTTP ${response.status}${code ? ` ${code}` : ""}: ${message})`, data);
  }
  if (json === undefined) throw new Error(`Courses API returned a non-JSON response for ${call.path}`);
  return json;
}

const enc = encodeURIComponent;

const ListArgs = z.object(credentialArgs).strict();
const CreateUploadArgs = z.object({
  name: z.string().trim().min(1).max(200),
  size_bytes: z.number().int().min(1),
  max_duration_sec: z.number().int().min(1).max(21600).optional(),
  ...credentialArgs
}).strict();
const UploadStatusArgs = z.object({ stream_uid: streamUidSchema, ...credentialArgs }).strict();
const CreateVideoArgs = z.object({ video: z.object({ slug: slugSchema }).passthrough(), ...credentialArgs }).strict();
const UpdateVideoArgs = z.object({ slug: slugSchema, changes: z.record(z.unknown()), ...credentialArgs }).strict();
const SlugArgs = z.object({ slug: slugSchema, ...credentialArgs }).strict();

/**
 * Builds the Courses tools over `/api/courses/*`. The admin tools reserve a signed-only Stream upload,
 * read its processing status, register the video as a draft and publish it (which creates the Polar product).
 * The web validates every body and checks the admin role, so the tools only shape arguments.
 */
export function createCourseTools(resolveEnv: ResolveToolEnv): McpToolDefinition[] {
  return [
    {
      name: "course_list_videos",
      description: "List published course videos (NLB Weekly recordings and others) with slug, title, description, weekNumber, duration and price. Use it to pick the next weekNumber and to follow the title, slug and description conventions. Public; no auth required.",
      inputSchema: { type: "object", properties: { ...credentialProps } },
      handler: async (args, context) => {
        const a = parseArgs(ListArgs, args, "course_list_videos");
        return courseRequest(resolveEnv, a, context, { method: "GET", path: "/api/courses/videos", anonymous: true });
      }
    },
    {
      name: "course_create_upload",
      description: `Step 1 of publishing a course video: reserve a signed-only Cloudflare Stream video and get a one-time tus upload URL. Send the file to data.uploadUrl with the tus protocol (\`nlb courses put <file> <uploadUrl>\` does it), then poll course_get_upload. The URL needs no credentials. ${ADMIN_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 200, description: "Stream dashboard name, e.g. \"41 - 2026-10-17 - Cường Võ\"" },
          size_bytes: { type: "integer", minimum: 1, description: "Exact file size in bytes" },
          max_duration_sec: { type: "integer", minimum: 1, maximum: 21600, description: "Default 21600 (6 h)" },
          ...credentialProps
        },
        required: ["name", "size_bytes"]
      },
      handler: async (args, context) => {
        const a = parseArgs(CreateUploadArgs, args, "course_create_upload");
        const body = { name: a.name, sizeBytes: a.size_bytes, ...(a.max_duration_sec ? { maxDurationSec: a.max_duration_sec } : {}) };
        return courseRequest(resolveEnv, a, context, { method: "POST", path: "/api/courses/uploads", body });
      }
    },
    {
      name: "course_get_upload",
      description: `Step 2: read the Stream processing status of an upload: state (pendingupload, queued, inprogress, ready, error), readyToStream, requireSignedUrls and durationSec. Register the video once state is ready. ${ADMIN_NOTE}`,
      inputSchema: { type: "object", properties: { stream_uid: streamUidProp, ...credentialProps }, required: ["stream_uid"] },
      handler: async (args, context) => {
        const a = parseArgs(UploadStatusArgs, args, "course_get_upload");
        return courseRequest(resolveEnv, a, context, { method: "GET", path: `/api/courses/uploads/${enc(a.stream_uid)}` });
      }
    },
    {
      name: "course_create_video",
      description: `Step 3: register a draft course video. The server re-confirms signed-only playback on Stream. A taken slug fails with 409 slug_taken. ${ADMIN_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          video: { type: "object", properties: { slug: slugProp, ...videoFieldProps }, required: ["slug", "title", "priceCents"] },
          ...credentialProps
        },
        required: ["video"]
      },
      handler: async (args, context) => {
        const a = parseArgs(CreateVideoArgs, args, "course_create_video");
        return courseRequest(resolveEnv, a, context, { method: "POST", path: "/api/courses/videos", body: a.video });
      }
    },
    {
      name: "course_update_video",
      description: `Change fields of a course video (partial): title, description, weekNumber, durationSec, thumbnailUrl, streamUid, or status draft/archived. Price and currency are locked once published. ${ADMIN_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          slug: slugProp,
          changes: { type: "object", properties: { ...videoFieldProps, status: { type: "string", enum: ["draft", "archived"] } } },
          ...credentialProps
        },
        required: ["slug", "changes"]
      },
      handler: async (args, context) => {
        const a = parseArgs(UpdateVideoArgs, args, "course_update_video");
        return courseRequest(resolveEnv, a, context, { method: "PATCH", path: `/api/courses/videos/${enc(a.slug)}`, body: a.changes });
      }
    },
    {
      name: "course_publish_video",
      description: `Step 4: publish a draft video. Creates its one-time Polar product (idempotent) and lists it on /courses. ${ADMIN_NOTE}`,
      inputSchema: { type: "object", properties: { slug: slugProp, ...credentialProps }, required: ["slug"] },
      handler: async (args, context) => {
        const a = parseArgs(SlugArgs, args, "course_publish_video");
        return courseRequest(resolveEnv, a, context, { method: "POST", path: `/api/courses/videos/${enc(a.slug)}/publish` });
      }
    }
  ];
}
