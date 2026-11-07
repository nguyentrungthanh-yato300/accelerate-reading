import { ensureChunks } from "@/lib/chunker";

// A Route Handler for the same reason as the quiz route: it runs during Preview, in parallel.
export async function POST(_req: Request, ctx: RouteContext<"/api/articles/[id]/chunks">) {
  const { id } = await ctx.params;
  return Response.json(await ensureChunks(Number(id)));
}
