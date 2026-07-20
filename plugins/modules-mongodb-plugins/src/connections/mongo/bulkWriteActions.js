import { scopeQuery, stampDoc } from "./tenantScope.js";

/**
 * Apply the tenant verdict to every bulk operation: insert documents (and
 * replacement docs) are stamped; update/delete/replace filters are `$and`-
 * merged — so no op in the batch can read, write, or spawn a doc outside the
 * org wall (tenant-wall contract). An op kind outside the known set throws:
 * silently passing it through would be a hole in the wall.
 *
 * @param {Array<object>} operations — driver bulkWrite operations.
 * @param {{ field: string, value: string }} tenant — the framework tenant
 *   verdict (non-null; the caller skips this entirely when tenant is null).
 * @returns {Array<object>} the tenant-scoped operations.
 */
function scopeOperations(operations, tenant) {
  return operations.map((op) => {
    const [kind] = Object.keys(op);
    const spec = op[kind];
    switch (kind) {
      case "insertOne":
        return {
          insertOne: { ...spec, document: stampDoc(spec.document, tenant) },
        };
      case "updateOne":
      case "updateMany":
      case "deleteOne":
      case "deleteMany":
        return { [kind]: { ...spec, filter: scopeQuery(spec.filter, tenant) } };
      case "replaceOne":
        return {
          replaceOne: {
            ...spec,
            filter: scopeQuery(spec.filter, tenant),
            replacement: stampDoc(spec.replacement, tenant),
          },
        };
      default:
        throw new Error(
          `bulkWriteActions: unknown bulk operation kind "${kind}" — the tenant wall cannot be applied to it.`,
        );
    }
  });
}

/**
 * Wraps the native driver `bulkWrite` against the actions collection.
 *
 * `operations` is an array of `{ updateOne: {...} }` / `{ insertOne: {...} }`
 * entries built from the Plan. Returns acknowledged counts only — it does NOT
 * return per-op post-write docs, because the change-log builder reads
 * before/after from the Plan, not from the write (design D7).
 *
 * `tenant` is the framework tenant verdict `{ field, value }` (or null): when
 * set, every op is tenant-scoped via `scopeOperations` above.
 */
async function bulkWriteActions({
  mongoDb,
  collection,
  operations,
  session,
  tenant = null,
}) {
  if (!operations || operations.length === 0) {
    return { ok: 1, insertedCount: 0, modifiedCount: 0, matchedCount: 0 };
  }
  const scoped = tenant ? scopeOperations(operations, tenant) : operations;
  return mongoDb.collection(collection).bulkWrite(scoped, { session });
}

export default bulkWriteActions;
