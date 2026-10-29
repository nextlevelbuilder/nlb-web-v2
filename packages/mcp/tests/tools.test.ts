import { describe, it, expect } from "vitest";
import { validateAllowedApiUrl } from "../src/tools/index.js";
import { createDocumentFromTemplate } from "@nextlevelbuilder/contracts";
import { callTool } from "./helpers.js";

describe("MCP: Tools Execution & Security", () => {
  it("should execute validate_listing tool with valid document", async () => {
    const doc = createDocumentFromTemplate("ai-agent-tool", {
      name: "Smart MCP Agent",
      slug: "smart-mcp-agent",
      tagline: "Autonomous Agent with MCP tools",
      description: "An AI agent for developers.",
      websiteUrl: "https://agent.example.com"
    });

    const { isError, payload } = await callTool("validate_listing", { document: doc });
    expect(isError).toBe(false);
    expect(payload.valid).toBe(true);
    expect(payload.contentHash).toHaveLength(64);
  });

  it("should reject unauthenticated worker mutation in submit_product", async () => {
    const doc = createDocumentFromTemplate("developer-cli", {
      name: "Test Tool",
      slug: "test-tool",
      tagline: "A test tool",
      description: "Test description",
      websiteUrl: "https://example.com"
    });

    const { status, isError, payload } = await callTool("submit_product", { document: doc });
    expect(status).toBe(200);
    expect(isError).toBe(true);
    expect(payload.error).toContain("Unauthorized");
  });

  it("should reject all mutating tools when the caller presents no Worker token", async () => {
    const env = { WORKER_AUTH_TOKEN: "worker-token" };
    for (const toolName of ["submit_product", "cast_vote", "upload_media", "create_checkout", "create_api_key", "revoke_api_key"]) {
      const { isError, payload } = await callTool(toolName, {}, env);
      expect(isError, toolName).toBe(true);
      expect(payload.error, toolName).toContain("Unauthorized");
    }
  });

  it("should reject arbitrary unauthorized API endpoints to prevent SSRF", () => {
    expect(() => validateAllowedApiUrl("https://evil-attacker.com")).toThrow(/Access to 'evil-attacker.com' is disallowed/);
    expect(() => validateAllowedApiUrl("http://169.254.169.254/latest/meta-data")).toThrow(/disallowed/);
    expect(() => validateAllowedApiUrl("ftp://nextlevelbuilder.io")).toThrow();

    // Allowed endpoints
    expect(validateAllowedApiUrl("https://nextlevelbuilder.io")).toBe("https://nextlevelbuilder.io");
    expect(validateAllowedApiUrl("https://staging.nextlevelbuilder.io")).toBe("https://staging.nextlevelbuilder.io");
    expect(validateAllowedApiUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("should execute list_templates tool", async () => {
    const { payload } = await callTool("list_templates");
    expect(payload.templates).toHaveLength(5);
  });

  it("should return single template details when template_name passed to list_templates", async () => {
    const { payload } = await callTool("list_templates", { template_name: "developer-cli" });
    expect(payload.template.slug).toBe("dev-tool");
    expect(payload.template.name).toContain("Developer");
  });

  it("should validate arguments against the tool JSON Schema before running it", async () => {
    const { isError, payload } = await callTool("list_templates", { template_name: 42 });
    expect(isError).toBe(true);
    expect(String(payload)).toMatch(/validation/i);
  });
});
