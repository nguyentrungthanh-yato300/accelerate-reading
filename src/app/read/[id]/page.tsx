import { notFound } from "next/navigation";
import { ReadingFlow } from "@/components/ReadingFlow";
import { aiStatus } from "@/lib/ai";
import { getArticle, suggestedPacerWpm } from "@/lib/queries";

export default async function ReadPage({ params }: PageProps<"/read/[id]">) {
  const { id } = await params;
  const article = await getArticle(Number(id));
  if (!article) notFound();

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
      aiConfigured={aiStatus().configured}
      suggestedWpm={await suggestedPacerWpm(article.language)}
    />
  );
}
