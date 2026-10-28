/** NLB Live OpenAPI paths and schemas, merged additively into lib/openapi.ts. */
import { liveMemberPaths } from "./live-member-openapi";
import { liveOperatorPaths } from "./live-operator-openapi";

export { liveSchemas } from "./live-openapi-schemas";

export const livePaths: Record<string, unknown> = { ...liveMemberPaths, ...liveOperatorPaths };
