import validateReportSpec from "./validateReportSpec.js";

/**
 * Returns, in spec order, one entry per query the resolver must run: a data
 * section (kpi, chart, table) contributes its query unchanged, and a filter
 * section with an `optionsQuery` contributes the query half of it (
 * `valueKey`/`labelKey` stripped — compileReport reads those off the spec
 * section, not off this list). A filter with no `optionsQuery` (declared
 * `options`, or a catalog enum `values`) contributes no entry. Entries are
 * interleaved at their section's position, not grouped.
 *
 * Takes the already-normalized `sections` array (validateReportSpec's output),
 * not a raw spec.
 */
export function orderedQueries(sections) {
  const entries = [];
  for (const section of sections) {
    if (["kpi", "chart", "table"].includes(section.type)) {
      entries.push({
        id: section.id,
        type: section.type,
        query: section.query,
      });
    } else if (section.type === "filter" && section.optionsQuery) {
      const { collection, pipeline } = section.optionsQuery;
      entries.push({
        id: section.id,
        type: "filter",
        query: { collection, pipeline },
      });
    }
  }
  return entries;
}

/**
 * Returns the report queries the resolver must run at resolve time, in spec
 * order: kpi/chart/table sections, plus filter sections carrying an
 * `optionsQuery`. The resolve-report routine iterates this list with :for,
 * running one AnalyticsPipeline per entry inside :try; the resulting (possibly
 * sparse) step array aligns index-for-index with this list and feeds
 * compileReport's `results` param.
 *
 * No `catalog` is passed here at resolve: the security gate is the per-entry
 * AnalyticsPipeline (which revalidates against the connection-bound catalog for
 * the viewing user), so an entry a viewer can't access fails as one Alert card
 * rather than throwing here and taking down the whole report. That gate is why
 * an options query rides this same list instead of a new endpoint — catalog
 * validation plus per-viewer role enforcement come for free from the one gate
 * every query already passes. Each returned `query` is the raw
 * `{ collection, pipeline }`.
 *
 * Download sections query client-side on click, markdown sections have no
 * query, and a filter without an optionsQuery has nothing to run — all are
 * excluded.
 */
function querySections({ spec, catalog, roles }) {
  const { sections } = validateReportSpec({ spec, catalog, roles });
  return orderedQueries(sections);
}

export default querySections;
