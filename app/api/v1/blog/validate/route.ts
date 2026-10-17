import { validateBlocks } from "@/lib/blog/blocks/registry";
import { badRequest } from "@/lib/blog/blog-errors";
import { dataResponse, handleBlogRead, parseJsonBody, readBodyText } from "@/lib/blog/blog-route-helpers";

/** Public dry-run validation of a blocks array; invalid blocks are a 200 with `valid: false`. */
export async function POST(request: Request) {
  return handleBlogRead(async () => {
    const body = parseJsonBody(await readBodyText(request));
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw badRequest("Body must be a JSON object: { blocks }.");
    const result = validateBlocks((body as { blocks?: unknown }).blocks);
    return dataResponse(result.ok ? { valid: true, errors: [] } : { valid: false, errors: result.issues });
  });
}
