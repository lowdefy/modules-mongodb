import getMongoDb from "../../mongo/getMongoDb.js";
import validatePipeline from "../../../analytics/validatePipeline.js";

/**
 * AnalyticsPipeline — the ReportingData connection's single, read-only request:
 * the one path from an AI-authored aggregation pipeline to the database.
 * Validate the pipeline against the three default-deny grammars + the
 * collections catalog → execute the reconstructed result. One security
 * boundary.
 *
 * Validate inside the request, not upstream: the query arrives from an AI tool
 * call, a report section, or a report filter re-query, but wherever it comes
 * from it passes through validatePipeline here — the request is the only place
 * a pipeline can reach the driver, so it is the only place validation must
 * live. The executed pipeline is the RECONSTRUCTED object validatePipeline
 * returns (fresh tree of approved nodes + trailing result caps), never the
 * caller's input by reference.
 *
 * Catalog from the connection, not the request: `connection.catalog` is wired
 * once from the module var at build time (see reporting-data.yaml). Binding it
 * at the connection — not as a request property — means every request validates
 * against the same catalog by construction; a caller cannot substitute a stale
 * or trimmed catalog to widen what it can reach.
 *
 * Server-built filter $match: report filter re-queries send untrusted
 * `filters: [{ field, op, value }]` triples (browser CallAPI). This request
 * builds the `$match` itself from a fixed default-deny op map and PREPENDS it —
 * but the built stage is not exempt: the combined pipeline goes through
 * validatePipeline like any other, so a hostile field name (e.g. "$where") is
 * caught by the same gate.
 *
 * Request properties:
 *   query   — { collection, pipeline } authored upstream.
 *   roles   — the calling user's roles (wire as { _user: roles }); checked
 *             against each touched collection's catalog roles on execution.
 *   filters — optional [{ field, op, value }] triples, built into a leading
 *             $match.
 *
 * Statics are read by the request pipeline (checkConnectionRead/Write access
 * requestResolver.meta.*); without them every execution throws "Cannot read
 * properties of undefined (reading 'checkRead')". The pipeline is validated by
 * validatePipeline, so no property schema is needed. Read-only by construction
 * — the validator rejects every write stage.
 */

// Fixed, default-deny map from the filter-triple op vocabulary to Mongo query
// operators. An op outside this map throws (never silently skips) — the report
// filter UI emits only these ops, so anything else is a probe.
const FILTER_OPS = { eq: "$eq", gte: "$gte", lte: "$lte" };

function buildFilterMatch(filters) {
  const clauses = [];
  for (const { field, op, value } of filters) {
    // A null/undefined value means "no constraint" (an unset filter control) —
    // drop the triple rather than matching on null.
    if (value === null || value === undefined) continue;
    const mongoOp = FILTER_OPS[op];
    if (!mongoOp) {
      throw new Error(`Unsupported filter operator "${op}".`);
    }
    // Field names land in key position here; safety comes from validatePipeline
    // walking this stage like any other (a "$where"-shaped field is rejected).
    clauses.push({ [field]: { [mongoOp]: value } });
  }
  // One $match with $and — one consistent shape for any number of triples.
  return clauses.length > 0 ? { $match: { $and: clauses } } : null;
}

async function AnalyticsPipeline({ request = {}, connection }) {
  const { query, roles, filters } = request;

  // A destructuring default would miss an explicit null (an unresolved
  // _payload read, or a persisted part from the pre-pipeline model) — fail
  // with the actionable message, not a TypeError.
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw new Error(
      "Invalid pipeline: query must be { collection, pipeline }.",
    );
  }

  const match = Array.isArray(filters) ? buildFilterMatch(filters) : null;
  const combined = match ? [match, ...(query.pipeline ?? [])] : query.pipeline;

  const { collection, pipeline } = validatePipeline({
    collection: query.collection,
    pipeline: combined,
    catalog: connection.catalog,
    roles,
  });

  const { mongoDb } = await getMongoDb(connection);
  const rows = await mongoDb
    .collection(collection)
    .aggregate(pipeline, {
      maxTimeMS: connection.maxTimeMS ?? 30000,
      allowDiskUse: connection.allowDiskUse ?? true,
    })
    .toArray();

  return rows;
}

AnalyticsPipeline.schema = {};
AnalyticsPipeline.meta = {
  checkRead: true,
  checkWrite: false,
};

export default AnalyticsPipeline;
