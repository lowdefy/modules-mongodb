import buildCsv from "../analytics/buildCsv.js";

/**
 * DownloadCsv — client action: builds a CSV from result rows in the browser
 * and triggers a download. No storage round-trip; the query engine's row caps
 * apply to exports too (the rows come from a CallAPI → query-data response).
 *
 * Params:
 *   data     — array of row objects (typically { _api: '<endpoint>.response' }).
 *   filename — download filename; defaults to export.csv.
 *   columns  — optional column order; defaults to the first row's keys.
 */
async function DownloadCsv({ params }) {
  const { data, filename = "export.csv", columns } = params ?? {};
  if (!Array.isArray(data)) {
    throw new Error("DownloadCsv requires params.data to be an array of rows.");
  }
  const csv = buildCsv({ rows: data, columns });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { rows: data.length, filename };
}

export default DownloadCsv;
