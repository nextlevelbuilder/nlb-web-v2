import { getOAuthAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const GET = async (request: Request) => {
  const handler = toNextJsHandler(getOAuthAuth());
  return handler.GET(request);
};

export const POST = async (request: Request) => {
  const handler = toNextJsHandler(getOAuthAuth());
  return handler.POST(request);
};
