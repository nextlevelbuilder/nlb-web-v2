import React from "react";
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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User,
  Mail,
  ShieldCheck,
  Building2,
  Layers,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Lock,
  PlusCircle,
  Receipt,
  Ticket,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import ProfileSignOutButton from "../profile/profile-sign-out-button";
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
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
        <Navbar />
        <div className="flex-1 pt-32 pb-20 px-4 flex items-center justify-center">
          <Card className="p-10 bg-white/[0.02] border-white/10 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl backdrop-blur-xl">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">{t("loginRequiredTitle")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("loginRequiredDesc")}
              </p>
            </div>
            <Button asChild className="w-full rounded-xl gap-2 font-bold shadow-lg btn-premium py-6">
              <Link href="/sign-in?callbackUrl=/account">{t("loginRequiredBtn")}</Link>
            </Button>
          </Card>
        </div>
        <FooterSection />
      </div>
    );
  }

  const db = getDb();
  const user = session.user;
  const userRole = (user as any).role || "user";
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />

      <div className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-10">
          {/* Account Profile Top Header */}
          <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-cyan-500/20 border border-primary/40 flex items-center justify-center font-bold text-2xl text-primary shadow-lg overflow-hidden shrink-0">
                {user.image ? (
                  <img src={user.image} alt={user.name || "User"} className="w-full h-full object-cover" />
                ) : (
                  (user.name || user.email || "U").charAt(0).toUpperCase()
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-extrabold text-foreground">{user.name || "Builder"}</h1>
                  <Badge
                    variant="outline"
                    className={`text-xs capitalize font-mono ${
                      isAdmin
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }`}
                  >
                    {userRole}
                  </Badge>
                  {user.emailVerified && (
                    <Badge variant="outline" className="text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1 font-mono">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Verified
                    </Badge>
                  )}
                </div>

                <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
                  <Mail className="w-3.5 h-3.5" />
                  <span>{user.email}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" size="sm" className="rounded-full gap-1.5 text-xs border-white/20 hover:bg-white/10">
                <Link href={`/builders/${user.id}`}>
                  <User className="w-3.5 h-3.5 text-primary" />
                  View Public Profile
                </Link>
              </Button>
              <ProfileSignOutButton />
            </div>
          </div>

          {/* Submission Slots Management Card */}
          <div className="p-8 rounded-3xl bg-gradient-to-br from-primary/5 via-white/[0.02] to-cyan-500/5 border border-primary/20 space-y-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">{t("title")}</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("description")}
                </p>
              </div>

              {/* Buy Slot Action */}
              <BuySlotButton userEmail={user.email} />
            </div>

            {/* Slots Metric Counter Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <Card className="p-5 bg-black/40 border border-emerald-500/30 rounded-2xl space-y-1 shadow-inner">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t("availableSlots")}</div>
                <div className="text-3xl font-extrabold text-emerald-400 flex items-center gap-2">
                  <span>{availableSlots}</span>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-mono">
                    {t("readyToUse")}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("availableSlotsDesc")}</p>
              </Card>

              <Card className="p-5 bg-black/40 border border-white/10 rounded-2xl space-y-1 shadow-inner">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t("usedSlots")}</div>
                <div className="text-3xl font-extrabold text-cyan-400 flex items-center gap-2">
                  <span>{usedSlots}</span>
                  <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 text-muted-foreground font-mono">
                    {t("active")}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("usedSlotsDesc")}</p>
              </Card>

              <Card className="p-5 bg-black/40 border border-white/10 rounded-2xl space-y-1 shadow-inner">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t("totalSlots")}</div>
                <div className="text-3xl font-extrabold text-foreground flex items-center gap-2">
                  <span>{totalSlots}</span>
                  <Badge variant="outline" className="text-[10px] border-primary/40 bg-primary/10 text-primary font-mono">
                    {purchasedSlots} Paid + {complimentarySlots} Starter
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("totalSlotsDesc")}</p>
              </Card>
            </div>

            {/* Quick Action when slot is available */}
            {availableSlots > 0 && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-300 font-medium">
                    {t("slotAvailableAlert", { count: availableSlots })}
                  </span>
                </div>

                <Button asChild size="sm" className="rounded-xl gap-2 font-bold shadow-md btn-premium text-xs shrink-0">
                  <Link href="/studio">
                    <PlusCircle className="w-3.5 h-3.5" />
                    {t("openStudioBtn")}
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {/* User Products & Listings Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {t("productsTitle")} ({userProducts.length})
              </h3>
              <Button asChild variant="outline" size="sm" className="rounded-full gap-1.5 text-xs border-white/10">
                <Link href="/studio">
                  <PlusCircle className="w-3.5 h-3.5" />
                  {t("createProductBtn")}
                </Link>
              </Button>
            </div>

            {userProducts.length === 0 ? (
              <Card className="p-8 bg-white/[0.01] border-white/5 rounded-2xl text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
                <p className="text-xs text-muted-foreground">{t("noProducts")}</p>
                <Button asChild size="sm" className="rounded-full gap-1.5 text-xs btn-premium mt-2">
                  <Link href="/studio">{t("createProductBtn")}</Link>
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {userProducts.map((p) => (
                  <Card key={p.id} className="p-5 bg-white/[0.02] border-white/10 rounded-2xl space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={`text-[10px] capitalize px-2 py-0.5 ${
                            p.status === "published"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : p.status === "awaiting_human"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                              : "border-white/10 bg-white/5 text-muted-foreground"
                          }`}
                        >
                          {p.status.replace("_", " ")}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">Trust: {p.trustScore}/100</span>
                      </div>
                      <div className="font-bold text-sm text-foreground">{p.title}</div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.tagline}</p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs">
                      {p.status === "published" ? (
                        <Link href={`/products/${p.slug}`} className="text-primary hover:underline flex items-center gap-1 font-medium">
                          Public Page
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      ) : (
                        <Link href={`/studio/products/${p.slug}/preview`} className="text-amber-400 hover:underline flex items-center gap-1 font-medium">
                          Preview Draft
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      )}

                      <Link href={`/studio`} className="text-muted-foreground hover:text-foreground">
                        Edit in Studio
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Polar Purchase Orders History */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" />
              {t("ordersTitle")} ({userOrders.length})
            </h3>

            {userOrders.length === 0 ? (
              <Card className="p-6 bg-white/[0.01] border-white/5 rounded-2xl text-center text-xs text-muted-foreground">
                {t("noOrders")}
              </Card>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.01]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.04] text-muted-foreground font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-3">{t("servicePackage")}</th>
                      <th className="p-3">{t("polarOrderId")}</th>
                      <th className="p-3">{t("amount")}</th>
                      <th className="p-3">{t("date")}</th>
                      <th className="p-3">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {userOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3 font-medium text-foreground">{ord.productName}</td>
                        <td className="p-3 font-mono text-muted-foreground">{ord.polarOrderId.slice(0, 16)}…</td>
                        <td className="p-3 font-bold text-emerald-400">{ord.amount} {ord.currency}</td>
                        <td className="p-3 text-muted-foreground">{new Date(ord.createdAt).toLocaleDateString()}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] capitalize">
                            {ord.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <FooterSection />
    </div>
  );
}
