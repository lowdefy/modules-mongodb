/**
 * GenerateChatTitle — name a chat thread from its FIRST EXCHANGE.
 *
 * The platform's `generateTitle: true` on an agent titles a thread from the
 * first user message alone, which in a panel offering welcome suggestion
 * prompts is nearly always a canned string: every thread comes out with the
 * same name, describing the question rather than the subject. The reply is
 * where the subject actually is, so the title is generated here, after the
 * first turn completes, from the question AND the answer.
 *
 * This runs on the display path: it must never be the reason a chat has no
 * title. Every failure returns { title: null } and the caller keeps whatever
 * provisional title it already showed.
 */
import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";
import { z } from "zod";

import cleanTitle, { MAX_TITLE_CHARS } from "./cleanTitle.js";

const DEFAULT_MODEL = "openai/gpt-5-mini";
const DEFAULT_EFFORT = "low";
// Enough of each side to identify the subject; the rest is elaboration the
// title must not try to carry, and tokens on a call that runs on every new
// thread. The reply gets the larger share — it is where the subject is named.
const PROMPT_CHARS = 600;
const REPLY_CHARS = 1200;

const TitleOutput = z.object({
  title: z.string(),
});

const buildInstructions = (domain) => `You name chat threads${
  domain ? ` in ${domain}` : ""
}.

Given the user's opening question and the assistant's reply, write a title for the thread.

Rules:
- Name the SUBJECT, not the action. The user's question is often a canned
  prompt like "Explain this" or "How do I get started?" — those words must not
  be the title. The subject is almost always in the reply: the specific record,
  task, feature, or requirement being discussed.
- 2 to 6 words. Never more than ${MAX_TITLE_CHARS} characters.
- Sentence case. Keep established abbreviations as written.
- No quotation marks, no trailing punctuation, no "chat about", no "discussion of".
- If the exchange is genuinely about nothing specific, describe the ask in 2-3
  plain words rather than inventing a subject.

Examples:
  Q: "How do I do this?" / A: "To move an employee's assignment to another site you open the assignment record and..."
  -> Moving an employee assignment
  Q: "What do I need to attach?" / A: "For the board charter you would attach the signed charter and the minutes approving it..."
  -> Evidence for board charter
  Q: "What's outstanding here?" / A: "The onboarding checklist is at 60%, with the contract and ID copy still missing..."
  -> Outstanding onboarding items`;

async function GenerateChatTitle({ connection, request }) {
  if (!connection?.apiKey) {
    // Same contract as every other failure — the caller keeps its provisional
    // title. Throwing here surfaced an error after every first exchange for
    // consumers that mount without the titling secret, on a call whose whole
    // documented promise is to fail silently.
    return { title: null, error: "AI Gateway apiKey not configured" };
  }
  const prompt = String(request.prompt || "").slice(0, PROMPT_CHARS);
  const reply = String(request.reply || "").slice(0, REPLY_CHARS);
  if (!prompt && !reply) return { title: null };

  const context = request.context ? `Context: ${request.context}\n\n` : "";

  try {
    const { output } = await generateText({
      model: createGateway({ apiKey: connection.apiKey })(
        request.model || DEFAULT_MODEL,
      ),
      providerOptions: {
        openai: { reasoningEffort: request.reasoningEffort || DEFAULT_EFFORT },
      },
      prompt: `${context}User's opening question:\n${prompt}\n\nAssistant's reply:\n${reply}\n\n${buildInstructions(
        request.domain,
      )}`,
      output: Output.object({ schema: TitleOutput }),
    });
    return { title: cleanTitle(output?.title) };
  } catch (error) {
    // Swallowed on purpose — see the header note. The caller keeps its
    // provisional title, and the thread is never left nameless because a
    // best-effort cosmetic call timed out.
    return { title: null, error: error.message };
  }
}

GenerateChatTitle.schema = {
  type: "object",
  required: ["prompt", "reply"],
  properties: {
    prompt: { type: "string", description: "The user's first message." },
    reply: { type: "string", description: "The assistant's first reply." },
    context: {
      type: ["string", "null"],
      description: "Optional one-line hint, e.g. the record or page in view.",
    },
    domain: {
      type: ["string", "null"],
      description:
        'Optional description of the app, to ground the title vocabulary — e.g. "a staffing and payroll tool".',
    },
    model: {
      type: ["string", "null"],
      description: "Gateway model id. Small and fast is the right choice.",
    },
    reasoningEffort: { type: ["string", "null"] },
  },
};
GenerateChatTitle.meta = { checkRead: false, checkWrite: false };

export default GenerateChatTitle;
