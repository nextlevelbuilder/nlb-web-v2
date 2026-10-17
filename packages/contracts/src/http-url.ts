import { z } from "zod";

/** URLs rendered as product links, embeds and media must use a web protocol. */
export const HttpUrlSchema = z.string().url().regex(/^https?:\/\//i, "Use an HTTP or HTTPS URL");
