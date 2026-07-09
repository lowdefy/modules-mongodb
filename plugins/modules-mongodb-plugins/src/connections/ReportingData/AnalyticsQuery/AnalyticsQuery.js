import getMongoDb from "../../mongo/getMongoDb.js";
import validateQuerySpec from "../../../analytics/validateQuerySpec.js";
import compileMongo from "../../../analytics/compileMongo.js";

/**
 * AnalyticsQuery — the ReportingData connection's single, read-only request:
 * the one path from an AI-composed query spec to the database. Validate spec
 * against the data dictionary (allowlist + dataset roles) → compile to a safe
 * aggregation ($match/$group/$project/$sort/$limit only, capped rows) →
 * execute against the dataset's collection. One security boundary.
 *
 * Request properties:
 *   datasets — the data dictionary (module var, inlined at build).
 *   spec     — the query spec (from the AI tool call, a report section, or a
 *              report filter re-query).
 *   roles    — the calling user's roles (wire as { _user: roles }); checked
 *              against each dataset's roles on every execution.
 *
 * Returns the result rows. Aggregated measures surface as {measureId}_{agg}.
 */
async function AnalyticsQuery({ request = {}, connection }) {
  const { datasets, spec, roles } = request;

  const validated = validateQuerySpec({ spec, datasets, roles });
  const pipeline = compileMongo(validated);

  const { mongoDb } = await getMongoDb(connection);
  const rows = await mongoDb
    .collection(validated.dataset.source.collection)
    .aggregate(pipeline, {
      maxTimeMS: connection.maxTimeMS ?? 30000,
      allowDiskUse: false,
    })
    .toArray();

  return rows;
}

// The request pipeline reads these statics (checkConnectionRead/Write access
// requestResolver.meta.*); without them every execution throws "Cannot read
// properties of undefined (reading 'checkRead')". The spec is validated by
// validateQuerySpec, so no property schema is needed. Read-only by
// construction — the compiler emits no write stages.
AnalyticsQuery.schema = {};
AnalyticsQuery.meta = {
  checkRead: true,
  checkWrite: false,
};

export default AnalyticsQuery;
