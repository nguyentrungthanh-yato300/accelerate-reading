import { ensureChunks } from "@/lib/chunker";
import { getCurrentUser } from "@/lib/dal";

// A Route Handler for the same reason as the quiz route: it runs during Preview, in parallel.
export async function POST(_req: Request, ctx: RouteContext<"/api/articles/[id]/chunks">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ plan: null, error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  return Response.json(await ensureChunks(user.id, Number(id)));
}
