import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { getSepayOrder } from "@/lib/payments/sepay-orders";
import { sepayOrderView } from "@/lib/payments/sepay-catalog";

export const dynamic = "force-dynamic";

/** Status of the caller's own SePay order, polled by the transfer page until it is paid. */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const caller = await resolveCaller(request.headers);
  if (!caller) return NextResponse.json({ error: "Sign in to continue", code: "unauthorized" }, { status: 401 });
  const { code } = await context.params;
  const order = /^[A-Za-z0-9]{6,32}$/.test(code) ? await getSepayOrder(getDb(), code) : null;
  if (!order || order.userId !== caller.user.id) {
    return NextResponse.json({ error: "Order not found", code: "not_found" }, { status: 404 });
  }
  return NextResponse.json(sepayOrderView(order));
}
