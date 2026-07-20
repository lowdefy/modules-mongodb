/**
 * Tenant-wall primitives for the engine's mongo wrappers (framework tenant
 * contract). A connection that declares `tenant: true` receives a resolved
 * verdict `{ field, value }` on every resolver call (null when the connection
 * has no tenant declaration or the request opted out). These two functions are
 * the single place the verdict becomes a query clause or a doc stamp, so every
 * wrapper enforces the wall identically ("one correct way") — no wrapper
 * re-implements the merge.
 *
 * Both functions pass their input through untouched on a null `tenant`, so
 * tenant-less deployments behave exactly as before.
 */

/**
 * Merge the tenant clause into a read/update filter. The caller's query is
 * preserved verbatim inside `$and` — never spread — so a caller-authored
 * clause on the tenant field can't widen or replace the wall: both clauses
 * must hold.
 *
 * @param {Object} query — the caller's query/filter (may be empty).
 * @param {{ field: string, value: string } | null} tenant — the framework
 *   tenant verdict, or null (no wall).
 * @returns {Object} the scoped query.
 */
export function scopeQuery(query, tenant) {
  if (!tenant) return query;
  const clause = { [tenant.field]: tenant.value };
  if (query == null || Object.keys(query).length === 0) return clause;
  return { $and: [query, clause] };
}

/**
 * Stamp the tenant field onto an insert/replacement document. Spread LAST so
 * a caller-authored value on the tenant field can never override the verdict.
 *
 * @param {Object} doc — the document to insert.
 * @param {{ field: string, value: string } | null} tenant — the framework
 *   tenant verdict, or null (no stamp).
 * @returns {Object} the stamped document.
 */
export function stampDoc(doc, tenant) {
  if (!tenant) return doc;
  return { ...doc, [tenant.field]: tenant.value };
}
