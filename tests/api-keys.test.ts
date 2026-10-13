import { describe, it, expect, vi } from "vitest";
import { hashApiKey, createApiKeyForUser, verifyApiKey, resolveCaller } from "@/lib/auth-api-key";

describe("API Keys Management & Authentication", () => {
  it("should generate a valid nlb_live_ prefixed API key and hash", async () => {
    const mockDb: any = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation((vals) => {
            return Promise.resolve([
              {
                id: "key-1",
                name: "Test CLI Key",
                prefix: "nlb_live_1234...",
                start: "nlb_live_123456",
                createdAt: new Date(),
                expiresAt: null,
              },
            ]);
          }),
        }),
      }),
    };

    const created = await createApiKeyForUser(
      {
        userId: "user-123",
        name: "Test CLI Key",
      },
      mockDb
    );

    expect(created.rawKey).toMatch(/^nlb_live_[a-f0-9]{48}$/);
    expect(created.name).toBe("Test CLI Key");
    expect(created.prefix).toMatch(/^nlb_live_/);
    expect(hashApiKey(created.rawKey)).toHaveLength(64);
  });

  it("should reject raw keys that do not start with nlb_live_", async () => {
    const res = await verifyApiKey("invalid_prefix_key_123");
    expect(res).toBeNull();
  });

  it("should resolve caller via x-api-key or Authorization Bearer header", async () => {
    const rawKey = "nlb_live_0123456789abcdef0123456789abcdef0123456789abcdef";
    const hashed = hashApiKey(rawKey);

    let callCount = 0;
    const mockDb: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([
                  {
                    id: "key-1",
                    userId: "user-123",
                    organizationId: "org-traffic",
                    key: hashed,
                    enabled: true,
                    expiresAt: null,
                  },
                ]);
              }
              return Promise.resolve([
                {
                  id: "user-123",
                  name: "Builder Alice",
                  email: "alice@nlb.io",
                  role: "user",
                  emailVerified: true,
                },
              ]);
            }),
          })),
        })),
      })),
    };

    const headers = new Headers({
      Authorization: `Bearer ${rawKey}`,
    });

    const caller = await resolveCaller(headers, mockDb);
    expect(caller).toBeDefined();
    expect(caller?.authType).toBe("api_key");
    expect(caller?.apiKeyOrganizationId).toBe("org-traffic");
    expect(caller?.user.id).toBe("user-123");
    expect(caller?.user.email).toBe("alice@nlb.io");
  });
});
