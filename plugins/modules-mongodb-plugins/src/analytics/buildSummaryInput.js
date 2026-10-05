import { MAX_SUMMARY_ROWS_PER_SECTION } from "./constants.js";
import { orderedQueries } from "./querySections.js";
import validateReportSpec from "./validateReportSpec.js";

export const NO_FILTERS_SCOPE = "All data — no filters applied";

// A selected value is unset when the control is empty: null, or the [] a
// cleared MultipleSelector leaves behind. Same rule AnalyticsPipeline applies
// when it drops a triple, so the scope line never names a constraint the
// queries did not apply.
function isUnset(value) {
  return (
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0)
  );
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

// One value as the reader would see it in the control. An optionsQuery's rows
// carry the label a foreign-key id stands for; declared `options` and catalog
// enum values are already the readable strings. Anything unmapped falls back
// to the raw value rather than being dropped — a scope line missing a
// constraint that WAS applied would misstate what the summary describes.
function displayValue(filter, value, optionRows) {
  if (filter.optionsQuery && Array.isArray(optionRows)) {
    const { valueKey, labelKey } = filter.optionsQuery;
    const row = optionRows.find((r) => r?.[valueKey] === value);
    if (row && row[labelKey] !== undefined && row[labelKey] !== null) {
      return String(row[labelKey]);
    }
  }
  return String(value);
}

function describeFilter(filter, value, optionRows) {
  if (filter.control === "daterange") {
    const [start, end] = Array.isArray(value) ? value : [null, null];
    if (isUnset(start) && isUnset(end)) return null;
    if (isUnset(end)) return `${filter.label}: from ${formatDate(start)}`;
    if (isUnset(start)) return `${filter.label}: until ${formatDate(end)}`;
    return `${filter.label}: ${formatDate(start)} – ${formatDate(end)}`;
  }
  const values = Array.isArray(value) ? value : [value];
  return `${filter.label}: ${values
    .map((v) => displayValue(filter, v, optionRows))
    .join(", ")}`;
}

/**
 * Shapes what the model is shown for a report summary, and renders the scope
 * line the prose opens with — the data half of the call. The AiText request
 * (SummarizeReportData) owns the prompt wording; this owns what goes into it,
 * the same split buildDataParts has with the chat card.
 *
 * Params:
 *   spec         — the stored report spec (re-validated here, inert-only).
 *   results      — the routine's :for step results over summaryQueries(), one
 *                  entry per query in that order; a missing entry marks a
 *                  section whose query failed inside :try.
 *   filterValues — `field → value` map of the viewer's active controls.
 *   roles        — the viewing user's roles, forwarded to validateReportSpec.
 *
 * Returns { title, description, scope, hasFilters, sections, excluded }:
 *   sections — data sections in spec order that produced rows, each with its
 *              label, type, contract keys, rows capped at
 *              MAX_SUMMARY_ROWS_PER_SECTION, the true rowCount and a
 *              `truncated` flag; markdown sections ride along as author-written
 *              context. Download sections are not data and are left out.
 *   excluded — labels of the data sections whose query failed for this viewer
 *              (role-gated or broken). Labels only: naming why would leak the
 *              access model, and the drawer shows this list verbatim.
 *   scope    — the human-readable filter scope, or NO_FILTERS_SCOPE.
 */
function buildSummaryInput({ spec, results, filterValues, roles }) {
  const validated = validateReportSpec({ spec, roles });
  const { sections } = validated;

  let resultsArray = results ?? [];
  if (!Array.isArray(resultsArray)) {
    if (typeof resultsArray === "object") {
      resultsArray = Object.assign([], resultsArray);
    } else {
      throw new Error(
        "buildSummaryInput: results must be the routine's per-query step results.",
      );
    }
  }
  const rowsBySectionId = new Map();
  orderedQueries(sections).forEach((entry, index) => {
    const rows = resultsArray[index];
    if (Array.isArray(rows)) rowsBySectionId.set(entry.id, rows);
  });

  const shaped = [];
  const excluded = [];
  for (const section of sections) {
    if (section.type === "markdown") {
      shaped.push({
        id: section.id,
        type: "markdown",
        content: section.content,
      });
      continue;
    }
    if (!["kpi", "chart", "table"].includes(section.type)) continue;
    const rows = rowsBySectionId.get(section.id);
    if (!rows) {
      excluded.push(section.label);
      continue;
    }
    const entry = {
      id: section.id,
      type: section.type,
      label: section.label,
      rowCount: rows.length,
      truncated: rows.length > MAX_SUMMARY_ROWS_PER_SECTION,
      rows: rows.slice(0, MAX_SUMMARY_ROWS_PER_SECTION),
    };
    // The presentation contract tells the model which keys matter in the rows.
    if (section.type === "kpi") entry.valueKey = section.valueKey;
    if (section.type === "chart") {
      entry.chart = section.chart;
      entry.x = section.x;
      entry.y = section.y;
    }
    if (section.type === "table") {
      entry.columns = section.columns.map((c) => c.key);
    }
    shaped.push(entry);
  }

  const parts = [];
  for (const filter of sections.filter((s) => s.type === "filter")) {
    const value = filterValues?.[filter.field];
    if (isUnset(value)) continue;
    const line = describeFilter(filter, value, rowsBySectionId.get(filter.id));
    if (line) parts.push(line);
  }

  return {
    title: validated.title,
    description: validated.description ?? null,
    scope: parts.length > 0 ? parts.join(" · ") : NO_FILTERS_SCOPE,
    hasFilters: parts.length > 0,
    sections: shaped,
    excluded,
  };
}

export default buildSummaryInput;
