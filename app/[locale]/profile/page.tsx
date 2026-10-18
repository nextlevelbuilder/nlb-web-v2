import { projectDashboardProductTrust } from "@/lib/domain/catalog";
export const metadata = { title: "Profile", robots: { index: false, follow: false } };
import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { products, members, organizations } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User,
  ShieldCheck,
  Building2,
  Layers,
  ArrowUpRight,
  Sparkles,
  Lock,
  PlusCircle,
} from "lucide-react";
import { Link, getPathname } from "@/i18n/navigation";
import ProfileSignOutButton from "./profile-sign-out-button";
import AccountIdentityHeader from "@/components/profile/account-identity-header";
import ApiKeysManager from "@/components/profile/api-keys-manager";
import AccountMembershipSection from "@/components/onboarding/account-membership-section";
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
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <main id="main" className="sky-backdrop flex flex-1 items-center justify-center px-4 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <section aria-labelledby="profile-login" className="surface-panel w-full max-w-md space-y-6 p-8 text-center shadow-constellation sm:p-10">
            <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm border border-line text-primary">
              <Lock className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <div className="space-y-2">
              <h1 id="profile-login" className="font-display text-step-2xl font-light">{t("loginRequiredTitle")}</h1>
              <p className="text-step-sm text-ink-2">{t("loginRequiredDesc")}</p>
            </div>
            <Button asChild size="lg" className="w-full">
              <Link href={{ pathname: "/sign-in", query: { callbackUrl: getPathname({ href: "/profile", locale }) } }}>
                {t("loginRequiredBtn")}
              </Link>
            </Button>
          </section>
        </main>
      </div>
    );
  }

  const db = getDb();
  const user = session.user;
  const userRole = (user as { role?: string }).role || "user";

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


  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-5xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)] md:pt-[calc(var(--header-h)+4.5rem)]">
          <AccountIdentityHeader
            name={user.name}
            email={user.email}
            image={user.image}
            role={userRole}
            emailVerified={Boolean(user.emailVerified)}
            verifiedLabel={t("verified")}
            actions={
              <>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={`/builders/${user.id}`}>
                    <User aria-hidden className="h-3.5 w-3.5 text-primary" />
                    {t("publicProfileBtn")}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href="/account">
                    <Layers aria-hidden className="h-3.5 w-3.5 text-primary" />
                    {t("manageSlotsBtn")}
                  </Link>
                </Button>
                <ProfileSignOutButton />
              </>
            }
          />

          <AccountMembershipSection
            locale={locale}
            user={{ id: user.id, email: user.email, emailVerified: Boolean(user.emailVerified) }}
          />

          <section aria-labelledby="profile-studio" className="surface-panel flex flex-col justify-between gap-6 p-6 sm:p-8 md:flex-row md:items-center">
            <div className="max-w-xl space-y-3">
              <p className="eyebrow">{t("creativeWorkspaceBadge")}</p>
              <h2 id="profile-studio" className="h-section">{t("studioLaunchpadTitle")}</h2>
              <p className="text-step-sm leading-relaxed text-ink-2">{t("studioLaunchpadDesc")}</p>
              <ul className="flex flex-wrap gap-2 pt-1">
                {[`${BlockSchema.options.length} Block Types`, "Cloudflare R2 Upload", "Drag & Drop Reorder", "Sandbox Preview"].map((feature) => (
                  <li key={feature}>
                    <Badge variant="secondary">{feature}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <Button asChild size="lg" className="shrink-0 gap-2">
              <Link href="/studio">
                <Sparkles aria-hidden className="h-4 w-4" />
                {t("studioLaunchpadBtn")}
              </Link>
            </Button>
          </section>

          <section aria-labelledby="profile-orgs" className="space-y-4">
            <h2 id="profile-orgs" className="flex items-center gap-2 font-display text-step-xl">
              <Building2 aria-hidden className="h-4 w-4 text-primary" />
              {t("orgsTitle")} ({userMemberships.length})
            </h2>
            {userMemberships.length === 0 ? (
              <p className="surface-panel p-6 text-center text-step-sm text-ink-2">{t("noOrgs")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {userMemberships.map((org) => (
                  <li key={org.orgId} className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface p-5">
                    <div className="min-w-0">
                      <h3 className="break-words text-step-base font-medium text-foreground">{org.orgName}</h3>
                      <p className="break-all font-mono text-step-xs text-ink-3">slug: {org.orgSlug}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">{org.memberRole}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ApiKeysManager />

          <section aria-labelledby="profile-products" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="profile-products" className="flex items-center gap-2 font-display text-step-xl">
                <Layers aria-hidden className="h-4 w-4 text-primary" />
                {t("productsTitle")} ({userProducts.length})
              </h2>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/studio">
                  <PlusCircle aria-hidden className="h-3.5 w-3.5" />
                  {t("addProductBtn")}
                </Link>
              </Button>
            </div>

            {userProducts.length === 0 ? (
              <div className="surface-panel space-y-2 p-8 text-center">
                <ShieldCheck aria-hidden className="mx-auto h-8 w-8 text-ink-3" strokeWidth={1.25} />
                <p className="text-step-sm text-ink-2">{t("noProducts")}</p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {userProducts.map((p) => (
                  <li key={p.id} className="flex flex-col justify-between space-y-3 rounded-sm border border-line bg-surface p-5">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="outline" className={p.status === "published" ? "border-success/50 text-success" : "border-warning/50 text-warning"}>
                          {p.status.replace("_", " ")}
                        </Badge>
                        <span className="font-mono text-step-xs text-ink-3">Trust: {p.trustScore}/100</span>
                      </div>
                      <h3 className="font-display text-step-lg text-foreground">{p.title}</h3>
                      <p className="line-clamp-2 text-step-sm text-ink-2">{p.tagline}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-step-xs">
                      <Link href={`/products/${p.slug}`} className="link-arrow">
                        {t("publicPage")}
                        <ArrowUpRight aria-hidden className="h-3 w-3" />
                      </Link>
                      <Link href={`/studio/products/${p.slug}/preview`} className="text-ink-2 underline-offset-4 hover:text-foreground hover:underline">
                        {t("preview")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
