// Backend of the website chat widget: config, session, chat (SSE) and history at /api/dewee/*.
// The CCP integration secret and the identity assertion secret stay here; the browser only holds
// signed visitor tokens. Not part of /api/v1.
import { NextResponse } from "next/server";
import { createDeweeHandler, type DeweeHandler, type DeweeHandlerOptions } from "dewee-webchat/server";
import { getAuth } from "@/lib/auth";
import { deweeIdentitySdk } from "@/lib/chat/dewee-identity-signer";
import { getDeweeRuntimeEnv, isDeweeChatConfigured, type DeweeRuntimeEnv } from "@/lib/chat/dewee-runtime-env";

export const dynamic = "force-dynamic";

/** The signed-in NLB user's stable id, or null for a visitor. Throwing makes the handler answer 503. */
async function authenticate(request: Request): Promise<{ subject: string } | null> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const id = session?.user?.id;
  return typeof id === "string" && id ? { subject: id } : null;
}

function handlerOptions(env: DeweeRuntimeEnv): DeweeHandlerOptions {
  const options: DeweeHandlerOptions = {
    transport: "ccp",
    ccp: {
      chatUrl: env.DEWEE_CCP_CHAT_URL!,
      integrationId: env.DEWEE_WEBCHAT_INTEGRATION_ID!,
      integrationSecret: env.DEWEE_WEBCHAT_INTEGRATION_SECRET!,
    },
    secret: env.DEWEE_WEBCHAT_SECRET!,
  };
  // Signed-in visitors are passed to Dewee only when the identity application is configured;
  // otherwise everyone chats anonymously, which is the handler's default.
  if (env.DEWEE_IDENTITY_APP_ID && env.DEWEE_IDENTITY_ISSUER && env.DEWEE_IDENTITY_ASSERTION_SECRET) {
    options.identity = {
      sdk: deweeIdentitySdk,
      authenticate,
      // The login is a cookie, so a widget token replayed under another user's cookie must not work.
      rebindEachRequest: true,
      appId: env.DEWEE_IDENTITY_APP_ID,
      issuer: env.DEWEE_IDENTITY_ISSUER,
      assertionSecret: env.DEWEE_IDENTITY_ASSERTION_SECRET,
    };
  }
  return options;
}

// Built on the first request (bindings exist only inside a request) and reused by the isolate, so
// identity sessions and the in-memory rate limits are shared between requests.
let handler: DeweeHandler | undefined;

async function dewee(request: Request): Promise<Response> {
  const env = getDeweeRuntimeEnv();
  if (!isDeweeChatConfigured(env)) {
    return NextResponse.json({ error: { code: "chat_unavailable", message: "Chat is not configured" } }, { status: 503 });
  }
  handler ??= createDeweeHandler(handlerOptions(env));
  return handler(request);
}

export { dewee as GET, dewee as POST, dewee as OPTIONS };
