import { ensureQuiz } from "@/lib/quiz";

// A Route Handler rather than a Server Action: the client dispatches Server Actions one at a
// time, so a slow quiz generation started during Preview would block the next steps' actions.
export async function POST(_req: Request, ctx: RouteContext<"/api/articles/[id]/quiz">) {
  const { id } = await ctx.params;
  return Response.json(await ensureQuiz(Number(id)));
}
