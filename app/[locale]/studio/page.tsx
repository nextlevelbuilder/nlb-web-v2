import React from "react";
import { projectDashboardProductTrust } from "@/lib/domain/catalog";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { products, members, organizations } from "@/lib/db/schema";
import { eq, inArray, desc, sql } from "drizzle-orm";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
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
import Link from "next/link";
import StudioBuilderClient from "./studio-builder-client";

export default async function StudioPage() {
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
  let publishedCount = 0;

  try {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.status, "published"));
    publishedCount = countRow?.count || 0;
  } catch {
    // non-fatal
  }
  if (session && session.user) {
    try {
      const userRole = (session.user as any).role;
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />

      <div className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-12">
          {/* Studio Header Banner */}
          <div className="relative p-8 md:p-12 rounded-3xl bg-gradient-to-r from-primary/15 via-primary/5 to-cyan-500/15 border border-primary/20 overflow-hidden shadow-2xl">
            <div className="relative z-10 max-w-3xl space-y-4">
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary gap-1.5 px-3 py-1 text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                Builder Studio & Release Console
              </Badge>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
                Manage, Iterate & Launch
              </h1>
              <p className="text-muted-foreground text-base md:text-lg">
                Craft block-based product documents, preview live changes in sandbox mode, and submit your verified release to the community board.
              </p>

              {session?.user && (
                <div className="pt-2 flex items-center gap-2 text-xs text-emerald-400 font-mono">
                  <UserCheck className="w-4 h-4" />
                  <span>
                    Authenticated as: <strong className="text-foreground">{session.user.name || session.user.email}</strong>{" "}
                    ({(session.user as any).role || "user"})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Authentication Barrier for Unauthenticated Visitors */}
          {!session?.user ? (
            <div className="p-12 rounded-3xl border border-white/10 bg-white/[0.02] text-center max-w-2xl mx-auto space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">Authentication Required</h3>
                <p className="text-sm text-muted-foreground">
                  Sign in with your Next Level Builders account to view your organization&apos;s product drafts, manage revisions, and submit launches.
                </p>
              </div>
              <div className="flex justify-center gap-4 pt-2">
                <Button asChild className="rounded-full shadow-lg gap-2 px-8 btn-premium">
                  <Link href="/sign-in?callbackUrl=/studio">
                    <LogIn className="w-4 h-4" />
                    Sign In to Builder Studio
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full gap-2 border-white/20">
                  <Link href="/build-with-us">
                    Browse Public Directory
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Existing Products / Drafts Section (Scoped to User's Organizations) */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      Your Organization Products & Drafts
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Track live status, revision hash, and trust passport scores for your organizations.
                    </p>
                  </div>
                </div>

                {userProducts.length === 0 ? (
                  <div className="p-12 rounded-2xl border border-white/10 bg-white/[0.01] text-center space-y-3">
                    <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
                    <h4 className="font-semibold text-foreground">No Products Created Yet</h4>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Use the builder form below to compose your first product document and register it under your organization.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {userProducts.map((p) => (
                      <Card
                        key={p.id}
                        className="p-6 bg-white/[0.02] border-white/10 hover:border-primary/40 transition-all rounded-2xl flex flex-col justify-between group"
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className={`text-xs px-2.5 py-0.5 capitalize ${
                                p.status === "published"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : p.status === "pending_review"
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                  : "border-white/20 bg-white/5 text-muted-foreground"
                              }`}
                            >
                              {p.status === "published" ? (
                                <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                              ) : (
                                <Clock className="w-3 h-3 mr-1 inline" />
                              )}
                              {p.status.replace("_", " ")}
                            </Badge>
                            <span className="text-xs font-mono text-muted-foreground">
                              Trust: {p.trustScore}/100
                            </span>
                          </div>

                          <div>
                            <h3 className="text-lg font-bold group-hover:text-primary transition-colors flex items-center gap-2">
                              {p.title}
                            </h3>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {p.tagline}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 mt-6 border-t border-white/5 text-xs">
                          {p.status === "published" ? (
                            <Link
                              href={`/products/${p.slug}`}
                              className="text-primary hover:underline flex items-center gap-1 font-medium"
                            >
                              Public Page
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Draft Mode</span>
                          )}

                          <Link
                            href={`/studio/products/${p.slug}/preview`}
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Studio Preview
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Interactive Block Document Editor Client Component */}
              <div className="space-y-6 pt-6 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <Layout className="w-5 h-5 text-primary" />
                      Launch New Product / Update Document
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Compose visual block schemas (Hero, Media Gallery, Grid, Tech Stack, CTA) in accordance with the contracts specification.
                    </p>
                  </div>
                </div>

                <StudioBuilderClient
                  defaultOrgId={userOrgs[0]?.id || "nlb-official"}
                  isEarlyBird={publishedCount < 100}
                  publishedCount={publishedCount}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <FooterSection />
    </div>
  );
}
