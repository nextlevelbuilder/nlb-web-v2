import { z } from "zod";

/** URLs rendered as product links, embeds and media must use a web protocol. */
export const HttpUrlSchema = z.string().url().regex(/^https?:\/\//i, "Use an HTTP or HTTPS URL");

/**
 * Stricter author-side URL check used by the CLI and MCP before a document reaches the server:
 * HTTPS only, with plain HTTP allowed for loopback development hosts.
 */
export const SafeHttpUrlSchema = z.string().superRefine((val, ctx) => {
  try {
    const parsed = new URL(val);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "https:") return;
    if (protocol === "http:") {
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "URL must use HTTPS protocol (HTTP is allowed only for localhost development)"
    });
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid URL format" });
  }
});
