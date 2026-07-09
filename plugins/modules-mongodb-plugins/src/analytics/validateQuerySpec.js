import {
  AGGREGATIONS,
  DATE_BUCKETS,
  DEFAULT_LIMIT,
  ID_REGEX,
  MAX_FILTERS,
  MAX_IN_VALUES,
  MAX_LIMIT,
  MAX_MEASURES,
  MAX_SELECT,
  MAX_SORT,
  MEASURE_FORMATS,
  OPS_BY_TYPE,
  PATH_REGEX,
} from "./constants.js";

/**
 * Validates an AI-composed query spec against the data dictionary — the single
 * allowlist gate between natural-language-derived specs and the database.
 * Every field name must come from the dictionary; values are type-checked
 * scalars; the caller never contributes query-language syntax.
 *
 * Spec shape (all names must exist in the dictionary):
 *   { dataset, select?: [dimId], measures?: [{ id, agg }],
 *     filters?: [{ field, op, value }], sort?: [{ field, dir }], limit? }
 *
 * Filters with a null/undefined value are dropped — an unset report filter
 * control means "no constraint", and controls bind their state directly into
 * filter values.
 *
 * Returns the normalized spec:
 *   { dataset (definition), select, measures (with output `key`),
 *     filters, sort, limit }
 * Throws Error with a message the model (or app author) can act on.
 */

function fail(message) {
  throw new Error(`Invalid query spec: ${message}`);
}

function validateDictionaryIds(dataset) {
  if (!ID_REGEX.test(dataset.id)) {
    fail(`dataset id "${dataset.id}" is not a valid identifier.`);
  }
  for (const field of [
    ...(dataset.dimensions ?? []),
    ...(dataset.measures ?? []),
  ]) {
    if (!ID_REGEX.test(String(field.id))) {
      fail(
        `dataset "${dataset.id}" field id "${field.id}" is not a valid identifier.`,
      );
    }
    // Author-declared source path (optional). Dotted paths reach embedded
    // sub-documents; PATH_REGEX keeps them injection-safe. Defense in depth —
    // the path comes from the trusted dictionary, never the AI.
    if (field.field !== undefined && !PATH_REGEX.test(String(field.field))) {
      fail(
        `dataset "${dataset.id}" field "${field.id}" declares path "${field.field}" ` +
          `which is not a valid dotted field path.`,
      );
    }
  }
  // Date bucketing is a dimension-only, date-only affordance.
  for (const dim of dataset.dimensions ?? []) {
    if (dim.bucket === undefined) continue;
    if (!DATE_BUCKETS.includes(dim.bucket)) {
      fail(
        `dataset "${dataset.id}" dimension "${dim.id}" declares bucket "${dim.bucket}" ` +
          `which is not one of ${DATE_BUCKETS.join(", ")}.`,
      );
    }
    if (dim.type !== "date") {
      fail(
        `dataset "${dataset.id}" dimension "${dim.id}" declares a bucket but is not a date dimension.`,
      );
    }
  }
}

// A dimension/measure maps to its author-declared `field` path, defaulting to
// its id (backward compatible — id and path coincide for flat scalar fields).
function fieldPath(entry) {
  return entry.field ?? entry.id;
}

function isScalarOfType(value, fieldType) {
  if (fieldType === "string") return typeof value === "string";
  if (fieldType === "number")
    return typeof value === "number" && Number.isFinite(value);
  if (fieldType === "boolean") return typeof value === "boolean";
  if (fieldType === "date") {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    return (
      (typeof value === "string" || typeof value === "number") &&
      !Number.isNaN(new Date(value).getTime())
    );
  }
  return false;
}

function validateQuerySpec({ spec, datasets, roles }) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    fail("spec must be an object.");
  }
  if (!Array.isArray(datasets) || datasets.length === 0) {
    fail("no datasets are configured in the data dictionary.");
  }

  // ── Dataset + roles gate ──
  const dataset = datasets.find((d) => d?.id === spec.dataset);
  if (!dataset) {
    fail(
      `dataset "${spec.dataset}" does not exist. Available datasets: ${datasets
        .map((d) => d?.id)
        .join(", ")}.`,
    );
  }
  validateDictionaryIds(dataset);
  const userRoles = Array.isArray(roles) ? roles : [];
  const datasetRoles = dataset.roles ?? [];
  if (
    datasetRoles.length > 0 &&
    !datasetRoles.some((r) => userRoles.includes(r))
  ) {
    fail(`you are not authorized to query dataset "${dataset.id}".`);
  }
  if (
    typeof dataset.source?.collection !== "string" ||
    dataset.source.collection === ""
  ) {
    fail(`dataset "${dataset.id}" has no source.collection configured.`);
  }

  const dimensionsById = new Map(
    (dataset.dimensions ?? []).map((d) => [d.id, d]),
  );
  const measuresById = new Map((dataset.measures ?? []).map((m) => [m.id, m]));

  // ── select (group-by dimensions) ──
  const select = spec.select ?? [];
  if (!Array.isArray(select)) fail("select must be an array of dimension ids.");
  if (select.length > MAX_SELECT)
    fail(`select allows at most ${MAX_SELECT} dimensions.`);
  const seenSelect = new Set();
  // Compiler-facing resolution of each selected dimension: output-column id +
  // its underlying (author-declared) source path + optional date bucket.
  const selectFields = [];
  for (const dimId of select) {
    const dimension = dimensionsById.get(dimId);
    if (!dimension) {
      fail(
        `select references dimension "${dimId}" which does not exist on dataset "${dataset.id}". ` +
          `Dimensions: ${[...dimensionsById.keys()].join(", ")}.`,
      );
    }
    if (seenSelect.has(dimId)) fail(`select lists dimension "${dimId}" twice.`);
    seenSelect.add(dimId);
    selectFields.push({
      id: dimId,
      field: fieldPath(dimension),
      bucket: dimension.bucket ?? null,
    });
  }

  // ── measures ──
  const rawMeasures = spec.measures ?? [];
  if (!Array.isArray(rawMeasures))
    fail("measures must be an array of { id, agg }.");
  if (rawMeasures.length > MAX_MEASURES)
    fail(`measures allows at most ${MAX_MEASURES} entries.`);
  const measures = [];
  const seenMeasureKeys = new Set();
  for (const entry of rawMeasures) {
    if (!entry || typeof entry !== "object")
      fail("each measure must be { id, agg }.");
    const measure = measuresById.get(entry.id);
    if (!measure) {
      fail(
        `measures references "${entry.id}" which does not exist on dataset "${dataset.id}". ` +
          `Measures: ${[...measuresById.keys()].join(", ")}.`,
      );
    }
    const agg = entry.agg;
    if (!AGGREGATIONS.includes(agg)) {
      fail(
        `measure "${entry.id}" aggregation "${agg}" is not one of ${AGGREGATIONS.join(", ")}.`,
      );
    }
    const allowed =
      measure.type === "count" ? ["count"] : (measure.aggregations ?? []);
    if (!allowed.includes(agg)) {
      fail(
        `measure "${entry.id}" does not allow aggregation "${agg}". Allowed: ${allowed.join(", ")}.`,
      );
    }
    if (
      measure.format !== undefined &&
      !MEASURE_FORMATS.includes(measure.format)
    ) {
      fail(
        `measure "${entry.id}" declares format "${measure.format}" which is not one of ` +
          `${MEASURE_FORMATS.join(", ")}.`,
      );
    }
    if (
      measure.currency !== undefined &&
      typeof measure.currency !== "string"
    ) {
      fail(
        `measure "${entry.id}" currency must be an ISO currency code string (e.g. "ZAR").`,
      );
    }
    if (measure.locale !== undefined && typeof measure.locale !== "string") {
      fail(
        `measure "${entry.id}" locale must be a BCP 47 locale string (e.g. "en-ZA").`,
      );
    }
    const key = `${entry.id}_${agg}`;
    if (seenMeasureKeys.has(key)) fail(`measure "${key}" is requested twice.`);
    seenMeasureKeys.add(key);
    measures.push({
      id: entry.id,
      agg,
      key,
      type: measure.type,
      field: fieldPath(measure),
      format: measure.format ?? null,
      currency: measure.currency ?? null,
      locale: measure.locale ?? null,
    });
  }

  if (select.length === 0 && measures.length === 0) {
    fail("spec must request at least one select dimension or one measure.");
  }

  // ── filters ──
  const rawFilters = (spec.filters ?? []).filter(
    (f) =>
      !(
        f &&
        typeof f === "object" &&
        (f.value === null || f.value === undefined)
      ),
  );
  if (!Array.isArray(spec.filters ?? [])) fail("filters must be an array.");
  if (rawFilters.length > MAX_FILTERS)
    fail(`filters allows at most ${MAX_FILTERS} entries.`);
  const filters = [];
  for (const filter of rawFilters) {
    if (!filter || typeof filter !== "object")
      fail("each filter must be { field, op, value }.");
    const dimension = dimensionsById.get(filter.field);
    const measure = measuresById.get(filter.field);
    // Filters apply to dimensions, or to number measures' raw (pre-aggregation)
    // field values. Count measures have no underlying field.
    const fieldType =
      dimension?.type ?? (measure?.type === "number" ? "number" : undefined);
    if (!fieldType) {
      fail(
        `filter field "${filter.field}" is not a filterable field on dataset "${dataset.id}".`,
      );
    }
    const allowedOps = OPS_BY_TYPE[fieldType] ?? [];
    if (!allowedOps.includes(filter.op)) {
      fail(
        `filter on "${filter.field}" (${fieldType}) does not allow op "${filter.op}". ` +
          `Allowed: ${allowedOps.join(", ")}.`,
      );
    }
    if (filter.op === "in" || filter.op === "nin") {
      if (!Array.isArray(filter.value))
        fail(`filter op "${filter.op}" requires an array value.`);
      if (filter.value.length > MAX_IN_VALUES) {
        fail(
          `filter op "${filter.op}" allows at most ${MAX_IN_VALUES} values.`,
        );
      }
      for (const v of filter.value) {
        if (!isScalarOfType(v, fieldType)) {
          fail(
            `filter on "${filter.field}" has a value that is not a valid ${fieldType}.`,
          );
        }
      }
    } else if (!isScalarOfType(filter.value, fieldType)) {
      fail(`filter on "${filter.field}" value must be a ${fieldType}.`);
    }
    filters.push({
      field: filter.field,
      path: fieldPath(dimension ?? measure),
      op: filter.op,
      value: filter.value,
      type: fieldType,
    });
  }

  // ── sort ──
  const rawSort = spec.sort ?? [];
  if (!Array.isArray(rawSort)) fail("sort must be an array of { field, dir }.");
  if (rawSort.length > MAX_SORT)
    fail(`sort allows at most ${MAX_SORT} entries.`);
  const outputColumns = new Set([...select, ...measures.map((m) => m.key)]);
  const sort = [];
  for (const entry of rawSort) {
    if (!entry || typeof entry !== "object")
      fail("each sort entry must be { field, dir }.");
    if (!outputColumns.has(entry.field)) {
      fail(
        `sort field "${entry.field}" is not an output column. Output columns: ` +
          `${[...outputColumns].join(", ")}. Aggregated measures sort as {measureId}_{agg}.`,
      );
    }
    const dir = entry.dir ?? "asc";
    if (dir !== "asc" && dir !== "desc")
      fail(`sort dir "${dir}" must be "asc" or "desc".`);
    sort.push({ field: entry.field, dir });
  }

  // ── limit (clamped, never trusted) ──
  let limit = spec.limit ?? DEFAULT_LIMIT;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
    fail(`limit must be a positive integer (max ${MAX_LIMIT}).`);
  }
  limit = Math.min(limit, MAX_LIMIT);

  return { dataset, select, selectFields, measures, filters, sort, limit };
}

export default validateQuerySpec;
