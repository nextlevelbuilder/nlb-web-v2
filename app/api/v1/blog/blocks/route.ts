import { listBlockDefinitions } from "@/lib/blog/blocks/registry";
import { NextResponse } from "next/server";

/** Public block catalogue: type, title, description, category, JSON Schema of props and an example. */
export function GET() {
  return NextResponse.json({ data: listBlockDefinitions() }, { headers: { "cache-control": "public, max-age=300" } });
}
