import validateReportSpec from "./validateReportSpec.js";

/**
 * Returns the report sections whose queries the resolver must run at resolve
 * time (kpi, chart, table), in section order. The resolve-report routine
 * iterates this list with :for, running one AnalyticsPipeline per entry inside
 * :try; the resulting (possibly sparse) step array aligns index-for-index with
 * this list and feeds compileReport's `results` param.
 *
 * No `catalog` is passed here at resolve: the security gate is the per-section
 * AnalyticsPipeline (which revalidates against the connection-bound catalog for
 * the viewing user), so a section a viewer can't access fails as one Alert card
 * rather than throwing here and taking down the whole report. Each returned
 * `query` is the raw `{ collection, pipeline }`.
 *
 * Download sections query client-side on click and filter/markdown sections
 * have no query — they are excluded.
 */
function querySections({ spec, catalog, roles }) {
  const { sections } = validateReportSpec({ spec, catalog, roles });
  return sections
    .filter((section) => ["kpi", "chart", "table"].includes(section.type))
    .map((section) => ({ id: section.id, type: section.type, query: section.query }));
}

export default querySections;
