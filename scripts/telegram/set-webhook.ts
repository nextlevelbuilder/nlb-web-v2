/**
 * Register the Telegram webhook for the onboarding bot.
 *
 * Usage (reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment):
 *   npx tsx scripts/telegram/set-webhook.ts --url https://<host>/api/telegram/webhook
 *
 * Prints only Telegram's `ok` flag and description; the token and secret are never printed.
 */

const ALLOWED_UPDATES = ["message", "chat_join_request"] as const;

function readUrlArg(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") return argv[i + 1];
    if (arg.startsWith("--url=")) return arg.slice("--url=".length);
  }
  return undefined;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const url = readUrlArg(process.argv.slice(2));

  if (!token) fail("TELEGRAM_BOT_TOKEN is not set");
  if (!secret) fail("TELEGRAM_WEBHOOK_SECRET is not set");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) fail("TELEGRAM_WEBHOOK_SECRET must be 1-256 chars of A-Z a-z 0-9 _ -");
  if (!url) fail("Missing --url https://<host>/api/telegram/webhook");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("--url is not a valid URL");
  }
  if (parsed.protocol !== "https:") fail("--url must use https");

  let body: { ok?: boolean; description?: string };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: parsed.toString(), secret_token: secret, allowed_updates: ALLOWED_UPDATES }),
    });
    body = (await response.json()) as typeof body;
  } catch {
    fail("setWebhook request failed (network or invalid response)");
  }

  console.log(JSON.stringify({ ok: body.ok === true, description: body.description ?? null }));
  if (body.ok !== true) process.exit(1);
}

void main();
