import { renderApiReference } from "@/lib/api-reference";

export const dynamic = "force-static";

export async function GET() {
  return new Response(renderApiReference(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
