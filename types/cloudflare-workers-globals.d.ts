// Workers binding types used by cloudflare-env.d.ts, imported without the full Workers runtime lib
// (which would replace DOM fetch/Response typings used across the Next.js app).
type D1Database = import("@cloudflare/workers-types").D1Database;
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;
type R2Bucket = import("@cloudflare/workers-types").R2Bucket;
type Queue<Body = unknown> = import("@cloudflare/workers-types").Queue<Body>;
type Ai = import("@cloudflare/workers-types").Ai;
type Fetcher = import("@cloudflare/workers-types").Fetcher;

// The runtime module worker.ts extends; declared narrowly for the same reason as the types above.
declare module "cloudflare:workers" {
  export abstract class WorkerEntrypoint<Env = unknown> {
    protected readonly ctx: import("@cloudflare/workers-types").ExecutionContext;
    protected readonly env: Env;
    constructor(ctx: import("@cloudflare/workers-types").ExecutionContext, env: Env);
  }
}
