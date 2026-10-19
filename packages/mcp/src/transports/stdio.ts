import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createNlbMcpServer, SERVER_NAME } from "../server.js";

/**
 * Serves MCP over stdio (2026-07-28 and 2025-era clients). No OAuth: the local process is trusted
 * and tools read NLB_API_KEY / NLB_API_URL / NLB_SESSION_COOKIE from the environment.
 */
export function startStdioServer(): void {
  const handle = serveStdio(() => createNlbMcpServer({ kind: "local" }), {
    onerror: (error) => process.stderr.write(`[${SERVER_NAME}] ${error.message}\n`)
  });
  process.on("SIGINT", () => {
    handle.close().finally(() => process.exit(0));
  });
}
