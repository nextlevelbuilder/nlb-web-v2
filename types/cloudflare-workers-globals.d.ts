// Workers binding types used by cloudflare-env.d.ts, imported without the full Workers runtime lib
// (which would replace DOM fetch/Response typings used across the Next.js app).
type D1Database = import("@cloudflare/workers-types").D1Database;
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;
type R2Bucket = import("@cloudflare/workers-types").R2Bucket;
type Queue<Body = unknown> = import("@cloudflare/workers-types").Queue<Body>;
type Ai = import("@cloudflare/workers-types").Ai;
type Fetcher = import("@cloudflare/workers-types").Fetcher;
