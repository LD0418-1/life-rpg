import "server-only";
// Asks Claude to write a weekly recap. Needs ANTHROPIC_API_KEY (set it in
// Vercel → Settings → Environment Variables; never commit it or paste it anywhere).
import Anthropic from "@anthropic-ai/sdk";
import { RECAP_SYSTEM_PROMPT } from "@/lib/game/recap";

export const RECAP_MODEL = "claude-opus-5-5";

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Returns Claude's text (headline on the first line). Throws a readable error. */
export async function writeRecapWithClaude(prompt: string): Promise<string> {
  // The key is read from ANTHROPIC_API_KEY. 50 s keeps us inside Vercel's time limit.
  const client = new Anthropic({ timeout: 50_000, maxRetries: 1 });
  try {
    const message = await client.beta.messages.create({
      model: RECAP_MODEL,
      max_tokens: 16000,
      // A short recap doesn't need deep thinking: low effort is faster and cheaper.
      output_config: { effort: "low" },
      // If a safety check ever declines the request, the API retries it on a suitable model by itself.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: RECAP_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    if (message.stop_reason === "refusal") throw new Error("Claude declined to write this recap. Try again, or untick “Use my diary notes”.");
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    if (!text) throw new Error("The recap came back empty. Try again.");
    return text;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel, then redeploy.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error("Your Anthropic key isn't allowed to use this model. Check your Anthropic Console account.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("The AI is busy (rate limit). Try again in a minute.");
    if (e instanceof Anthropic.BadRequestError) throw new Error(`The AI request was refused: ${e.message}`); // e.g. "credit balance is too low"
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new Error("The AI took too long. Try again.");
    if (e instanceof Anthropic.APIError) throw new Error(`The AI service had a problem${e.status ? ` (${e.status})` : ""}. Try again later.`);
    throw e;
  }
}
