# Website chat (Dewee)

A Dewee agent answers visitors on every public page in English and Vietnamese: it advises on Premium and VIP, the courses and the community, sends product, course and checkout links, and records leads. It never takes payment itself; checkout links open the existing pre-checkout dialog (price, Terms, then Polar).

## How it fits together

| Piece | Owner | Notes |
|---|---|---|
| Widget | [`components/chat/site-chat.tsx`](../components/chat/site-chat.tsx), mounted in [`app/[locale]/layout.tsx`](../app/[locale]/layout.tsx) | `dewee-webchat` (exact version in `package.json`). Loaded with a dynamic import after `load` and an idle callback, only when `GET /api/chat/status` reports `enabled`. Hidden on account, profile, studio, onboarding, success, sign-in, sign-up and OAuth pages. Theme and accent follow the Constellation tokens. Copy lives under `chat` in `messages/{en,vi}.json`. |
| Backend proxy | [`app/api/dewee/[...path]/route.ts`](../app/api/dewee/[...path]/route.ts) | `createDeweeHandler` with the `ccp` transport. Holds every credential; the browser only gets short-lived visitor session tokens. |
| Page actions | [`components/chat/site-chat-actions.ts`](../components/chat/site-chat-actions.ts) | `site.catalog` (read), `site.navigate` (allowlisted pages and slugs), `checkout.membership` (opens the checkout dialog), `lead.save` (mutate: the widget asks the visitor first, and that approval is the recorded consent). |
| Catalog | [`lib/chat/chat-catalog.ts`](../lib/chat/chat-catalog.ts), `GET /api/chat/catalog?locale=` | Built from the same sources the pages render: launch prices and seat caps, real seat counts, plan features and FAQ from the message catalogues, published course videos, refund and terms links. |
| Leads | [`lib/chat/chat-lead-service.ts`](../lib/chat/chat-lead-service.ts), `POST /api/chat/leads`, `GET /api/admin/chat-leads` | D1 table `chat_leads` (name, email, need, interest, `wants_human`, locale, page, user id, hashed IP, `status`, consent time). Same-origin only, 8 KB body cap, 5 leads per address per hour. Each lead posts a Discord embed with a masked email. Admins read full rows from the admin route. |
| Checkout deep link | [`components/checkout/use-checkout-deep-link.ts`](../components/checkout/use-checkout-deep-link.ts) | `/?checkout=premium\|vip&billing=quarterly\|annual#pricing` (or `/vi?...`) opens that plan's dialog. Sold-out plans do nothing. |

These routes are not part of `/api/v1` and are not in the OpenAPI document.

## Signed-in members

When the three `DEWEE_IDENTITY_*` values are set, the proxy signs a 60-second HS256 session assertion ([`lib/chat/dewee-identity-signer.ts`](../lib/chat/dewee-identity-signer.ts)) for the Better Auth user id on each request; Dewee verifies it and binds the conversation to that member. The subject is the opaque user id, never an email. Without them every visitor chats anonymously.

## Configuration

Worker secrets, set per environment (listed in `SECRET_KEYS` of [`scripts/provision-cloudflare.sh`](../scripts/provision-cloudflare.sh), or by hand with `wr secret put <KEY> --env staging` / `--env=""`):

| Secret | Value |
|---|---|
| `DEWEE_CCP_CHAT_URL` | Chat URL of the control-plane "Website chat" integration |
| `DEWEE_WEBCHAT_INTEGRATION_ID` | `wci_…` |
| `DEWEE_WEBCHAT_INTEGRATION_SECRET` | `dwc_…`, server only |
| `DEWEE_WEBCHAT_SECRET` | 32+ random characters; signs visitor session tokens |
| `DEWEE_IDENTITY_APP_ID`, `DEWEE_IDENTITY_ISSUER`, `DEWEE_IDENTITY_ASSERTION_SECRET` | Optional identity application (all three or none) |
| `DISCORD_LEADS_WEBHOOK_URL` | Optional; falls back to `DISCORD_SALES_WEBHOOK_URL` |

The widget stays hidden until the first four are set. The lead IP hash uses `TRAFFIC_HASH_SECRET`, or `BETTER_AUTH_SECRET` when that is unset.

In the Dewee control plane, the integration lists the allowed origins (`https://nextlevelbuilder.io`, `https://www.nextlevelbuilder.io`, `https://staging.nextlevelbuilder.io`, `http://localhost:3000`). The agent's instructions must tell it to call `site.catalog` before quoting any price, feature or link, to answer in the visitor's language, to send absolute markdown links, and to ask for name, email and need before `lead.save` (with `wantsHuman` when the visitor asks for a person).

## Operating

- Read leads: `GET /api/admin/chat-leads?limit=100` with an admin session or API key.
- Turn the chat off: delete `DEWEE_CCP_CHAT_URL` (or any of the first four secrets). `/api/chat/status` is cached for 5 minutes.
- Upgrading `dewee-webchat`: check the page action, identity and `ccp` handler options in its changelog; the widget's styles are in its Shadow DOM, so site CSS cannot break it.
