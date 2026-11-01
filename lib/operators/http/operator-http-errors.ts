/**
 * Error envelope of `/api/v1/operator/*` (shared `/api/v1` shape `{ error: { code, message, details? } }`,
 * see lib/builder-league/http.ts):
 *
 * - `OperatorAccessError` (401/403 deny, 409 approval problems), `OperatorServiceError` and the Courses
 *   domain's `CourseError` keep status and code;
 * - zod validation errors become 400 `validation_failed`;
 * - `BuilderApiError` (same-site, cursor, Builder League domain errors) keeps its own;
 * - anything else is logged and answered as a generic 500, never leaked.
 */
import { ZodError } from "zod";
import { builderErrorResponse, fail } from "@/lib/builder-league/http";
import { OperatorAccessError } from "@/lib/operators/operator-errors";
import { OperatorServiceError } from "@/lib/operators/operator-service-error";
import { CourseError } from "@/lib/courses/course-errors";

export function operatorErrorResponse(err: unknown): Response {
  if (err instanceof OperatorAccessError || err instanceof OperatorServiceError || err instanceof CourseError) return fail(err.status, err.code, undefined, err.message);
  if (err instanceof ZodError) {
    return fail(400, "validation_failed", err.errors.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
  return builderErrorResponse(err);
}

export async function withOperatorErrors(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    return operatorErrorResponse(err);
  }
}
