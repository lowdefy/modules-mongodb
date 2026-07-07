import validateReportSpec from "./validateReportSpec.js";

/**
 * Returns the report sections whose queries the resolver must run at resolve
 * time (kpi, chart, table — consumer 3 of the query engine), in section order.
 * The resolve-report routine iterates this list with :for, running one
 * AnalyticsQuery per entry inside :try; the resulting (possibly sparse) step
 * array aligns index-for-index with this list and feeds compileReport's
 * `results` param.
 *
 * Download sections query client-side on click and filter/markdown sections
 * have no query — they are excluded.
 */
function querySections({ spec, datasets, roles }) {
  const { sections } = validateReportSpec({ spec, datasets, roles });
  return sections
    .filter((section) => ["kpi", "chart", "table"].includes(section.type))
    .map((section) => ({ id: section.id, type: section.type, query: section.query }));
}

export default querySections;
