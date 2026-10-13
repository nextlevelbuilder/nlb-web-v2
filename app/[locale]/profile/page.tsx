import React from "react";
import { projectDashboardProductTrust } from "@/lib/domain/catalog";
export const metadata = { title: "Profile", robots: { index: false, follow: false } };
import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { products, members, organizations, orders, customers } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
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
  LogOut,
  Lock,
  PlusCircle,
} from "lucide-react";
import Link from "next/link";
import ProfileSignOutButton from "./profile-sign-out-button";
import ApiKeysManager from "@/components/profile/api-keys-manager";
import { getTranslations } from "next-intl/server";
import { BlockSchema } from "@/packages/contracts/src";

export const dynamic = "force-dynamic";

interface ProfilePageProps {
  params: Promise<{ locale: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  const auth = getAuth();
  const reqHeaders = await headers();
  let session = null;

  try {
    session = await auth.api.getSession({ headers: reqHeaders });
  } catch (err) {
    console.warn("Profile session retrieval error:", err);
  }

  if (!session || !session.user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
        <Navbar />
        <div className="flex-1 pt-32 pb-20 px-4 flex items-center justify-center">
          <Card className="p-10 bg-white/[0.02] border-white/10 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl">
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
              <Link href="/sign-in?callbackUrl=/profile">{t("loginRequiredBtn")}</Link>
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

  // Query user organizations
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

  // Query user products
  let userProducts: typeof products.$inferSelect[] = [];
  if (userRole === "admin") {
    userProducts = await db.select().from(products).orderBy(desc(products.createdAt)).limit(20);
  } else if (orgIds.length > 0) {
    userProducts = await db
      .select()
      .from(products)
      .where(inArray(products.orgId, orgIds))
      .orderBy(desc(products.createdAt));
  }

  userProducts = await projectDashboardProductTrust(userProducts, db);

  // Query paid orders
  const userOrders = await db
    .select()
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(eq(customers.email, user.email))
    .orderBy(desc(orders.createdAt))
    .limit(10);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />

      <div className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-10">
          {/* Profile Header Card */}
          <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
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
                    className={`text-xs capitalize ${
                      userRole === "admin"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }`}
                  >
                    {userRole}
                  </Badge>
                  {user.emailVerified && (
                    <Badge variant="outline" className="text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1 font-mono">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      {t("verified")}
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
                  {t("publicProfileBtn")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="rounded-full gap-1.5 text-xs border-white/20 hover:bg-white/10">
                <Link href="/account">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  {t("manageSlotsBtn")}
                </Link>
              </Button>
              <ProfileSignOutButton />
            </div>
          </div>

          {/* Builder Studio Dedicated Launchpad Banner */}
          <div className="p-8 rounded-3xl bg-gradient-to-br from-primary/10 via-white/[0.02] to-cyan-500/10 border border-primary/30 relative overflow-hidden shadow-2xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-xs px-3 py-0.5 font-mono">
                    <Sparkles className="w-3 h-3 mr-1 inline" />
                    {t("creativeWorkspaceBadge")}
                  </Badge>
                </div>
                <h2 className="text-2xl font-extrabold text-foreground">{t("studioLaunchpadTitle")}</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("studioLaunchpadDesc")}
                </p>
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono text-muted-foreground">
                  <span className="px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/10">{BlockSchema.options.length} Block Types</span>
                  <span className="px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/10">Cloudflare R2 Upload</span>
                  <span className="px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/10">Drag & Drop Reorder</span>
                  <span className="px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/10">Sandbox Preview</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <Button asChild className="rounded-2xl gap-2 font-bold shadow-xl btn-premium py-6 px-8 text-sm">
                  <Link href="/studio">
                    <Sparkles className="w-4 h-4" />
                    {t("studioLaunchpadBtn")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
          {/* Organizations & Memberships Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              {t("orgsTitle")} ({userMemberships.length})
            </h3>

            {userMemberships.length === 0 ? (
              <Card className="p-6 bg-white/[0.01] border-white/5 rounded-2xl text-center text-xs text-muted-foreground">
                {t("noOrgs")}
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userMemberships.map((org) => (
                  <Card key={org.orgId} className="p-5 bg-white/[0.02] border-white/10 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-foreground">{org.orgName}</div>
                      <div className="text-xs font-mono text-muted-foreground">slug: {org.orgSlug}</div>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize border-white/10 bg-white/5">
                      {org.memberRole}
                    </Badge>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Developer API Keys Management Section */}
          <ApiKeysManager />

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
                  {t("addProductBtn")}
                </Link>
              </Button>
            </div>

            {userProducts.length === 0 ? (
              <Card className="p-8 bg-white/[0.01] border-white/5 rounded-2xl text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
                <p className="text-xs text-muted-foreground">{t("noProducts")}</p>
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
                              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
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
                      <Link href={`/products/${p.slug}`} className="text-primary hover:underline flex items-center gap-1 font-medium">
                        {t("publicPage")}
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                      <Link href={`/studio/products/${p.slug}/preview`} className="text-muted-foreground hover:text-foreground">
                        {t("preview")}
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <FooterSection />
    </div>
  );
}
