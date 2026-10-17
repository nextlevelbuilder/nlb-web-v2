import { getDb } from "@/lib/db";
import { customers, subscriptions, users } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;

export const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

export interface TestUser {
  id: string;
  email: string;
  emailVerified: boolean;
  role: string;
}

export async function createTestUser({
  verified = true,
  email,
  role = "user",
}: { verified?: boolean; email?: string; role?: string } = {}): Promise<TestUser> {
  const id = nextId("onb-user");
  const address = email ?? `${id}@example.com`;
  await getDb().insert(users).values({ id, name: id, email: address, emailVerified: verified, role });
  return { id, email: address, emailVerified: verified, role };
}

/** A linked customer with an active subscription of the given product. */
export async function createMember(
  user: TestUser,
  { productId = PRODUCT_IDS.PREMIUM_ANNUAL, status = "active", cancelAtPeriodEnd = false } = {}
) {
  const [customer] = await getDb()
    .insert(customers)
    .values({ email: user.email.trim().toLowerCase(), name: "Member", userId: user.id })
    .returning();
  await getDb().insert(subscriptions).values({
    customerId: customer.id,
    polarSubscriptionId: nextId("sub"),
    polarProductId: productId,
    productName: productId === PRODUCT_IDS.VIP_ANNUAL || productId === PRODUCT_IDS.VIP_QUARTERLY ? "VIP" : "Premium",
    status,
    currentPeriodStart: new Date(Date.now() - DAY),
    currentPeriodEnd: new Date(Date.now() + 90 * DAY),
    cancelAtPeriodEnd,
  });
  return customer;
}

export function sessionFor(user: TestUser | null) {
  return user ? { user: { id: user.id, email: user.email, emailVerified: user.emailVerified, role: user.role, name: user.id } } : null;
}
