import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { recordModerationDecision } from "@/lib/domain/moderation";
import { z } from "zod";

const DecideBodySchema = z.object({
  caseId: z.string().uuid(),
  decision: z.enum(["approved", "changes_requested", "rejected", "quarantined"]),
  reasonCodes: z.array(z.string()).min(1),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  // 1. Authenticate admin session
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if ((session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = DecideBodySchema.parse(body);

    // Human reviewer ID and role are strictly derived from the verified session
    const decision = await recordModerationDecision({
      caseId: validated.caseId,
      decision: validated.decision,
      reasonCodes: validated.reasonCodes,
      humanReviewerId: session.user.id,
      reviewerRole: session.user.role || "admin",
      notes: validated.notes,
    });

    return NextResponse.json({ data: decision }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to record moderation decision";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
