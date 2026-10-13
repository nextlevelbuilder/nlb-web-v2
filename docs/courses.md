# Courses

Courses sell individual videos. Each video is bought once through Polar and plays through Cloudflare Stream signed URLs. Members on a qualifying plan (VIP by default) can watch everything.

## Decisions

| Decision | Why | Owner |
|---|---|---|
| One one-time Polar product per video, created when the video is published | Per-video purchase without a cart. Polar is merchant of record. | [`lib/courses/course-polar-product.ts`](../lib/courses/course-polar-product.ts) |
| The price is locked once the Polar product exists | Avoids a mismatch between the D1 price and Polar | [`lib/courses/course-video-service.ts`](../lib/courses/course-video-service.ts) |
| VIP unlocks every video, Premium does not | A product decision, changeable in one place | `COURSE_ACCESS_PLANS` in [`lib/courses/course-access-policy.ts`](../lib/courses/course-access-policy.ts), overridable per environment with the `COURSES_ACCESS_PLANS` var in [`wrangler.jsonc`](../wrangler.jsonc). `none` disables plan access. An invalid value falls back to the constant. |
| `trialing` subscriptions do not grant access | Paid content requires a paid period | `ACTIVE_SUBSCRIPTION_STATUSES` (same file) |
| Archived videos stay playable for existing buyers, but the detail page returns 404 | Buyers keep what they paid for. New buyers cannot find it. | Token route, detail page |
| A full refund revokes access. A partial refund keeps it. A repurchase after a refund restores it. | Matches Polar's event semantics (`order.refunded` is also sent for partial refunds) | [`lib/courses/course-webhook-entitlements.ts`](../lib/courses/course-webhook-entitlements.ts) |
| Signed Stream URLs (RS256, short-lived), no DRM | Stops link sharing at reasonable cost. Hard DRM is a non-goal. | [`lib/courses/stream-signed-url.ts`](../lib/courses/stream-signed-url.ts) |

## Access rule

[`lib/courses/course-video-access.ts`](../lib/courses/course-video-access.ts) decides who may watch. A viewer qualifies with any one of the following (the file's doc comment is authoritative):
1. an active `video:<id>` entitlement (granted by the Polar webhook on a paid order);
2. a paid or partially refunded order for the video's Polar product placed with the viewer's email;
3. an `active` subscription on a plan in the access policy whose `current_period_end` is still in the future. A VIP who cancels keeps access until the paid period ends; a subscription without a period end does not qualify.

Commerce rows are keyed by email. That is safe because every sign-in method proves the email (email OTP or OAuth, with password sign-in disabled).

The token endpoint also refuses (409 `stream_not_signed_only`) any video that the service has not confirmed as signed-only on Stream. It documents its status codes in its header comment: [`app/api/courses/videos/[slug]/token/route.ts`](../app/api/courses/videos/%5Bslug%5D/token/route.ts).

## Endpoints

These live under `app/api/courses/`. They are not part of `/api/v1` or the OpenAPI document.

| Endpoint | Who |
|---|---|
| `GET /api/courses/videos`, `GET /api/courses/videos/<slug>` | public catalogue. The Stream uid is never exposed. |
| `POST /api/courses/videos`, `PATCH /api/courses/videos/<slug>` | admin |
| `POST /api/courses/videos/<slug>/publish` | admin. Creates the Polar product. |
| `POST /api/courses/videos/<slug>/checkout` | signed-in user. Returns a Polar checkout URL. |
| `POST /api/courses/videos/<slug>/token` | signed-in user with access. Returns a signed playback URL. |

Admin means `role === "admin"` through `resolveCaller`, which accepts a session or an API key ([`lib/courses/course-route-helpers.ts`](../lib/courses/course-route-helpers.ts)). Request bodies are defined by [`lib/courses/course-video-schemas.ts`](../lib/courses/course-video-schemas.ts).

Pages: `/courses` and `/courses/<slug>` (and `/vi/...`). UI components are in `components/courses/`.

## One-time setup: Cloudflare Stream

Stream is not reachable with the current API token or OAuth scopes. The account owner does this once:
1. Enable Stream on the hi@ dashboard. Note the customer subdomain (`customer-<code>.cloudflarestream.com`).
2. Create a signing key with a token that has **Stream: Edit**:
   `curl -X POST -H "Authorization: Bearer <token>" https://api.cloudflare.com/client/v4/accounts/7ac87c90789159ae1b10b7d78f5dcc08/stream/keys`
   `result.id` and `result.jwk` are shown once. Pipe them straight into the secrets in the next step. Do not paste them into files or chat.
3. Set the Worker secrets for each environment. Production uses `--env=""`, staging uses `--env staging` (see [deployment-guide.md](./deployment-guide.md) for the wrangler invocation): `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_KEY_JWK`, `CF_STREAM_CUSTOMER_SUBDOMAIN`, and `CF_STREAM_API_TOKEN` (Stream: Edit; `CF_ACCOUNT_ID` is already a var in `wrangler.jsonc`). The token endpoint returns 503 until the signing values are set; registering or publishing a video returns 503 until the API token is set.
4. `POLAR_ACCESS_TOKEN` needs `products:write` so that publishing can create products.

## Publishing a video

1. Upload the video to Stream. Registering or publishing it calls the Stream API to set `requireSignedURLs: true` and checks the answer ([`lib/courses/stream-video-api.ts`](../lib/courses/stream-video-api.ts)); only then is the video marked `stream_signed_only` in D1. An unknown uid returns 422, a Stream failure 502.
2. As an admin, `POST /api/courses/videos` with the slug, title, price and `streamUid`. The video is created as a draft.
3. `POST /api/courses/videos/<slug>/publish`. This creates the Polar product and makes the video visible.
4. Verify on staging:
   - an unpaid account gets 403 from the token endpoint;
   - a purchaser or VIP gets a URL that plays;
   - an anonymous request gets 401.

## Tests

`tests/courses-*.test.ts` cover the access policy, admin routes, the Polar product, signed URLs, the token route and webhook entitlements.
