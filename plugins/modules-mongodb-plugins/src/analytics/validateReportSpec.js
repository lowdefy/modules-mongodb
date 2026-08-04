import {
  CHART_TYPES,
  FILTER_CONTROLS,
  FILTER_MATCH_MODES,
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
 *   { type: filter,   control: select|multiselect|daterange, field, label, options?, match?, optionsQuery? }
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
 * Returns the normalized spec. A section's `id` is preserved when supplied and
 * derived from its position (s0, s1, …) otherwise, and ids are unique across the
 * report — they are durable identities, not positions, because remove_report_section
 * addresses a section by id and compileReport uses it as a block id and a
 * page-state path.
 *
 * This function is IDEMPOTENT: validating its own output returns that output.
 * The reports store persists the return value rather than the writer's input, so
 * every read re-validates it — an absent optional is therefore an ABSENT KEY in
 * the output, never null or undefined, and a null READS as absent everywhere an
 * optional is read. Breaking either half bricks every stored report that omitted
 * the field, on next open rather than at write time.
 *
 * Throws with an actionable message.
 */

function fail(message) {
  throw new Error(`Invalid report spec: ${message}`);
}

// An optional is absent whether it arrived as undefined or as null. A stored
// spec reaches this function through MongoDB, which turns an undefined into a
// null (the driver's ignoreUndefined default is false and nothing in this repo
// sets it), so treating only undefined as absent would make this function's own
// output invalid input to itself.
const absent = (value) => value === undefined || value === null;

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

// A section's id is durable: compileReport uses it as the block id, the request
// id (`query_${id}`), the download id and the page-state path
// (`sections.${id}.rows`), so a stored spec must keep the id it was saved with.
// This function cannot tell a stored id from one the model invented —
// generate_report's payload schema constrains a section only to { type } — so a
// supplied id is checked rather than trusted, and rejected rather than silently
// re-derived: a rejected tool call carries a message the model can act on, where
// a stored spec whose ids changed under it is the exact bug durable ids remove.
function resolveSectionId(section, index) {
  if (absent(section.id)) return `s${index}`;
  if (typeof section.id !== "string" || section.id === "") {
    fail(`section ${index} id must be a non-empty string.`);
  }
  if (section.id.length > MAX_LABEL_LENGTH) {
    fail(`section ${index} id exceeds ${MAX_LABEL_LENGTH} characters.`);
  }
  // A '.' forks the page-state path so the section reads rows nothing writes;
  // '$' is excluded for the same reason every other field name here is.
  if (section.id.includes(".") || section.id.includes("$")) {
    fail(`section ${index} id must not contain "." or "$".`);
  }
  return section.id;
}

// A presentation-contract number format: inert display data the agent copies
// from the catalog's per-field display hints. Only the shape is validated.
function validateFormat(format, where) {
  if (!format || typeof format !== "object" || Array.isArray(format)) {
    fail(`${where} format must be an object.`);
  }
  if (!FORMAT_STYLES.includes(format.style)) {
    fail(
      `${where} format.style "${format.style}" is not one of ${FORMAT_STYLES.join(", ")}.`,
    );
  }
  if (!absent(format.currency) && typeof format.currency !== "string") {
    fail(`${where} format.currency must be a string.`);
  }
  if (!absent(format.locale) && typeof format.locale !== "string") {
    fail(`${where} format.locale must be a string.`);
  }
  if (
    !absent(format.decimals) &&
    (!Number.isInteger(format.decimals) ||
      format.decimals < 0 ||
      format.decimals > 20)
  ) {
    fail(`${where} format.decimals must be an integer between 0 and 20.`);
  }
  const out = { style: format.style };
  if (!absent(format.currency)) out.currency = format.currency;
  if (!absent(format.locale)) out.locale = format.locale;
  if (!absent(format.decimals)) out.decimals = format.decimals;
  return out;
}

// A filterable field must be a plausible base-collection field: a non-empty
// string that isn't operator-shaped ('$'-prefixed). The DEEP check — that the
// field actually exists on the base collection — happens at re-query time, when
// the server-built $match runs through validatePipeline.
function isPlausibleField(field) {
  return typeof field === "string" && field !== "" && !field.startsWith("$");
}

// Whether `roles` satisfies a catalog entry's role gate. Same rule
// validatePipeline's checkCollectionAccess applies: an absent or empty `roles`
// list means any authenticated user may query the collection (role-gating is
// opt-in), otherwise the viewer must hold one of the listed roles.
function readableCollection(catalog, name, roles) {
  const required = catalog?.[name]?.roles ?? [];
  if (required.length === 0) return true;
  const held = Array.isArray(roles) ? roles : [];
  return required.some((role) => held.includes(role));
}

// The enum `values` declared for a field anywhere among the given catalog
// collections — a select/multiselect filter's options fall back to these
// (design: options come from the agent's declared `options`, an optionsQuery,
// OR the catalog field's values).
//
// Role-gated: a collection the viewer may not query contributes nothing. The
// catalog is the confidentiality boundary, and a field's enum `values` are
// contents of the collection that declares them — serving them to a viewer who
// cannot query that collection would route around the same gate validatePipeline
// enforces on the pipeline itself. It matters most on the path where an
// optionsQuery was DENIED and compileReport falls back here: without this, being
// refused the query is what hands the viewer the cataloged values.
//
// `roles` is required rather than optional-with-a-default: an omitted argument
// would silently mean "no roles held", which fails closed but looks like a
// missing options source rather than a denial. Callers pass the viewer's roles.
export function catalogFieldValues(catalog, field, collections, roles) {
  if (!catalog || typeof catalog !== "object") return null;
  const names =
    collections && collections.length ? collections : Object.keys(catalog);
  for (const name of names) {
    if (!readableCollection(catalog, name, roles)) continue;
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
  if (!absent(spec.description) && typeof spec.description !== "string") {
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
    if (!section || typeof section !== "object")
      fail(`section ${index} must be an object.`);
    const id = resolveSectionId(section, index);

    if (section.type === "kpi") {
      const label = validateLabel(section, index);
      const query = validateQuery(section.query, {
        catalog,
        roles,
        fail: (m) => fail(`section ${index} (kpi) ${m}`),
      });
      if (typeof section.valueKey !== "string" || section.valueKey === "") {
        fail(
          `section ${index} (kpi) requires a valueKey (the column read from row 0).`,
        );
      }
      if (section.valueKey.length > MAX_LABEL_LENGTH) {
        fail(
          `section ${index} (kpi) valueKey exceeds ${MAX_LABEL_LENGTH} characters.`,
        );
      }
      const out = {
        id,
        type: "kpi",
        label,
        query,
        valueKey: section.valueKey,
        filterBy: section.filterBy ?? [],
      };
      if (!absent(section.format)) {
        out.format = validateFormat(section.format, `section ${index} (kpi)`);
      }
      return out;
    }

    if (section.type === "chart") {
      const label = validateLabel(section, index);
      const { chart, query, x, y } = validateChartSpec({
        spec: {
          chart: section.chart,
          title: label,
          query: section.query,
          x: section.x,
          y: section.y,
        },
        catalog,
        roles,
      });
      return {
        id,
        type: "chart",
        chart,
        label,
        query,
        x,
        y,
        filterBy: section.filterBy ?? [],
      };
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
            fail(
              `section ${index} (table) column ${ci} has an unexpected key "${key}" (allowed: key, label, format).`,
            );
          }
        }
        if (typeof col.key !== "string" || col.key === "") {
          fail(`section ${index} (table) column ${ci} requires a key.`);
        }
        if (col.key.length > MAX_LABEL_LENGTH) {
          fail(
            `section ${index} (table) column ${ci} key exceeds ${MAX_LABEL_LENGTH} characters.`,
          );
        }
        const out = { key: col.key };
        if (!absent(col.label)) {
          if (
            typeof col.label !== "string" ||
            col.label.length > MAX_LABEL_LENGTH
          ) {
            fail(
              `section ${index} (table) column ${ci} label must be a string of at most ${MAX_LABEL_LENGTH} characters.`,
            );
          }
          out.label = col.label;
        }
        if (!absent(col.format)) {
          out.format = validateFormat(
            col.format,
            `section ${index} (table) column ${ci}`,
          );
        }
        return out;
      });
      return {
        id,
        type: "table",
        label,
        query,
        columns,
        filterBy: section.filterBy ?? [],
      };
    }

    if (section.type === "filter") {
      const label = validateLabel(section, index);

      // Strict keys: an allowed-key list catches misspellings (`optionsquery`)
      // and stray keys that would otherwise be silently dropped. `id` is on the
      // list because a normalized section must be re-validatable — the store
      // holds this function's output, so every read feeds a section that already
      // carries one. It is READ, not ignored: resolveSectionId preserves and
      // checks it, deriving `s${index}` only when it is absent.
      for (const key of Object.keys(section)) {
        if (
          ![
            "id",
            "type",
            "label",
            "control",
            "field",
            "options",
            "match",
            "optionsQuery",
          ].includes(key)
        ) {
          fail(
            `section ${index} (filter) has an unexpected key "${key}" (allowed: type, label, control, field, options, match, optionsQuery).`,
          );
        }
      }

      if (!FILTER_CONTROLS.includes(section.control)) {
        fail(
          `section ${index} (filter) control "${section.control}" is not one of ` +
            `${FILTER_CONTROLS.join(", ")}.`,
        );
      }
      if (!isPlausibleField(section.field)) {
        fail(
          `section ${index} (filter) requires a field (a non-'$'-prefixed base-collection field name).`,
        );
      }
      if (!absent(section.options)) {
        if (
          !Array.isArray(section.options) ||
          section.options.length > MAX_FILTER_OPTIONS
        ) {
          fail(
            `section ${index} (filter) options must be an array of at most ` +
              `${MAX_FILTER_OPTIONS} values.`,
          );
        }
        for (const option of section.options) {
          if (typeof option !== "string" && typeof option !== "number") {
            fail(
              `section ${index} (filter) options must be strings or numbers.`,
            );
          }
        }
      }

      // An options source only means something on a control that shows a list.
      // A daterange carrying `options` or `optionsQuery` is a misunderstanding,
      // and neither key is inert: compileReport's daterange branch reads no
      // options at all, and querySections would still run the optionsQuery on
      // every report open, spending a query per open on rows nothing reads.
      if (
        !["select", "multiselect"].includes(section.control) &&
        (!absent(section.options) || !absent(section.optionsQuery))
      ) {
        fail(
          `section ${index} (filter) options and optionsQuery are only valid on a select or multiselect control.`,
        );
      }

      // `match` selects the in ($in)/all ($all) filter-triple op and only
      // makes sense on a multiselect control (whose state value is an array).
      // Deliberately NOT checked against the catalog's `type: array` — catalog
      // types are prompt material, never enforcement (see design notes).
      let match;
      if (section.control === "multiselect") {
        match = section.match ?? "any";
        if (!FILTER_MATCH_MODES.includes(match)) {
          fail(
            `section ${index} (filter) match "${match}" is not one of ${FILTER_MATCH_MODES.join(", ")}.`,
          );
        }
      } else if (!absent(section.match)) {
        fail(
          `section ${index} (filter) match is only valid on a multiselect control.`,
        );
      }

      if (!absent(section.options) && !absent(section.optionsQuery)) {
        fail(
          `section ${index} (filter) declares both options and optionsQuery — pick one source, they are not merged.`,
        );
      }

      // optionsQuery rows become { label, value } options at compile time.
      // Validate the query half like any other query-backed section, then
      // re-attach valueKey/labelKey — validateQuery only returns
      // { collection, pipeline }, so dropping them here would silently lose
      // the presentation contract and yield a dropdown of blank options.
      let optionsQuery;
      if (!absent(section.optionsQuery)) {
        const query = validateQuery(section.optionsQuery, {
          catalog,
          roles,
          fail: (m) => fail(`section ${index} (filter) optionsQuery ${m}`),
        });
        if (
          typeof section.optionsQuery.valueKey !== "string" ||
          section.optionsQuery.valueKey === ""
        ) {
          fail(`section ${index} (filter) optionsQuery requires a valueKey.`);
        }
        if (section.optionsQuery.valueKey.length > MAX_LABEL_LENGTH) {
          fail(
            `section ${index} (filter) optionsQuery valueKey exceeds ${MAX_LABEL_LENGTH} characters.`,
          );
        }
        if (
          typeof section.optionsQuery.labelKey !== "string" ||
          section.optionsQuery.labelKey === ""
        ) {
          fail(`section ${index} (filter) optionsQuery requires a labelKey.`);
        }
        if (section.optionsQuery.labelKey.length > MAX_LABEL_LENGTH) {
          fail(
            `section ${index} (filter) optionsQuery labelKey exceeds ${MAX_LABEL_LENGTH} characters.`,
          );
        }
        optionsQuery = {
          ...query,
          valueKey: section.optionsQuery.valueKey,
          labelKey: section.optionsQuery.labelKey,
        };
      }

      const out = {
        id,
        type: "filter",
        control: section.control,
        field: section.field,
        label,
      };
      if (!absent(section.options)) out.options = section.options;
      // `match` is set on every multiselect — it is defaulted to "any" above,
      // and that default is a create-time input that freezes in the document
      // rather than a read-time fallback. On any other control it is never set.
      if (!absent(match)) out.match = match;
      if (!absent(optionsQuery)) out.optionsQuery = optionsQuery;
      return out;
    }

    if (section.type === "markdown") {
      if (typeof section.content !== "string" || section.content === "") {
        fail(`section ${index} (markdown) requires content.`);
      }
      if (section.content.length > MAX_MARKDOWN_LENGTH) {
        fail(
          `section ${index} (markdown) content exceeds ${MAX_MARKDOWN_LENGTH} characters.`,
        );
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
        `markdown, download.`,
    );
  });

  // Checked over the RESOLVED ids rather than the supplied ones: a supplied "s1"
  // on section 0 collides with the derived "s1" on section 1, and that collision
  // is exactly what the rule exists to prevent. Two sections sharing an id
  // collide in compileReport's rows Map, so both render the same rows — wrong
  // numbers, not a rendering glitch.
  const ids = new Set();
  for (const section of sections) {
    if (ids.has(section.id)) {
      fail(
        `section ids must be unique across the report — "${section.id}" is used more than once.`,
      );
    }
    ids.add(section.id);
  }

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
        fail(
          `section ${section.id} filterBy must list non-'$'-prefixed field names.`,
        );
      }
      if (!filterFields.has(field)) {
        fail(
          `section ${section.id} filterBy references "${field}" but the report has no filter ` +
            `section with that field.`,
        );
      }
    }
  }

  // A filter must be bound by at least one section, and — when validating
  // before persist (catalog present) — a select/multiselect filter must have
  // an options source (declared `options`, `optionsQuery`, or enum `values`
  // on the field in one of its bound sections' collections). Options are
  // RESOLVED at compile time, not here (the raw spec is what persists).
  for (const filter of filterSections) {
    const boundSections = sections.filter((s) =>
      (s.filterBy ?? []).includes(filter.field),
    );
    if (boundSections.length === 0) {
      fail(
        `filter "${filter.field}" is not bound by any section (add filterBy to a section).`,
      );
    }
    if (
      catalog &&
      ["select", "multiselect"].includes(filter.control) &&
      absent(filter.options) &&
      absent(filter.optionsQuery)
    ) {
      const collections = boundSections
        .map((s) => s.query?.collection)
        .filter(Boolean);
      if (!catalogFieldValues(catalog, filter.field, collections, roles)) {
        fail(
          `filter "${filter.field}" has no options: pass options on the filter section, declare ` +
            `optionsQuery, or declare enum values for the field in the catalog.`,
        );
      }
    }
  }

  const out = { title: spec.title };
  if (!absent(spec.description)) out.description = spec.description;
  out.sections = sections;
  return out;
}

export default validateReportSpec;
