/**
 * Compiles a validated query spec (validateQuerySpec output) into a Mongo
 * aggregation pipeline. Pure function — no I/O.
 *
 * The pipeline is read-only by construction: only $match, $group, $project,
 * $sort and $limit stages are ever emitted. Field names come from the
 * dictionary allowlist (plain identifiers — no '$', no '.'); values are
 * embedded as typed literals, never interpreted.
 */

const MATCH_OPS = {
  eq: "$eq",
  neq: "$ne",
  gt: "$gt",
  gte: "$gte",
  lt: "$lt",
  lte: "$lte",
  in: "$in",
  nin: "$nin",
};

const ACCUMULATORS = { sum: "$sum", avg: "$avg", min: "$min", max: "$max" };

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function coerceValue(value, type) {
  if (type === "date") return value instanceof Date ? value : new Date(value);
  return value;
}

function compileFilter({ field, op, value, type }) {
  if (op === "contains") {
    return { [field]: { $regex: escapeRegExp(value), $options: "i" } };
  }
  const coerced = Array.isArray(value)
    ? value.map((v) => coerceValue(v, type))
    : coerceValue(value, type);
  return { [field]: { [MATCH_OPS[op]]: coerced } };
}

function compileMongo({ select, measures, filters, sort, limit }) {
  const pipeline = [];

  if (filters.length > 0) {
    pipeline.push({ $match: { $and: filters.map(compileFilter) } });
  }

  // Always aggregate: measures accumulate; a measure-less spec is a distinct
  // query over the selected dimensions.
  const groupId = {};
  for (const dimId of select) {
    groupId[dimId] = `$${dimId}`;
  }
  const group = { _id: select.length > 0 ? groupId : null };
  for (const measure of measures) {
    group[measure.key] =
      measure.agg === "count" ? { $sum: 1 } : { [ACCUMULATORS[measure.agg]]: `$${measure.id}` };
  }
  pipeline.push({ $group: group });

  const project = { _id: 0 };
  for (const dimId of select) {
    project[dimId] = `$_id.${dimId}`;
  }
  for (const measure of measures) {
    project[measure.key] = 1;
  }
  pipeline.push({ $project: project });

  if (sort.length > 0) {
    const sortStage = {};
    for (const entry of sort) {
      sortStage[entry.field] = entry.dir === "desc" ? -1 : 1;
    }
    pipeline.push({ $sort: sortStage });
  }

  pipeline.push({ $limit: limit });

  return pipeline;
}

export default compileMongo;
