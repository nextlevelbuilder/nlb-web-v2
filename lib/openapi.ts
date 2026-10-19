import { zodToJsonSchema } from "zod-to-json-schema";
import { ProductDocumentSchema } from "@/packages/contracts/src/product-document";
import { trafficPaths, trafficSchemas } from "@/lib/traffic/openapi";
import { blogPaths, blogSchemas } from "@/lib/blog/blog-openapi";
import { evidencePaths, evidenceSchemas } from "@/lib/builder-league/openapi/evidence";
import { rankingsPaths, rankingsSchemas } from "@/lib/builder-league/openapi/rankings";
import { progressionPaths, progressionSchemas } from "@/lib/builder-league/openapi/progression";
import { journeyPaths, journeySchemas } from "@/lib/builder-league/openapi/journey";
import { privacyPaths, privacySchemas } from "@/lib/builder-league/openapi/privacy";

// Derive the document and all block shapes from the runtime validation contract.
const productDocumentJsonSchema = zodToJsonSchema(ProductDocumentSchema, { $refStrategy: "none", target: "jsonSchema7" });

export const openApiSpec = {
    openapi: "3.1.0",
    info: {
      title: "Next Level Builders - Directory & Submission API",
      version: "1.0.0",
      description: "Official REST API for the Next Level Builders high-trust product catalog, submissions, voting, and moderation system. Compatible with AI agents, MCP servers, and developer CLI tools.",
      contact: {
        name: "Next Level Builders",
        url: "https://nextlevelbuilder.io",
        email: "hello@nextlevelbuilder.io"
      }
    },
    servers: [
      {
        url: "https://nextlevelbuilder.io",
        description: "Production API Server"
      },
      {
        url: "https://staging.nextlevelbuilder.io",
        description: "Staging API Server"
      },
      {
        url: "http://localhost:3000",
        description: "Local Development Server"
      }
    ],
    paths: {
      ...trafficPaths,
      ...blogPaths,
      ...evidencePaths,
      ...rankingsPaths,
      ...progressionPaths,
      ...journeyPaths,
      ...privacyPaths,
      "/api/v1/products/{slug}/pulse": {
        get: {
          summary: "Read product website health history",
          description: "Read saved samples for a published product with a Pulse block. No probe is performed. Uptime is the percentage of successful measured samples, not continuous availability; unknown samples are excluded. History contains at most 100 samples and becomes stale after 15 minutes.",
          tags: ["Product Health"],
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Saved health summary", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/PulseSummary" } } } } } },
            "404": { description: "Published product with Pulse not found" },
            "503": { description: "Health storage unavailable" },
          },
        },
        post: {
          summary: "Sample the product's published website",
          description: "Send an empty body. Checks the saved website URL, never a caller-supplied URL. A five-minute per-product cooldown and global concurrent-probe limit apply. Returns sampled=false when a new probe is not due or capacity is full. Probes are on-view, not scheduled continuous monitoring.",
          tags: ["Product Health"],
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Latest summary and whether a probe was sampled", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/PulseSummary" }, sampled: { type: "boolean" } } } } } },
            "404": { description: "Published product with Pulse not found" },
            "503": { description: "Health storage unavailable" },
          },
        },
      },
      "/api/v1/stats": {
        get: { summary: "Directory statistics", tags: ["Directory Catalog"], responses: { "200": { description: "Published product, outbound click, registered builder and vote counts" }, "500": { description: "Statistics unavailable" } } },
      },
      "/api/v1/media/upload": {
        post: {
          summary: "Upload product media",
          description: "Upload an image (up to 10 MB) or video (up to 100 MB). The current endpoint accepts draft creators without a session.",
          tags: ["Submissions & Builder"],
          requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, folder: { type: "string", default: "uploads" } } } } } },
          responses: { "200": { description: "Media URL, MIME type and storage details" }, "400": { description: "Missing, unsupported or oversized file" }, "500": { description: "Upload failed" } },
        },
      },
      "/api/v1/api-keys": {
        get: { summary: "List your API keys", description: "Returns key metadata only, never the raw secret.", tags: ["API Keys"], security: [{ SessionAuth: [] }], responses: { "200": { description: "Key metadata" }, "401": { description: "Sign in required" } } },
        post: {
          summary: "Create an API key", description: "Requires a browser session. The raw key is returned only once; store it securely.", tags: ["API Keys"], security: [{ SessionAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 64 }, organizationId: { type: "string" }, expiresDays: { type: "integer", minimum: 1, maximum: 365 } } } } } },
          responses: { "200": { description: "New key and secret" }, "400": { description: "Invalid parameters" }, "401": { description: "Sign in required" }, "403": { description: "Organization membership required" } },
        },
      },
      "/api/v1/api-keys/{id}": {
        delete: { summary: "Revoke your API key", tags: ["API Keys"], security: [{ SessionAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Key revoked" }, "401": { description: "Sign in required" }, "404": { description: "Key not owned by caller or not found" } } },
      },
      "/api/v1/admin/queue": {
        get: { summary: "Read moderation queue", description: "Admin browser session required.", tags: ["Moderation"], security: [{ SessionAuth: [] }], responses: { "200": { description: "Up to 50 cases in review" }, "401": { description: "Sign in required" }, "403": { description: "Admin required" } } },
      },
      "/api/v1/admin/decide": {
        post: {
          summary: "Record a human moderation decision", description: "Admin browser session required. Reviewer identity is derived from the session.", tags: ["Moderation"], security: [{ SessionAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["caseId", "decision", "reasonCodes"], properties: { caseId: { type: "string", format: "uuid" }, decision: { type: "string", enum: ["approved", "changes_requested", "rejected", "quarantined"] }, reasonCodes: { type: "array", minItems: 1, items: { type: "string" } }, notes: { type: "string" } } } } } },
          responses: { "200": { description: "Decision recorded" }, "400": { description: "Invalid decision" }, "401": { description: "Sign in required" }, "403": { description: "Admin required" } },
        },
      },
      "/api/v1/products": {
        get: {
          summary: "List Published Directory Products",
          description: "Retrieve a paginated list of human-verified and published products ordered by trust score and rank.",
          tags: ["Directory Catalog"],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
              description: "Number of listings to return"
            },
            {
              name: "offset",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 0, default: 0 },
              description: "Pagination offset"
            }
          ],
          responses: {
            "200": {
              description: "List of products",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Product" } },
                      pagination: {
                        type: "object",
                        properties: {
                          limit: { type: "integer" },
                          offset: { type: "integer" },
                          count: { type: "integer" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: "Create Product Draft",
          description: "Initialize a new product draft under an organization. Requires a session or API key and organization membership.",
          tags: ["Submissions & Builder"],
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["orgId", "slug", "title", "tagline", "websiteUrl"],
                  properties: {
                    orgId: { type: "string", description: "Organization ID owner" },
                    slug: { type: "string", pattern: "^[a-z0-9-]+$", description: "URL-safe unique product slug" },
                    title: { type: "string", minLength: 1, maxLength: 100 },
                    tagline: { type: "string", minLength: 1, maxLength: 200 },
                    websiteUrl: { type: "string", format: "uri", pattern: "^[Hh][Tt][Tt][Pp][Ss]?://" },
                    logoUrl: { type: "string", format: "uri", pattern: "^[Hh][Tt][Tt][Pp][Ss]?://" }
                  }
                }
              }
            }
          },
          responses: {
            "201": { description: "Product draft created successfully" },
            "401": { description: "Unauthorized" },
            "403": { description: "Forbidden - Not an organization member" }
          }
        }
      },
      "/api/v1/products/{slug}": {
        get: {
          summary: "Get Product by Slug",
          description: "Retrieve public verified product listing and its active revision document.",
          tags: ["Directory Catalog"],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Product details and active revision document" },
            "404": { description: "Product not found or not published" }
          }
        }
      },
      "/api/v1/products/{slug}/revisions": {
        post: {
          summary: "Create Product Document Revision",
          description: "Save a new block-based document revision. Validates against the official block schema contract (including Activities, Pulse and Analytics). Publishing an Analytics block opts into public traffic totals for that product.",
          tags: ["Submissions & Builder"],
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["document"],
                  properties: {
                    document: { $ref: "#/components/schemas/ProductDocument" }
                  }
                }
              }
            }
          },
          responses: {
            "201": { description: "Revision created successfully" },
            "400": { description: "Invalid document schema" },
            "403": { description: "Forbidden" }
          }
        }
      },
      "/api/v1/products/{slug}/submit": {
        post: {
          summary: "Submit Product Revision for Review",
          description: "Submit a revision for automated pre-screening and board moderation.",
          tags: ["Submissions & Builder"],
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    revisionId: { type: "string", format: "uuid" },
                    submissionNotes: { type: "string", maxLength: 500 },
                    isFastTrack: { type: "boolean", default: false },
                    payOnly: { type: "boolean", default: false }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Submitted successfully into moderation queue" },
            "400": { description: "Invalid request or missing revision" },
            "401": { description: "Authentication required" },
            "402": { description: "Payment required; response contains checkoutUrl, amount and requiresPayment. Publication still requires human review." },
            "403": { description: "Organization membership required" },
            "404": { description: "Product or revision not found" }
          }
        }
      },
      "/api/v1/products/{slug}/markdown": {
        get: {
          summary: "Export Product as LLM Markdown",
          description: "Markdown structured feed formatted for AI agents and LLM context windows.",
          tags: ["AI & Agent Endpoints"],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": {
              description: "Markdown string representation",
              content: { "text/markdown": { schema: { type: "string" } } }
            }
          }
        }
      },
      "/api/v1/rankings": {
        get: {
          summary: "Get Community Rankings",
          description: "Fetch transparent daily, weekly, or monthly organic community leaderboard rankings.",
          tags: ["Directory Catalog"],
          parameters: [
            {
              name: "window",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["daily", "weekly", "monthly"], default: "daily" }
            }
          ],
          responses: {
            "200": { description: "Leaderboard rankings snapshot" }
          }
        }
      },
      "/api/v1/votes": {
        post: {
          summary: "Cast Vote for Product",
          description: "Cast an organic community vote for a product in the current 24-hour UTC window. One vote per product per user per day.",
          tags: ["Directory Catalog"],
          security: [{ SessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["productId"],
                  properties: {
                    productId: { type: "string", format: "uuid" },
                    turnstileToken: { type: "string", description: "Cloudflare Turnstile verification token" }
                  }
                }
              }
            }
          },
          responses: {
            "201": { description: "Vote registered successfully" },
            "400": { description: "Invalid or duplicate vote" },
            "401": { description: "Sign in required" },
            "429": { description: "Too many vote attempts" }
          }
        }
      },
      "/api/health": {
        get: {
          summary: "Service & Database Health Probe",
          description: "Live health status check across Cloudflare Workers runtime and Hyperdrive PostgreSQL.",
          tags: ["System"],
          responses: {
            "200": { description: "Healthy" }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "nlb_live_...",
          description: "Secret API key created in /profile. Send as Authorization: Bearer nlb_live_..."
        },
        ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
        SessionAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token"
        },
        BuilderIngestSecret: {
          type: "apiKey",
          in: "header",
          name: "x-nlb-builder-ingest-secret",
          description: "Shared secret of the Builder League Discord bot (server env BUILDER_INGEST_SECRET)."
        }
      },
      schemas: {
        ...trafficSchemas,
        ...blogSchemas,
        ...evidenceSchemas,
        ...rankingsSchemas,
        ...progressionSchemas,
        ...journeySchemas,
        ...privacySchemas,
        PulseSummary: {
          type: "object",
          properties: {
            websiteUrl: { type: "string", format: "uri", pattern: "^[Hh][Tt][Tt][Pp][Ss]?://" },
            status: { type: "string", enum: ["up", "down", "unknown", "stale"] },
            checkedAt: { type: ["string", "null"], format: "date-time" },
            latencyMs: { type: ["number", "null"] },
            sampleUptimePercent: { type: ["number", "null"], minimum: 0, maximum: 100 },
            sampleCount: { type: "integer" }, measuredSampleCount: { type: "integer" },
            windowStartedAt: { type: ["string", "null"], format: "date-time" },
            nextCheckAt: { type: ["string", "null"], format: "date-time" },
            sampling: { type: "string", const: "on-view" },
            history: { type: "array", maxItems: 100, items: { type: "object", properties: {
              checkedAt: { type: "string", format: "date-time" }, outcome: { type: "string", enum: ["up", "down", "unknown"] },
              latencyMs: { type: ["number", "null"] }, httpStatus: { type: ["integer", "null"] }, reason: { type: ["string", "null"] },
            } } },
          },
        },
        Product: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            slug: { type: "string" },
            title: { type: "string" },
            tagline: { type: "string" },
            websiteUrl: { type: "string", format: "uri", pattern: "^[Hh][Tt][Tt][Pp][Ss]?://" },
            logoUrl: { type: ["string", "null"], format: "uri" },
            status: { type: "string", enum: ["draft", "pending_review", "published", "archived"] },
            trustScore: {
              type: "integer", minimum: 0, maximum: 100,
              description: "Calculated Trust Passport score: published +40, HTTPS URL +20, votes +2 each (max 20), age +2 per full week (max 10). Verified traction is disabled; current maximum is 90. Payments and editorial flags do not affect the score."
            },
            votesCount: { type: "integer", minimum: 0, description: "Cumulative vote counter, separate from the calculated trustScore, returned by published catalog reads." },
            isFeatured: {
              type: "boolean",
              description: "Administrative editorial curation flag (Editor's Pick). Cannot be purchased or influenced by payment."
            },
            createdAt: { type: "string", format: "date-time" }
          }
        },
        ProductDocument: productDocumentJsonSchema,
      }
    }
  };
