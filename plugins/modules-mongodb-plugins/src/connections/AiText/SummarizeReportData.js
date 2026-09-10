/**
 * SummarizeReportData — a one-shot reading of a report's data, as filtered.
 *
 * The report page shows the numbers; this says what they mean. It takes the
 * report's title and description, the per-section rows the ai-reporting
 * module's summarize-report endpoint re-resolved under the viewer's roles and
 * active filters (shaped by _analytics.buildSummaryInput), and the
 * human-readable scope those filters amount to, and returns concise markdown.
 *
 * Unlike GenerateChatTitle this THROWS on failure. The title call is cosmetic
 * and documented to fail silently; this one answers a button click, and the
 * viewer who clicked Generate is owed an error rather than an empty drawer.
 * The failed CallAPI stops the page's action chain, so whatever summary was
 * already on screen survives.
 */
import { createGateway } from "@ai-sdk/gateway";
import { generateText } from "ai";

const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

const INSTRUCTIONS = `You write short readings of business reports for the people who use them.

You are given a report — its title, an optional description, and its sections as JSON. Each data section carries its label, type (kpi, chart or table), the keys that matter in its rows (valueKey for a kpi, x and y for a chart, columns for a table), and its rows. Markdown sections are the report author's own commentary and are context, not data. A section marked truncated shows only the first rows of a larger result; say so where it matters, and do not treat the visible rows as the whole.

Rules:
- State only what the supplied rows support. Never invent a number, a trend, or a cause. Where the data suggests something but does not show it, flag it as worth a look rather than explaining it.
- When the scope names active filters, open by naming that scope in plain words, so the reader knows the reading describes the filtered selection and not the whole dataset. When no filters are applied, do not mention filters.
- Lead with what matters most: the headline numbers, then the notable comparisons and outliers, then anything the reader should check.
- Be concise. Short paragraphs or a few bullets; no preamble, no restating the report title, no closing offer.
- Write in markdown. Bold a figure or name only where it carries the point.`;

export function buildPrompt({
  title,
  description,
  scope,
  hasFilters,
  sections,
}) {
  const lines = [`Report: ${title}`];
  if (description) lines.push(`Description: ${description}`);
  lines.push(
    hasFilters
      ? `Active filters (this is the scope the reading must describe): ${scope}`
      : `Scope: ${scope}`,
  );
  lines.push("", "Sections:", JSON.stringify(sections ?? [], null, 0));
  return lines.join("\n");
}

async function SummarizeReportData({ connection, request }) {
  if (!connection?.apiKey) {
    throw new Error(
      "SummarizeReportData: the AiText connection has no apiKey configured.",
    );
  }
  if (typeof request?.title !== "string" || request.title === "") {
    throw new Error("SummarizeReportData: title is required.");
  }
  const { text } = await generateText({
    model: createGateway({ apiKey: connection.apiKey })(
      request.model || DEFAULT_MODEL,
    ),
    system: INSTRUCTIONS,
    prompt: buildPrompt(request),
  });
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("SummarizeReportData: the model returned no text.");
  }
  return { text: text.trim() };
}

SummarizeReportData.schema = {
  type: "object",
  required: ["title", "scope", "sections"],
  properties: {
    title: { type: "string", description: "The report's title." },
    description: {
      type: ["string", "null"],
      description: "The report's description, if it has one.",
    },
    scope: {
      type: "string",
      description:
        "The human-readable filter scope the rows were resolved under, as buildSummaryInput renders it.",
    },
    hasFilters: {
      type: ["boolean", "null"],
      description:
        "Whether any filter is active — when true the reading opens by naming the scope.",
    },
    sections: {
      type: "array",
      description:
        "The shaped per-section data from _analytics.buildSummaryInput: label, type, contract keys, capped rows.",
    },
    model: {
      type: ["string", "null"],
      description: "Gateway model id (provider/model).",
    },
  },
};
SummarizeReportData.meta = { checkRead: false, checkWrite: false };

export default SummarizeReportData;
