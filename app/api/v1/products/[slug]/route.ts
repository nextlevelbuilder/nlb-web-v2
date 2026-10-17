import { NextResponse } from "next/server";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;

  try {
    const result = await getPublishedProductBySlug(slug);
    if (!result) {
      return NextResponse.json({ error: "Product not found or not published" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        product: result.product,
        revision: result.revision,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load product";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
