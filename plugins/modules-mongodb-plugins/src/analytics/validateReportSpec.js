import {
  CHART_TYPES,
  FILTER_CONTROLS,
  FORMAT_STYLES,
  MAX_FILTER_OPTIONS,
  MAX_LABEL_LENGTH,
  MAX_MARKDOWN_LENGTH,
  MAX_SECTIONS,
} from "./constants.js";
import validateChartSpec, { validateQuery } from "./validateChartSpec.js";

/**
 * Validates an AI-generated report spec — the durable contract persisted by
 * generate_report and compiled to blocks at every resolve.
 *
 * On the open engine sections carry raw `{ collection, pipeline }` queries plus
 * a declared presentation contract (the output columns each renderer reads):
 *   { type: kpi,      label, query, valueKey, format?, filterBy? }
 *   { type: chart,    chart, label, query, x, y, filterBy? }
 *   { type: table,    label, query, columns: [{ key, label?, format? }], filterBy? }
 *   { type: filter,   control: select|daterange, field, label, options? }
 *   { type: markdown, content }
 *   { type: download, label, query }
 *
 * There is deliberately NO `tag` flag on table columns — the old derived
 * enum-tag styling was dropped (design decision 2026-07-22); cells render plain
 * text. Number formatting comes from the contract's `format` descriptor
 * (`{ style: decimal|currency, currency?, locale?, decimals? }`), not a
 * dictionary lookup.
 *
 * `catalog` is optional (validate-before-persist only): when present, each
 * query section's pipeline is run through validatePipeline (via validateQuery),
 * and select filters are checked to have an options source. At resolve time it
 * is omitted so a section a viewer can't access becomes a per-section Alert
 * card (the AnalyticsPipeline gate), not a whole-report failure.
 *
 * Returns the normalized spec: sections carry positional ids (s0, s1, …).
 * Throws with an actionable message.
 */

function fail(message) {
  throw new Error(`Invalid report spec: ${message}`);
}

function validateLabel(section, index) {
  const label = section.label;
  if (typeof label !== "string" || label === "") {
    fail(`section ${index} (${section.type}) requires a label.`);
  }
  if (label.length > MAX_LABEL_LENGTH) {
    fail(`section ${index} label exceeds ${MAX_LABEL_LENGTH} characters.`);
  }
  return label;
}

// A presentation-contract number format: inert display data the agent copies
// from the catalog's per-field display hints. Only the shape is validated.
function validateFormat(format, where) {
  if (!format || typeof format !== "object" || Array.isArray(format)) {
    fail(`${where} format must be an object.`);
  }
  if (!FORMAT_STYLES.includes(format.style)) {
    fail(`${where} format.style "${format.style}" is not one of ${FORMAT_STYLES.join(", ")}.`);
  }
  if (format.currency !== undefined && typeof format.currency !== "string") {
    fail(`${where} format.currency must be a string.`);
  }
  if (format.locale !== undefined && typeof format.locale !== "string") {
    fail(`${where} format.locale must be a string.`);
  }
  if (
    format.decimals !== undefined &&
    (!Number.isInteger(format.decimals) || format.decimals < 0 || format.decimals > 20)
  ) {
    fail(`${where} format.decimals must be an integer between 0 and 20.`);
  }
  const out = { style: format.style };
  if (format.currency !== undefined) out.currency = format.currency;
  if (format.locale !== undefined) out.locale = format.locale;
  if (format.decimals !== undefined) out.decimals = format.decimals;
  return out;
}

// A filterable field must be a plausible base-collection field: a non-empty
// string that isn't operator-shaped ('$'-prefixed). The DEEP check — that the
// field actually exists on the base collection — happens at re-query time, when
// the server-built $match runs through validatePipeline.
function isPlausibleField(field) {
  return typeof field === "string" && field !== "" && !field.startsWith("$");
}

// The enum `values` declared for a field anywhere among the given catalog
// collections — a select filter's options fall back to these (design: options
// come from the agent's declared `options` OR the catalog field's values).
export function catalogFieldValues(catalog, field, collections) {
  if (!catalog || typeof catalog !== "object") return null;
  const names = collections && collections.length ? collections : Object.keys(catalog);
  for (const name of names) {
    const values = catalog?.[name]?.fields?.[field]?.values;
    if (Array.isArray(values) && values.length > 0) return values;
  }
  return null;
}

function validateReportSpec({ spec, catalog, roles }) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    fail("spec must be an object.");
  }
  if (typeof spec.title !== "string" || spec.title === "") {
    fail("title is required.");
  }
  if (spec.title.length > MAX_LABEL_LENGTH) {
    fail(`title exceeds ${MAX_LABEL_LENGTH} characters.`);
  }
  if (spec.description !== undefined && typeof spec.description !== "string") {
    fail("description must be a string.");
  }
  if (!Array.isArray(spec.sections) || spec.sections.length === 0) {
    fail("sections must be a non-empty array.");
  }
  if (spec.sections.length > MAX_SECTIONS) {
    fail(`a report allows at most ${MAX_SECTIONS} sections.`);
  }

  // ── First pass: per-section validation ──
  const sections = spec.sections.map((section, index) => {
    if (!section || typeof section !== "object") fail(`section ${index} must be an object.`);
    const id = `s${index}`;

    if (section.type === "kpi") {
      const label = validateLabel(section, index);
      const query = validateQuery(section.query, {
        catalog,
        roles,
        fail: (m) => fail(`section ${index} (kpi) ${m}`),
      });
      if (typeof section.valueKey !== "string" || section.valueKey === "") {
        fail(`section ${index} (kpi) requires a valueKey (the column read from row 0).`);
      }
      if (section.valueKey.length > MAX_LABEL_LENGTH) {
        fail(`section ${index} (kpi) valueKey exceeds ${MAX_LABEL_LENGTH} characters.`);
      }
      const format =
        section.format !== undefined
          ? validateFormat(section.format, `section ${index} (kpi)`)
          : null;
      return {
        id,
        type: "kpi",
        label,
        query,
        valueKey: section.valueKey,
        format,
        filterBy: section.filterBy ?? [],
      };
    }

    if (section.type === "chart") {
      const label = validateLabel(section, index);
      const { chart, query, x, y } = validateChartSpec({
        spec: { chart: section.chart, title: label, query: section.query, x: section.x, y: section.y },
        catalog,
        roles,
      });
      return { id, type: "chart", chart, label, query, x, y, filterBy: section.filterBy ?? [] };
    }

    if (section.type === "table") {
      const label = validateLabel(section, index);
      const query = validateQuery(section.query, {
        catalog,
        roles,
        fail: (m) => fail(`section ${index} (table) ${m}`),
      });
      if (!Array.isArray(section.columns) || section.columns.length === 0) {
        fail(`section ${index} (table) requires a non-empty columns array.`);
      }
      const columns = section.columns.map((col, ci) => {
        if (!col || typeof col !== "object" || Array.isArray(col)) {
          fail(`section ${index} (table) column ${ci} must be an object.`);
        }
        // Strict keys: no `tag` (enum tag styling dropped) or other extras.
        for (const key of Object.keys(col)) {
          if (!["key", "label", "format"].includes(key)) {
            fail(`section ${index} (table) column ${ci} has an unexpected key "${key}" (allowed: key, label, format).`);
          }
        }
        if (typeof col.key !== "string" || col.key === "") {
          fail(`section ${index} (table) column ${ci} requires a key.`);
        }
        if (col.key.length > MAX_LABEL_LENGTH) {
          fail(`section ${index} (table) column ${ci} key exceeds ${MAX_LABEL_LENGTH} characters.`);
        }
        const out = { key: col.key };
        if (col.label !== undefined) {
          if (typeof col.label !== "string" || col.label.length > MAX_LABEL_LENGTH) {
            fail(`section ${index} (table) column ${ci} label must be a string of at most ${MAX_LABEL_LENGTH} characters.`);
          }
          out.label = col.label;
        }
        if (col.format !== undefined) {
          out.format = validateFormat(col.format, `section ${index} (table) column ${ci}`);
        }
        return out;
      });
      return { id, type: "table", label, query, columns, filterBy: section.filterBy ?? [] };
    }

    if (section.type === "filter") {
      const label = validateLabel(section, index);
      if (!FILTER_CONTROLS.includes(section.control)) {
        fail(
          `section ${index} (filter) control "${section.control}" is not one of ` +
            `${FILTER_CONTROLS.join(", ")}.`
        );
      }
      if (!isPlausibleField(section.field)) {
        fail(`section ${index} (filter) requires a field (a non-'$'-prefixed base-collection field name).`);
      }
      if (section.options !== undefined) {
        if (!Array.isArray(section.options) || section.options.length > MAX_FILTER_OPTIONS) {
          fail(
            `section ${index} (filter) options must be an array of at most ` +
              `${MAX_FILTER_OPTIONS} values.`
          );
        }
        for (const option of section.options) {
          if (typeof option !== "string" && typeof option !== "number") {
            fail(`section ${index} (filter) options must be strings or numbers.`);
          }
        }
      }
      return {
        id,
        type: "filter",
        control: section.control,
        field: section.field,
        label,
        options: section.options,
      };
    }

    if (section.type === "markdown") {
      if (typeof section.content !== "string" || section.content === "") {
        fail(`section ${index} (markdown) requires content.`);
      }
      if (section.content.length > MAX_MARKDOWN_LENGTH) {
        fail(`section ${index} (markdown) content exceeds ${MAX_MARKDOWN_LENGTH} characters.`);
      }
      return { id, type: "markdown", content: section.content };
    }

    if (section.type === "download") {
      const label = validateLabel(section, index);
      const query = validateQuery(section.query, {
        catalog,
        roles,
        fail: (m) => fail(`section ${index} (download) ${m}`),
      });
      return { id, type: "download", label, query };
    }

    fail(
      `section ${index} type "${section.type}" is not one of kpi, chart, table, filter, ` +
        `markdown, download.`
    );
  });

  // ── Second pass: filter bindings ──
  const filterSections = sections.filter((s) => s.type === "filter");
  const filterFields = new Set(filterSections.map((s) => s.field));
  if (filterFields.size < filterSections.length) {
    fail("filter sections must have distinct fields.");
  }

  for (const section of sections) {
    if (!Array.isArray(section.filterBy ?? [])) {
      fail(`section ${section.id} filterBy must be an array of filter fields.`);
    }
    for (const field of section.filterBy ?? []) {
      if (!isPlausibleField(field)) {
        fail(`section ${section.id} filterBy must list non-'$'-prefixed field names.`);
      }
      if (!filterFields.has(field)) {
        fail(
          `section ${section.id} filterBy references "${field}" but the report has no filter ` +
            `section with that field.`
        );
      }
    }
  }

  // A filter must be bound by at least one section, and — when validating
  // before persist (catalog present) — a select filter must have an options
  // source (declared `options`, or enum `values` on the field in one of its
  // bound sections' collections). Options are RESOLVED at compile time, not
  // here (the raw spec is what persists).
  for (const filter of filterSections) {
    const boundSections = sections.filter((s) => (s.filterBy ?? []).includes(filter.field));
    if (boundSections.length === 0) {
      fail(`filter "${filter.field}" is not bound by any section (add filterBy to a section).`);
    }
    if (catalog && filter.control === "select" && filter.options === undefined) {
      const collections = boundSections.map((s) => s.query?.collection).filter(Boolean);
      if (!catalogFieldValues(catalog, filter.field, collections)) {
        fail(
          `filter "${filter.field}" has no options: pass options on the filter section or declare ` +
            `enum values for the field in the catalog.`
        );
      }
    }
  }

  return {
    title: spec.title,
    description: spec.description,
    sections,
  };
}

export default validateReportSpec;
