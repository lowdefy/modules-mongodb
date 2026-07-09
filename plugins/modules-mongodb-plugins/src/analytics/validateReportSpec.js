import {
  CHART_TYPES,
  FILTER_CONTROLS,
  MAX_FILTER_OPTIONS,
  MAX_LABEL_LENGTH,
  MAX_MARKDOWN_LENGTH,
  MAX_SECTIONS,
} from "./constants.js";
import validateQuerySpec from "./validateQuerySpec.js";
import validateChartSpec from "./validateChartSpec.js";

/**
 * Validates an AI-generated report spec — the durable contract persisted by
 * generate_report and compiled to blocks at every resolve. Validation runs at
 * both ends (before persistence, and again at compile time) so a saved report
 * is re-checked against the current data dictionary on every open.
 *
 * Report spec shape:
 *   { title, description?, sections: [
 *       { type: kpi,      label, query, filterBy? }
 *       { type: chart,    chart, label, query, filterBy? }
 *       { type: table,    label, query, filterBy? }
 *       { type: filter,   control: select|daterange, field, label, options? }
 *       { type: markdown, content }
 *       { type: download, label, query }
 *   ] }
 *
 * Returns the normalized spec: sections carry positional ids (s0, s1, …),
 * query sections carry the normalized select/measure keys, and filter
 * sections carry resolved options. Throws with an actionable message.
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

function validateReportSpec({ spec, datasets, roles }) {
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
      const { measures } = validateQuerySpec({ spec: section.query, datasets, roles });
      if (measures.length < 1) {
        fail(`section ${index} (kpi) query must request at least one measure.`);
      }
      return {
        id,
        type: "kpi",
        label,
        query: section.query,
        valueKey: measures[0].key,
        valueType: measures[0].type,
        valueFormat: measures[0].format ?? null,
        valueCurrency: measures[0].currency ?? null,
        valueLocale: measures[0].locale ?? null,
        filterBy: section.filterBy ?? [],
      };
    }

    if (section.type === "chart") {
      const label = validateLabel(section, index);
      const { chart, select, measures } = validateChartSpec({
        spec: { chart: section.chart, title: label, query: section.query },
        datasets,
        roles,
      });
      return {
        id,
        type: "chart",
        chart,
        label,
        query: section.query,
        select,
        measures,
        filterBy: section.filterBy ?? [],
      };
    }

    if (section.type === "table") {
      const label = validateLabel(section, index);
      const { select, measures } = validateQuerySpec({ spec: section.query, datasets, roles });
      const dataset = datasets.find((d) => d?.id === section.query?.dataset);
      const dimensionsById = new Map((dataset?.dimensions ?? []).map((d) => [d.id, d]));
      // Column descriptors drive rendering: enum dimensions (those declaring
      // `values`) render as tags; measures render right-aligned and formatted.
      const columns = [
        ...select.map((dimId) => ({
          key: dimId,
          tag: (dimensionsById.get(dimId)?.values?.length ?? 0) > 0,
        })),
        ...measures.map((m) => ({
          key: m.key,
          measure: true,
          type: m.type,
          format: m.format ?? null,
          currency: m.currency ?? null,
          locale: m.locale ?? null,
        })),
      ];
      return {
        id,
        type: "table",
        label,
        query: section.query,
        columns,
        filterBy: section.filterBy ?? [],
      };
    }

    if (section.type === "filter") {
      const label = validateLabel(section, index);
      if (!FILTER_CONTROLS.includes(section.control)) {
        fail(
          `section ${index} (filter) control "${section.control}" is not one of ` +
            `${FILTER_CONTROLS.join(", ")}.`
        );
      }
      if (typeof section.field !== "string" || section.field === "") {
        fail(`section ${index} (filter) requires a field.`);
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
      validateQuerySpec({ spec: section.query, datasets, roles });
      return { id, type: "download", label, query: section.query };
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
      if (!filterFields.has(field)) {
        fail(
          `section ${section.id} filterBy references "${field}" but the report has no filter ` +
            `section with that field.`
        );
      }
      // The bound field must be a dimension on the section's own dataset —
      // the compiled CallAPI injects it as a filter into the section's query.
      const dataset = datasets.find((d) => d?.id === section.query?.dataset);
      const dimension = (dataset?.dimensions ?? []).find((d) => d.id === field);
      if (!dimension) {
        fail(
          `section ${section.id} filterBy "${field}" is not a dimension of dataset ` +
            `"${section.query?.dataset}".`
        );
      }
    }
  }

  // Resolve filter control metadata against the dictionary.
  for (const filter of filterSections) {
    const boundSections = sections.filter((s) => (s.filterBy ?? []).includes(filter.field));
    if (boundSections.length === 0) {
      fail(`filter "${filter.field}" is not bound by any section (add filterBy to a section).`);
    }
    const dimension = datasets
      .flatMap((d) => d?.dimensions ?? [])
      .find((dim) => dim.id === filter.field);
    if (filter.control === "daterange" && dimension?.type !== "date") {
      fail(`filter "${filter.field}" uses a daterange control but the dimension is not a date.`);
    }
    if (filter.control === "select" && filter.options === undefined) {
      if (!Array.isArray(dimension?.values) || dimension.values.length === 0) {
        fail(
          `filter "${filter.field}" has no options: pass options on the section or declare ` +
            `values on the dimension in the data dictionary.`
        );
      }
      filter.options = dimension.values.slice(0, MAX_FILTER_OPTIONS);
    }
  }

  return {
    title: spec.title,
    description: spec.description,
    sections,
  };
}

export default validateReportSpec;
