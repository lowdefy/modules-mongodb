import { orderedQueries } from "./querySections.js";
import validateReportSpec from "./validateReportSpec.js";

/**
 * The filter triples a data section's summary query carries, derived
 * SERVER-SIDE from the stored spec and the viewer's current control values.
 * The client sends `field → value` and nothing else: the op comes from the
 * spec's filter section (its control, and a multiselect's `match`), the same
 * control → op mapping compileReport bakes into a re-query — so a caller cannot
 * pick an operator, only a value, and the values are contained the way the
 * re-query path's are (AnalyticsPipeline builds the $match from a fixed op
 * map and revalidates the combined pipeline).
 *
 * Only the filters the section subscribes to via `filterBy` apply, because
 * that is what the screen shows: a filter constrains only the sections bound
 * to it. Null/absent values and empty arrays pass through as-is —
 * AnalyticsPipeline drops those triples, so an untouched control means "no
 * constraint" here exactly as it does for the page.
 */
export function sectionFilters(section, filterSectionsByField, filterValues) {
  const triples = [];
  for (const field of section.filterBy ?? []) {
    const filter = filterSectionsByField.get(field);
    if (!filter) continue;
    const value = filterValues?.[field] ?? null;
    if (filter.control === "daterange") {
      const [start, end] = Array.isArray(value) ? value : [null, null];
      triples.push(
        { field, op: "gte", value: start ?? null },
        { field, op: "lte", value: end ?? null },
      );
    } else if (filter.control === "multiselect") {
      triples.push({
        field,
        op: filter.match === "all" ? "all" : "in",
        value,
      });
    } else {
      triples.push({ field, op: "eq", value });
    }
  }
  return triples;
}

/**
 * The queries a report summary runs, in spec order, each with the filter
 * triples it carries: one entry per data section (kpi, chart, table) under the
 * viewer's active filter values, plus every filter section's `optionsQuery`
 * unfiltered — those rows are what buildSummaryInput maps a selected id to its
 * human-readable label with. The list is orderedQueries' list with `filters`
 * attached, so the routine's :for step results align index-for-index with
 * what buildSummaryInput expects.
 *
 * No catalog here, for the same reason querySections passes none at resolve:
 * the per-entry AnalyticsPipeline is the gate, and a section the viewer cannot
 * query fails inside its own :try rather than taking the summary down.
 */
function summaryQueries({ spec, roles, filterValues }) {
  const { sections } = validateReportSpec({ spec, roles });
  const filterSectionsByField = new Map(
    sections.filter((s) => s.type === "filter").map((s) => [s.field, s]),
  );
  const bySectionId = new Map(sections.map((s) => [s.id, s]));
  return orderedQueries(sections).map((entry) => ({
    ...entry,
    filters:
      entry.type === "filter"
        ? []
        : sectionFilters(
            bySectionId.get(entry.id),
            filterSectionsByField,
            filterValues,
          ),
  }));
}

export default summaryQueries;
