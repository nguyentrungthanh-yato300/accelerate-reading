import { AiSettingsForm } from "@/components/AiSettingsForm";
import { Card } from "@/components/ui";
import { getAiStatus } from "@/lib/ai-settings";
import { requireUser } from "@/lib/dal";

export default async function SettingsPage() {
  const user = await requireUser();
  const ai = await getAiStatus(user.id);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-stone-500">Signed in as {user.email}</p>
      </div>
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">AI provider</h2>
          <p className="mt-1 text-sm text-stone-500">
            Quizzes, phrase pacing, purpose coaching and summary feedback use your own API key, billed by your
            provider. The key is encrypted before it is stored and is never shown again or sent to your browser.
          </p>
        </div>
        <AiSettingsForm
          saved={
            ai.configured
              ? { provider: ai.provider, model: ai.model, keyHint: ai.keyHint, baseUrl: ai.baseUrl }
              : null
          }
        />
      </Card>
    </div>
  );
}
