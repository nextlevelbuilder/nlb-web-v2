import { projectDashboardProductTrust } from "@/lib/domain/catalog";
export const dynamic = "force-dynamic";
export const metadata = { title: "Account", robots: { index: false, follow: false } };

import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { products, members, organizations, orders, customers, entitlements } from "@/lib/db/schema";
import { eq, inArray, desc, and } from "drizzle-orm";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User,
  ShieldCheck,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  Lock,
  PlusCircle,
  Receipt,
  Ticket,
} from "lucide-react";
import { Link, getPathname } from "@/i18n/navigation";
import ProfileSignOutButton from "../profile/profile-sign-out-button";
import AccountIdentityHeader from "@/components/profile/account-identity-header";
import BuySlotButton from "@/components/account/buy-slot-button";
import { PRODUCT_IDS } from "@/lib/polar";
import { getTranslations } from "next-intl/server";

interface AccountPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AccountDashboardPage({ params }: AccountPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  const auth = getAuth();
  const reqHeaders = await headers();
  let session = null;

  try {
    session = await auth.api.getSession({ headers: reqHeaders });
  } catch (err) {
    console.warn("Account session retrieval error:", err);
  }

  if (!session || !session.user) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Navbar />
        <main id="main" className="sky-backdrop flex flex-1 items-center justify-center px-4 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <section aria-labelledby="account-login" className="surface-panel w-full max-w-md space-y-6 p-8 text-center shadow-constellation sm:p-10">
            <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm border border-line text-primary">
              <Lock className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <div className="space-y-2">
              <h1 id="account-login" className="font-display text-step-2xl font-light">{t("loginRequiredTitle")}</h1>
              <p className="text-step-sm text-ink-2">{t("loginRequiredDesc")}</p>
            </div>
            <Button asChild size="lg" className="w-full">
              <Link href={{ pathname: "/sign-in", query: { callbackUrl: getPathname({ href: "/account", locale }) } }}>
                {t("loginRequiredBtn")}
              </Link>
            </Button>
          </section>
        </main>
        <FooterSection />
      </div>
    );
  }

  const db = getDb();
  const user = session.user;
  const userRole = (user as { role?: string }).role || "user";
  const isAdmin = userRole === "admin";

  // 1. Query user organizations
  const userMemberships = await db
    .select({
      orgId: members.organizationId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      memberRole: members.role,
      joinedAt: members.createdAt,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, user.id));

  const orgIds = userMemberships.map((m) => m.orgId);

  // 2. Query user products (all statuses: draft, awaiting_human, published)
  let userProducts: typeof products.$inferSelect[] = [];
  if (isAdmin) {
    userProducts = await db.select().from(products).orderBy(desc(products.createdAt)).limit(30);
  } else if (orgIds.length > 0) {
    userProducts = await db
      .select()
      .from(products)
      .where(inArray(products.orgId, orgIds))
      .orderBy(desc(products.createdAt));
  }

  userProducts = await projectDashboardProductTrust(userProducts, db);

  // 3. Query directory slot purchases
  const userOrders = await db
    .select({
      id: orders.id,
      polarOrderId: orders.polarOrderId,
      polarProductId: orders.polarProductId,
      productName: orders.productName,
      productSlug: orders.productSlug,
      amount: orders.amount,
      currency: orders.currency,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(
      and(
        eq(customers.email, user.email),
        inArray(orders.polarProductId, [
          PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD,
          PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD,
        ])
      )
    )
    .orderBy(desc(orders.createdAt));

  // 4. Query entitlements
  const userEntitlements = await db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, user.id), eq(entitlements.isActive, true)));

  // Calculate slot counts
  const complimentarySlots = isAdmin ? 10 : 1; // 1 free starter slot for verified builders, 10 for admins
  const purchasedSlots = userOrders.length + userEntitlements.length;
  const totalSlots = purchasedSlots + complimentarySlots;
  const usedSlots = userProducts.filter((p) => p.status === "published" || p.status === "awaiting_human").length;
  const availableSlots = Math.max(0, totalSlots - usedSlots);

  const statusBadgeClass = (status: string) =>
    status === "published"
      ? "border-success/50 text-success"
      : status === "awaiting_human"
        ? "border-warning/50 text-warning"
        : "border-line-strong text-ink-2";
  const dateFormat = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium" });
  const slotMetrics = [
    { label: t("availableSlots"), value: availableSlots, tag: t("readyToUse"), desc: t("availableSlotsDesc"), tone: "text-success" },
    { label: t("usedSlots"), value: usedSlots, tag: t("active"), desc: t("usedSlotsDesc"), tone: "text-primary" },
    { label: t("totalSlots"), value: totalSlots, tag: `${purchasedSlots} Paid + ${complimentarySlots} Starter`, desc: t("totalSlotsDesc"), tone: "text-foreground" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />

      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-5xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)] md:pt-[calc(var(--header-h)+4.5rem)]">
          <AccountIdentityHeader
            name={user.name}
            email={user.email}
            image={user.image}
            role={userRole}
            emailVerified={Boolean(user.emailVerified)}
            verifiedLabel="Verified"
            actions={
              <>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={`/builders/${user.id}`}>
                    <User aria-hidden className="h-3.5 w-3.5 text-primary" />
                    View Public Profile
                  </Link>
                </Button>
                <ProfileSignOutButton />
              </>
            }
          />

          <section aria-labelledby="account-slots" className="surface-panel space-y-6 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 id="account-slots" className="h-section flex items-center gap-3">
                  <Ticket aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                  {t("title")}
                </h2>
                <p className="mt-2 text-step-sm text-ink-2">{t("description")}</p>
              </div>
              <BuySlotButton userEmail={user.email} />
            </div>

            <dl className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
              {slotMetrics.map((metric) => (
                <div key={metric.label} className="space-y-2 rounded-sm border border-line bg-canvas-deep p-5">
                  <dt className="mono-label text-ink-3">{metric.label}</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className={`num-tab font-display text-step-2xl ${metric.tone}`}>{metric.value}</span>
                    <Badge variant="secondary">{metric.tag}</Badge>
                  </dd>
                  <dd className="text-step-xs text-ink-2">{metric.desc}</dd>
                </div>
              ))}
            </dl>

            {availableSlots > 0 && (
              <div className="flex flex-col items-start justify-between gap-3 rounded-sm border border-success/50 bg-success/10 p-4 sm:flex-row sm:items-center">
                <p className="flex items-center gap-2.5 text-step-sm text-foreground">
                  <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-success" />
                  {t("slotAvailableAlert", { count: availableSlots })}
                </p>
                <Button asChild size="sm" className="shrink-0 gap-2">
                  <Link href="/studio">
                    <PlusCircle aria-hidden className="h-3.5 w-3.5" />
                    {t("openStudioBtn")}
                  </Link>
                </Button>
              </div>
            )}
          </section>

          <section aria-labelledby="account-products" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="account-products" className="flex items-center gap-2 font-display text-step-xl">
                <Layers aria-hidden className="h-4 w-4 text-primary" />
                {t("productsTitle")} ({userProducts.length})
              </h2>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/studio">
                  <PlusCircle aria-hidden className="h-3.5 w-3.5" />
                  {t("createProductBtn")}
                </Link>
              </Button>
            </div>

            {userProducts.length === 0 ? (
              <div className="surface-panel space-y-3 p-8 text-center">
                <ShieldCheck aria-hidden className="mx-auto h-8 w-8 text-ink-3" strokeWidth={1.25} />
                <p className="text-step-sm text-ink-2">{t("noProducts")}</p>
                <Button asChild size="sm">
                  <Link href="/studio">{t("createProductBtn")}</Link>
                </Button>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {userProducts.map((p) => (
                  <li key={p.id} className="flex flex-col justify-between space-y-3 rounded-sm border border-line bg-surface p-5">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="outline" className={statusBadgeClass(p.status)}>{p.status.replace("_", " ")}</Badge>
                        <span className="font-mono text-step-xs text-ink-3">Trust: {p.trustScore}/100</span>
                      </div>
                      <h3 className="font-display text-step-lg text-foreground">{p.title}</h3>
                      <p className="line-clamp-2 text-step-sm text-ink-2">{p.tagline}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-step-xs">
                      {p.status === "published" ? (
                        <Link href={`/products/${p.slug}`} className="link-arrow">
                          Public Page
                          <ArrowUpRight aria-hidden className="h-3 w-3" />
                        </Link>
                      ) : (
                        <Link href={`/studio/products/${p.slug}/preview`} className="link-arrow">
                          Preview Draft
                          <ArrowUpRight aria-hidden className="h-3 w-3" />
                        </Link>
                      )}
                      <Link href="/studio" className="text-ink-2 underline-offset-4 hover:text-foreground hover:underline">
                        Edit in Studio
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="account-orders" className="space-y-4">
            <h2 id="account-orders" className="flex items-center gap-2 font-display text-step-xl">
              <Receipt aria-hidden className="h-4 w-4 text-primary" />
              {t("ordersTitle")} ({userOrders.length})
            </h2>

            {userOrders.length === 0 ? (
              <p className="surface-panel p-6 text-center text-step-sm text-ink-2">{t("noOrders")}</p>
            ) : (
              <div className="overflow-x-auto rounded-sm border border-line bg-surface">
                <table className="w-full min-w-[36rem] text-left text-step-sm">
                  <thead className="bg-surface-raised">
                    <tr className="mono-label text-ink-3">
                      <th scope="col" className="p-3 font-normal">{t("servicePackage")}</th>
                      <th scope="col" className="p-3 font-normal">{t("polarOrderId")}</th>
                      <th scope="col" className="p-3 font-normal">{t("amount")}</th>
                      <th scope="col" className="p-3 font-normal">{t("date")}</th>
                      <th scope="col" className="p-3 font-normal">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {userOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="p-3 font-medium text-foreground">{ord.productName}</td>
                        <td className="p-3 font-mono text-step-xs text-ink-2">{ord.polarOrderId.slice(0, 16)}…</td>
                        <td className="num-tab p-3 text-foreground">{ord.amount} {ord.currency}</td>
                        <td className="p-3 text-ink-2">
                          <time dateTime={new Date(ord.createdAt).toISOString()}>{dateFormat.format(new Date(ord.createdAt))}</time>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="border-success/50 text-success">{ord.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      <FooterSection />
    </div>
  );
}
