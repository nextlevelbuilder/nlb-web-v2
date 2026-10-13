import { describe, it, expect, vi } from "vitest";
import { getAuth } from "@/lib/auth";

describe("Better Auth Configuration", () => {
  it("should initialize Better Auth instance cleanly", () => {
    const auth = getAuth();
    expect(auth).toBeDefined();
    expect(auth.api).toBeDefined();
    expect(auth.options).toBeDefined();
  });

  it("should have organization, admin, bearer, and deviceAuthorization plugins enabled", () => {
    const auth = getAuth();
    const plugins = auth.options.plugins || [];
    const pluginIds = plugins.map((p) => p.id);

    expect(pluginIds).toContain("organization");
    expect(pluginIds).toContain("admin");
    expect(pluginIds).toContain("bearer");
    expect(pluginIds).toContain("device-authorization");
  });
  it("should have all required Better Auth fields in Drizzle schema", async () => {
    const auth = getAuth();
    const ctx = await (auth as any).$context;
    const schemaMap: Record<string, any> = {
      user: (await import("@/lib/db/schema")).users,
      account: (await import("@/lib/db/schema")).accounts,
      session: (await import("@/lib/db/schema")).sessions,
      verification: (await import("@/lib/db/schema")).verifications,
      organization: (await import("@/lib/db/schema")).organizations,
      member: (await import("@/lib/db/schema")).members,
      invitation: (await import("@/lib/db/schema")).invitations,
    };

    const missing: Record<string, string[]> = {};
    for (const [model, tableDef] of Object.entries(ctx.tables || {})) {
      const drizzleTable = schemaMap[model];
      if (!drizzleTable) continue;
      const expectedFields = Object.keys((tableDef as any).fields || {});
      const tableColumns = Object.keys(drizzleTable);
      const missingForModel = expectedFields.filter(f => !tableColumns.includes(f));
      if (missingForModel.length > 0) {
        missing[model] = missingForModel;
      }
    }
    expect(missing).toEqual({});
  });

  it("should execute findAccountOwnerByKey without schema errors", async () => {
    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      query: {
        accounts: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };
    const auth = getAuth(mockDb);
    const ctx = await (auth as any).$context;
    const accountOwner = await ctx.internalAdapter.findAccountOwnerByKey({
      issuer: "local:oauth:github",
      accountId: "non_existent_12345",
    });
    expect(accountOwner).toBeNull();
  });
  it("should execute findUserByEmail and createAccount without schema errors", async () => {
    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "acc-1",
              userId: "u-1",
              accountId: "gh-1",
              providerId: "github",
              issuer: "local:oauth:github",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      }),
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        accounts: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };
    const auth = getAuth(mockDb);
    const ctx = await (auth as any).$context;
    const userByEmail = await ctx.internalAdapter.findUserByEmail("builder@nextlevelbuilder.io", { includeAccounts: true });
    expect(userByEmail).toBeNull();

    const createdAccount = await ctx.internalAdapter.createAccount({
      id: "acc-1",
      userId: "u-1",
      accountId: "gh-1",
      providerId: "github",
      issuer: "local:oauth:github",
    });
    expect(createdAccount.issuer).toBe("local:oauth:github");
  });
});
