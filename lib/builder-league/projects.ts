/**
 * Member projects: the unit VALIDATE / BUILD / SHIP evidence is scored against. A project may link to a
 * directory product the member owns (owner or admin of the product's organization), so a launch on the
 * directory and a launch evidence for the project dedupe to one award.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { builderProjects, members, products } from "@/lib/db/schema";
import { BuilderApiError } from "./http";
import { STAGES, VISIBILITIES } from "./types";

export type BuilderProject = typeof builderProjects.$inferSelect;

/** Organization roles that count as owning a directory product. */
const PRODUCT_OWNER_ROLES = ["owner", "admin"];
const MAX_PROJECTS_PER_USER = 50;

export const CreateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    summary: z.string().trim().max(500).default(""),
    stage: z.enum(STAGES).default("validate"),
    productId: z.string().trim().min(1).max(64).nullish(),
    visibility: z.enum(VISIBILITIES).default("private"),
  })
  .strict();
export type CreateProjectInput = z.input<typeof CreateProjectSchema>;

export function slugifyProjectName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "project";
}

export async function listProjects(db: AppDb, userId: string): Promise<BuilderProject[]> {
  return db
    .select()
    .from(builderProjects)
    .where(and(eq(builderProjects.ownerUserId, userId), isNull(builderProjects.archivedAt)))
    .orderBy(asc(builderProjects.createdAt), asc(builderProjects.id));
}

/** The member's non-archived project, or null. Never returns another member's project. */
export async function getOwnedProject(db: AppDb, userId: string, projectId: string): Promise<BuilderProject | null> {
  const [project] = await db
    .select()
    .from(builderProjects)
    .where(and(eq(builderProjects.id, projectId), eq(builderProjects.ownerUserId, userId), isNull(builderProjects.archivedAt)))
    .limit(1);
  return project ?? null;
}

/** True when the user is an owner or admin of the organization that owns the product. */
export async function ownsDirectoryProduct(db: AppDb, userId: string, productId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .innerJoin(members, eq(members.organizationId, products.orgId))
    .where(and(eq(products.id, productId), eq(members.userId, userId), inArray(members.role, PRODUCT_OWNER_ROLES)))
    .limit(1);
  return Boolean(row);
}

async function insertWithUniqueSlug(db: AppDb, values: Omit<typeof builderProjects.$inferInsert, "slug">, name: string) {
  const base = slugifyProjectName(name);
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [row] = await db
      .insert(builderProjects)
      .values({ ...values, slug })
      .onConflictDoNothing({ target: [builderProjects.ownerUserId, builderProjects.slug] })
      .returning();
    if (row) return row;
  }
  throw new BuilderApiError(409, "slug_unavailable", "Choose a different project name.");
}

export async function createProject(db: AppDb, userId: string, input: unknown): Promise<BuilderProject> {
  const parsed = CreateProjectSchema.parse(input);
  if (parsed.productId) {
    if (!(await ownsDirectoryProduct(db, userId, parsed.productId))) {
      throw new BuilderApiError(403, "product_not_owned", "You can only link a directory product your organization owns.");
    }
    const [linked] = await db
      .select({ id: builderProjects.id })
      .from(builderProjects)
      .where(and(eq(builderProjects.ownerUserId, userId), eq(builderProjects.productId, parsed.productId), isNull(builderProjects.archivedAt)))
      .limit(1);
    if (linked) throw new BuilderApiError(409, "product_already_linked", "This product is already linked to one of your projects.");
  }
  const existing = await listProjects(db, userId);
  if (existing.length >= MAX_PROJECTS_PER_USER) {
    throw new BuilderApiError(409, "project_limit", `You can keep at most ${MAX_PROJECTS_PER_USER} active projects.`);
  }
  const now = new Date();
  return insertWithUniqueSlug(
    db,
    {
      id: crypto.randomUUID(),
      ownerUserId: userId,
      name: parsed.name,
      summary: parsed.summary,
      stage: parsed.stage,
      productId: parsed.productId ?? null,
      visibility: parsed.visibility,
      createdAt: now,
      updatedAt: now,
    },
    parsed.name
  );
}

/**
 * The member's project linked to a directory product, created on first use (used by the backfill).
 * Concurrent callers converge on one row per (owner, product) slug.
 */
export async function findOrCreateProductProject(
  db: AppDb,
  userId: string,
  product: { id: string; title: string; tagline: string; slug: string }
): Promise<BuilderProject> {
  const findLinked = async () => {
    const [row] = await db
      .select()
      .from(builderProjects)
      .where(and(eq(builderProjects.ownerUserId, userId), eq(builderProjects.productId, product.id)))
      .orderBy(asc(builderProjects.createdAt))
      .limit(1);
    return row ?? null;
  };
  const linked = await findLinked();
  if (linked) return linked;
  const now = new Date();
  // Deterministic slug from the directory slug, so a concurrent run collides instead of duplicating.
  const [row] = await db
    .insert(builderProjects)
    .values({
      id: crypto.randomUUID(),
      ownerUserId: userId,
      name: product.title.slice(0, 80),
      slug: `directory-${product.slug}`.slice(0, 80),
      summary: product.tagline.slice(0, 500),
      stage: "ship",
      productId: product.id,
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [builderProjects.ownerUserId, builderProjects.slug] })
    .returning();
  if (row) return row;
  const raced = await findLinked();
  if (raced) return raced;
  throw new BuilderApiError(409, "slug_unavailable", `Project slug directory-${product.slug} is taken by an unrelated project.`);
}

export function toProjectDto(project: BuilderProject) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    summary: project.summary,
    stage: project.stage,
    productId: project.productId,
    visibility: project.visibility,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
