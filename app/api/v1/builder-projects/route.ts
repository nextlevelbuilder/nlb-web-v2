import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { createProject, listProjects, toProjectDto } from "@/lib/builder-league/projects";

export const dynamic = "force-dynamic";

/** The caller's active projects, oldest first. */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const projects = await listProjects(db, caller.user.id);
    return ok(projects.map(toProjectDto));
  });
}

/** Creates a project; `productId` links a directory product the caller's organization owns. */
export async function POST(request: Request) {
  return handleWrite(
    request,
    "/builder-league/evidence/new",
    () => requireBuilderLeagueUser(request, "builder:write", getDb()),
    async (input, { caller }) => {
      enforceUserRateLimit(caller.user.id, "builder-projects");
      const project = await createProject(getDb(), caller.user.id, input.body);
      return { response: ok(toProjectDto(project), undefined, 201), notice: "project_created" };
    }
  );
}
