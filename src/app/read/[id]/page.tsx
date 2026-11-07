import { notFound } from "next/navigation";
import { ReadingFlow } from "@/components/ReadingFlow";
import { getAiStatus } from "@/lib/ai-settings";
import { requireUser } from "@/lib/dal";
import { getArticle, suggestedPacerWpm } from "@/lib/queries";

export default async function ReadPage({ params }: PageProps<"/read/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const article = await getArticle(Number(id));
  if (!article) notFound();
  const [ai, suggestedWpm] = await Promise.all([getAiStatus(user.id), suggestedPacerWpm(article.language)]);

  return (
    <ReadingFlow
      // remount (fresh session) when navigating between articles
      key={article.id}
      article={{
        id: article.id,
        title: article.title,
        content: article.content,
        language: article.language,
        wordCount: article.wordCount,
      }}
      aiConfigured={ai.configured}
      suggestedWpm={suggestedWpm}
    />
  );
}
