import { projectDashboardProductTrust } from "@/lib/domain/catalog";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { products, members, organizations } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Eye,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layout,
  Lock,
  LogIn,
  UserCheck,
} from "lucide-react";
import { Link, getPathname } from "@/i18n/navigation";
import StudioBuilderClient from "./studio-builder-client";

export default async function StudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const studioPath = getPathname({ href: "/studio", locale });
  const db = getDb();
  let session = null;

  try {
    const auth = getAuth();
    const reqHeaders = await headers();
    session = await auth.api.getSession({ headers: reqHeaders });
  } catch (err) {
    console.warn("Studio session retrieval error (non-fatal):", err);
  }

  let userProducts: typeof products.$inferSelect[] = [];
  let userOrgs: typeof organizations.$inferSelect[] = [];

  if (session && session.user) {
    try {
      const userRole = (session.user as { role?: string }).role;
      if (userRole === "admin") {
        // Admins can see and manage all products
        userProducts = await db
          .select()
          .from(products)
          .orderBy(desc(products.createdAt))
          .limit(30);
        userOrgs = await db.select().from(organizations).limit(10);
      } else {
        // Regular builders: scope strictly to organizations where user is a member
        const userMemberships = await db
          .select({ orgId: members.organizationId })
          .from(members)
          .where(eq(members.userId, session.user.id));

        const orgIds = userMemberships.map((m) => m.orgId);

        if (orgIds.length > 0) {
          userProducts = await db
            .select()
            .from(products)
            .where(inArray(products.orgId, orgIds))
            .orderBy(desc(products.createdAt));

          userOrgs = await db
            .select()
            .from(organizations)
            .where(inArray(organizations.id, orgIds));
        }
      }
    } catch (dbErr) {
      console.error("Failed to query studio products:", dbErr);
    }
  }

  userProducts = await projectDashboardProductTrust(userProducts, db);

  const userRole = session?.user ? (session.user as { role?: string }).role || "user" : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)] md:pt-[calc(var(--header-h)+4.5rem)]">
          <header className="max-w-3xl space-y-5">
            <p className="eyebrow">Builder Studio & Release Console</p>
            <h1 className="h-display">Manage, iterate & launch</h1>
            <p className="lede">
              Craft block-based product documents, preview live changes in sandbox mode, and submit your release for review.
            </p>
            {session?.user && (
              <p className="flex items-center gap-2 font-mono text-step-xs text-ink-2">
                <UserCheck aria-hidden className="h-4 w-4 text-success" />
                <span>
                  Signed in as <strong className="text-foreground">{session.user.name || session.user.email}</strong> ({userRole})
                </span>
              </p>
            )}
          </header>

          {!session?.user ? (
            <section aria-labelledby="studio-auth" className="surface-panel mx-auto max-w-2xl space-y-6 p-8 text-center sm:p-12">
              <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm border border-line text-primary">
                <Lock className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <div className="space-y-2">
                <h2 id="studio-auth" className="h-section">Sign in required</h2>
                <p className="text-step-sm text-ink-2">
                  Sign in with your Next Level Builders account to view your organization&apos;s product drafts, manage revisions, and submit launches.
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
                <Button asChild size="lg" className="gap-2">
                  <Link href={{ pathname: "/sign-in", query: { callbackUrl: studioPath } }}>
                    <LogIn aria-hidden className="h-4 w-4" />
                    Sign in to Builder Studio
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/build-with-us">Browse public directory</Link>
                </Button>
              </div>
            </section>
          ) : (
            <>
              <section aria-labelledby="studio-products" className="space-y-6">
                <div>
                  <h2 id="studio-products" className="h-section flex items-center gap-3">
                    <Layers aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                    Your organization products & drafts
                  </h2>
                  <p className="mt-2 text-step-sm text-ink-2">
                    Track live status, revision hash, and trust passport scores for your organizations.
                  </p>
                </div>

                {userProducts.length === 0 ? (
                  <div className="surface-panel space-y-3 p-10 text-center">
                    <ShieldCheck aria-hidden className="mx-auto h-10 w-10 text-ink-3" strokeWidth={1.25} />
                    <h3 className="font-display text-step-lg text-foreground">No products created yet</h3>
                    <p className="mx-auto max-w-md text-step-sm text-ink-2">
                      Use the builder form below to compose your first product document and register it under your organization.
                    </p>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {userProducts.map((p) => (
                      <li key={p.id} className="flex flex-col justify-between rounded-sm border border-line bg-surface p-6 transition-colors duration-base hover:border-line-strong">
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge
                              variant="outline"
                              className={
                                p.status === "published"
                                  ? "border-success/50 text-success"
                                  : p.status === "pending_review"
                                    ? "border-warning/50 text-warning"
                                    : "border-line-strong text-ink-2"
                              }
                            >
                              {p.status === "published" ? (
                                <CheckCircle2 aria-hidden className="mr-1 inline h-3 w-3" />
                              ) : (
                                <Clock aria-hidden className="mr-1 inline h-3 w-3" />
                              )}
                              {p.status.replace("_", " ")}
                            </Badge>
                            <span className="font-mono text-step-xs text-ink-3">Trust: {p.trustScore}/100</span>
                          </div>
                          <div>
                            <h3 className="font-display text-step-lg text-foreground">{p.title}</h3>
                            <p className="mt-1 line-clamp-2 text-step-sm text-ink-2">{p.tagline}</p>
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-step-xs">
                          {p.status === "published" ? (
                            <Link href={`/products/${p.slug}`} className="link-arrow">
                              Public page
                              <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                            </Link>
                          ) : (
                            <span className="text-ink-3">Draft mode</span>
                          )}
                          <Link
                            href={`/studio/products/${p.slug}/preview`}
                            className="inline-flex items-center gap-1 text-ink-2 underline-offset-4 hover:text-foreground hover:underline"
                          >
                            <Eye aria-hidden className="h-3.5 w-3.5" />
                            Studio preview
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="studio-editor" className="space-y-6 border-t border-line pt-8">
                <div>
                  <h2 id="studio-editor" className="h-section flex items-center gap-3">
                    <Layout aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                    Launch a new product or update a document
                  </h2>
                  <p className="mt-2 text-step-sm text-ink-2">
                    Compose visual block schemas (Hero, Media Gallery, Grid, Tech Stack, CTA) in accordance with the contracts specification.
                  </p>
                </div>
                <StudioBuilderClient defaultOrgId={userOrgs[0]?.id || "nlb-official"} />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
