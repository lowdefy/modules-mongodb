/**
 * AiText — small one-shot LLM calls that are not agents.
 *
 * Lowdefy's agent connections own conversations; a plain "ask a model one
 * question and get a value back" has nowhere to live in YAML. Anything that
 * needs nothing but a Vercel AI Gateway key belongs here rather than being
 * smuggled into a domain connection that carries a database and its secrets.
 */
import GenerateChatTitle from "./GenerateChatTitle.js";

export default {
  schema: {
    type: "object",
    required: ["apiKey"],
    properties: {
      apiKey: {
        type: "string",
        description: "Vercel AI Gateway API key (via _secret).",
        errorMessage: {
          type: 'AiText property "apiKey" should be a string.',
        },
      },
    },
    errorMessage: {
      required: {
        apiKey: "AiText connection requires apiKey.",
      },
    },
  },
  requests: {
    GenerateChatTitle,
  },
};
