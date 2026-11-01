import { ok } from "@/lib/builder-league/http";
import { getCustomer } from "@/lib/operators/http/operator-account-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** One Polar customer with their stored orders and subscriptions. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "commerce",
    action: "commerce.customer.read",
    prepare: async () => {
      const customerId = requirePathParam((await params).id, "id");
      return { resource: `customer:${customerId}`, args: { customerId }, customerId };
    },
    run: async ({ db }, { customerId }) => {
      const customer = await getCustomer(db, customerId);
      if (!customer) throw operatorNotFound("Customer");
      return ok(customer);
    },
  });
}
