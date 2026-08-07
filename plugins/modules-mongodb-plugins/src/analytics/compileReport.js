import {
  MAX_FILTER_OPTIONS,
  MAX_QUERY_FILTER_OPTIONS,
  PIPELINE_RESULT_CAP,
  REPORT_CURRENCY,
  REPORT_DECIMALS,
  REPORT_LOCALE,
} from "./constants.js";
import buildEChartsOption from "./buildEChartsOption.js";
import { orderedQueries } from "./querySections.js";
import validateReportSpec, {
  catalogFieldValues,
} from "./validateReportSpec.js";
import {
  verifyChartContract,
  verifyFilterOptionsContract,
  verifyKpiContract,
  verifyTableContract,
} from "./verifyContract.js";

/**
 * Compiles a validated report spec plus resolve-time query results into
 * Lowdefy blocks — the trusted server-side half of "the AI supplies a spec, the
 * server compiles". Runs inside the resolve-report endpoint behind the Dynamic
 * block, consuming the declared presentation contract (valueKey / x,y /
 * columns + per-column format) rather than any derived query structure.
 *
 * Params:
 *   spec       — the stored report spec (re-validated here, inert-only).
 *   results    — per-query-section results, aligned with querySections():
 *                array (a :for step result) whose entries are row arrays; a
 *                missing/null entry marks a failed section (its AnalyticsPipeline
 *                ran inside :try), rendered as an Alert card while the rest of
 *                the report renders normally.
 *   catalog    — the collections catalog, used ONLY to resolve select-filter
 *                options from a field's enum `values` (a display convenience —
 *                NOT the security gate, which is the per-section AnalyticsPipeline).
 *   roles      — the viewing user's roles, forwarded to validateReportSpec.
 *                Inert here by design: this call deliberately passes no
 *                catalog (see below), and roles only take effect alongside
 *                one. Kept so the pair travels together — querySections does
 *                pass both.
 *   endpointId — the scoped query-data endpoint id CallAPI targets for filter
 *                re-queries and downloads (the module passes _module.endpointId).
 *
 * The contract is verified against the actual rows per section: a missing
 * column key or a non-numeric y/KPI value renders that one section as an Alert
 * card (a graceful rendering failure). Verification skips empty results and
 * tolerates null value cells.
 *
 * Deferred client operators: compiled output carries `__state`, `__api` and
 * `__if_none` (double underscore) — the Dynamic block's server resolution
 * leaves them untouched and the client unescapes them to live operators.
 *
 * The compiler never emits `_secret` and never evaluates AI-provided strings as
 * operators — the spec is data.
 */

function fail(message) {
  throw new Error(`compileReport: ${message}`);
}

// Filter control block ids double as their page-state keys.
function filterStateKey(field) {
  return `filter_${field}`;
}

function safeFilename(label) {
  const slug = String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "export"}.csv`;
}

// Formats a change-stamp / resolve timestamp for the provenance line. These are
// compiled into a plain-config block, so a runtime _dayjs never runs — the date
// is rendered here at compile time. en-GB gives the module's day-first
// `D MMMM YYYY` order ("5 August 2026"); `withTime` adds the clock for the
// resolve moment, where freshness is the point. Non-date/unparseable in yields
// an empty string so the caller drops the fact rather than printing "Invalid Date".
function formatTimestamp(value, { withTime = false } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = { day: "numeric", month: "long", year: "numeric" };
  if (withTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

// A per-section CSV export: the same CallAPI → DownloadCsv wiring a download
// section uses, re-querying `endpointId` for the section's own rows so the file
// is the full result set, not the (capped) on-screen rows. Only chart/table
// sections get one — a KPI is a single number with nothing to export.
function sectionDownload(section, endpointId) {
  return {
    id: `${section.id}_download`,
    type: "Button",
    layout: { span: 24 },
    properties: {
      title: "Export CSV",
      icon: "AiOutlineDownload",
      type: "link",
      size: "small",
    },
    events: {
      onClick: [
        {
          id: `query_${section.id}`,
          type: "CallAPI",
          params: { endpointId, payload: { query: section.query } },
        },
        {
          id: `download_${section.id}`,
          type: "DownloadCsv",
          params: {
            data: { __api: `${endpointId}.response` },
            filename: safeFilename(section.label),
          },
        },
      ],
    },
  };
}

// The extra filters a bound section's re-query carries: each bound filter
// contributes constraints whose values read live page state (deferred __state).
// AnalyticsPipeline drops null-valued triples, so an untouched control means
// "no constraint".
function boundFilters(section, filterSectionsByField) {
  const extra = [];
  for (const field of section.filterBy ?? []) {
    const filter = filterSectionsByField.get(field);
    const key = filterStateKey(field);
    if (filter.control === "daterange") {
      extra.push(
        { field, op: "gte", value: { __state: `${key}.0` } },
        { field, op: "lte", value: { __state: `${key}.1` } },
      );
    } else if (filter.control === "multiselect") {
      // The spec's `match` is the author's intent, the triple's `op` is the
      // query it compiles to: AnalyticsPipeline's FILTER_OPS maps in → $in
      // (any of the selected values) and all → $all (every one of them).
      // Defaulted to "any" by validateReportSpec, so the fallback here only
      // covers a section that never went through it.
      extra.push({
        field,
        op: filter.match === "all" ? "all" : "in",
        value: { __state: key },
      });
    } else {
      // select — the remaining control (FILTER_CONTROLS is closed at three).
      extra.push({ field, op: "eq", value: { __state: key } });
    }
  }
  return extra;
}

// One CallAPI + SetState pair per section bound to a filter. Action lists run
// sequentially, so each SetState reads its own CallAPI's response before the
// next call replaces it (_api is keyed by endpointId). The server builds the
// $match from the triples and prepends it to the section's pipeline.
function requeryActions({ boundSections, filterSectionsByField, endpointId }) {
  const actions = [];
  for (const section of boundSections) {
    actions.push({
      id: `query_${section.id}`,
      type: "CallAPI",
      params: {
        endpointId,
        payload: {
          query: section.query,
          filters: boundFilters(section, filterSectionsByField),
        },
      },
    });
    actions.push({
      id: `set_${section.id}`,
      type: "SetState",
      params: {
        [`sections.${section.id}.rows`]: { __api: `${endpointId}.response` },
      },
    });
  }
  return actions;
}

// Data binding for a section: live state once its filters have fired, the
// inlined resolve-time rows before that. Unfiltered sections inline directly.
function dataBinding(section, rows) {
  if ((section.filterBy ?? []).length === 0) {
    return rows;
  }
  return { __if_none: [{ __state: `sections.${section.id}.rows` }, rows] };
}

// How a contract `format` descriptor ({ style, currency?, locale?, decimals? })
// displays: currency renders with a symbol and the declared (default 2)
// decimals, everything else as a grouped decimal. The REPORT_* defaults fill
// any field the descriptor omits; a null format is a plain grouped decimal.
function numberDisplay(format) {
  const locale = format?.locale || REPORT_LOCALE;
  const decimals = Number.isInteger(format?.decimals)
    ? format.decimals
    : REPORT_DECIMALS;
  if (format?.style === "currency") {
    return {
      style: "currency",
      decimals,
      currency: format.currency || REPORT_CURRENCY,
      locale,
    };
  }
  return { style: "decimal", decimals, locale };
}

// Intl.NumberFormat options for a display descriptor.
function numberFormatOptions(display) {
  const base = {
    minimumFractionDigits: display.decimals,
    maximumFractionDigits: display.decimals,
  };
  return display.style === "currency"
    ? { style: "currency", currency: display.currency, ...base }
    : { style: "decimal", ...base };
}

// The grouping/decimal separators and currency symbol a locale actually uses,
// resolved at compile time (Node ships full ICU). Lets the KPI Statistic format
// its live numeric value natively while matching the table's runtime _intl
// output — e.g. en-ZA yields "R", a space group and a comma decimal.
function intlSeparators(display) {
  const parts = new Intl.NumberFormat(
    display.locale,
    numberFormatOptions(display),
  ).formatToParts(11111.11);
  const find = (type) => parts.find((p) => p.type === type)?.value;
  return {
    symbol: find("currency") ?? "",
    group: find("group") ?? ",",
    decimal: find("decimal") ?? ".",
  };
}

// Runtime value formatter for a numeric table cell. Deferred through the Dynamic
// block, so operators inside the cell's `_function` are triple-escaped (`___`):
// one level for the Dynamic-block unescape, one for the function body.
function numericCellRenderer(display) {
  return {
    __function: {
      "___intl.numberFormat": {
        on: { ___args: "0.value" },
        options: numberFormatOptions(display),
        locale: display.locale,
      },
    },
  };
}

// Whether a column holds numbers, judged from the resolve-time rows — the same
// rows verifyContract inspects. Used to right-align columns the agent did not
// give a `format`: a count sitting flush-left beside right-aligned money reads
// as a different kind of value than it is.
//
// Conservative on purpose. Null and undefined cells are skipped (a missing
// group key is normal output), but one non-numeric value disqualifies the
// column, and a column with no rows or only empty cells yields no evidence and
// is left alone rather than guessed at.
function isNumericColumn(key, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  let sawNumber = false;
  for (const row of rows) {
    const value = row?.[key];
    if (value === null || value === undefined) continue;
    if (typeof value !== "number") return false;
    sawNumber = true;
  }
  return sawNumber;
}

// A table column: a column carrying a `format` descriptor is numeric — it
// right-aligns and formats via _intl; a column without one renders plain text
// (enum tag styling was deliberately dropped). `label` becomes the header.
//
// Alignment goes through the block's own `cell` config rather than ag-grid's
// `type: "numericColumn"`. The Lowdefy AgGrid block renders every cell as a
// FLEX container, so numericColumn's `text-align: right` moves nothing — it
// right-aligns the header only, leaving each header and its values on opposite
// edges of the column. `cell.align` is what the block turns into
// `cellStyle.justifyContent`, which does move the content.
//
// `cell` carries no `type`: processColDefs substitutes its own renderer only
// when `cell.type` is a string, so leaving it out keeps the _intl renderer
// below.
function tableColumnDef(column, rows) {
  const def = { field: column.key };
  if (column.label !== undefined) def.headerName = column.label;
  if (column.format) {
    def.cell = { align: "right" };
    def.cellRenderer = numericCellRenderer(numberDisplay(column.format));
  } else if (isNumericColumn(column.key, rows)) {
    // Numeric but unformatted: align it, but render the raw value — inventing a
    // format here would impose decimals and grouping the agent did not ask for.
    def.cell = { align: "right" };
  }
  return def;
}

// Why a filter's optionsQuery produced no usable options list, or undefined if
// it did. The three outcomes get three descriptions: one message covering all
// of them would misdescribe two.
function optionsQueryFailure({ valueKey, labelKey }, rows) {
  if (!Array.isArray(rows)) {
    // A null/missing results entry: the options query failed validation or was
    // denied by the viewer's roles inside the resolver's :try. That :catch only
    // logs, so no error text reaches here — say what is known rather than
    // fabricating the gate's message.
    return (
      "The options for this filter failed to load — the options query may " +
      "reference data no longer available."
    );
  }
  try {
    verifyFilterOptionsContract({ valueKey, labelKey, rows });
  } catch (error) {
    return error.message;
  }
  // Zero rows is a legitimate outcome for a section's RESULT rows, but not for
  // an options list: a control the user cannot operate is a failure, not
  // information.
  if (rows.length === 0) return "No options available.";
  return undefined;
}

// Caps a list and reports whether it was cut, along with the cap that cut it.
// Every options source goes through this: a dropdown silently missing the value
// someone is looking for is indistinguishable from that value not existing, and
// that is as true of a 60-value catalog enum as of a 600-row options query.
// The two caps differ because the sources do (see constants.js).
function capped(values, cap) {
  return {
    options: values.slice(0, cap),
    truncated: values.length > cap,
    cap,
  };
}

// A select/multiselect filter's options, in precedence order: the agent's
// declared `options`, else an `optionsQuery`'s rows as { label, value } pairs,
// else the enum `values` cataloged for the field in one of its bound sections'
// collections.
//
// Returns { options, truncated, cap } for a usable list, or { failure } when an
// optionsQuery produced none and no catalog values back it up — the caller
// renders that as an Alert in the filter row.
function filterOptions({ filter, sections, catalog, roles, rows }) {
  if (filter.options !== undefined) {
    return capped(filter.options, MAX_FILTER_OPTIONS);
  }

  const catalogOptions = () => {
    const boundSections = sections.filter((s) =>
      (s.filterBy ?? []).includes(filter.field),
    );
    const collections = boundSections
      .map((s) => s.query?.collection)
      .filter(Boolean);
    // Role-gated inside catalogFieldValues: a viewer who may not query the
    // collection gets nothing from it, which is what keeps the failure branch
    // below from turning a role denial into a source of cataloged values.
    return catalogFieldValues(catalog, filter.field, collections, roles);
  };

  if (filter.optionsQuery) {
    const failure = optionsQueryFailure(filter.optionsQuery, rows);
    if (failure) {
      // The catalog stays the fallback whenever a query fails to produce a
      // usable list — a stale-but-operable control beats an Alert.
      const values = catalogOptions();
      if (values) return capped(values, MAX_FILTER_OPTIONS);
      return { failure };
    }
    const { valueKey, labelKey } = filter.optionsQuery;
    const list = capped(rows, MAX_QUERY_FILTER_OPTIONS);
    return {
      ...list,
      options: list.options.map((row) => ({
        label: row[labelKey],
        value: row[valueKey],
      })),
    };
  }

  // No query: the catalog's values, or the empty list a filter with neither
  // source has always rendered (validateReportSpec rejects that combination at
  // save time, where the catalog is present).
  return capped(catalogOptions() ?? [], MAX_FILTER_OPTIONS);
}

// EChart and AgGridBalham have no `title` property (their schemas set
// additionalProperties: false), so a section's label renders as a preceding
// Title block — the same pattern the chat results panel uses for charts.
function sectionHeading(section, rows) {
  // The engine appends a trailing $limit, so a section whose result lands
  // exactly on the cap was probably truncated. Say so in the heading: a table
  // silently showing its first 1000 rows reads as the complete answer, and a
  // reader has no way to tell the difference.
  const capped = Array.isArray(rows) && rows.length >= PIPELINE_RESULT_CAP;
  const content = capped
    ? `${section.label} — first ${PIPELINE_RESULT_CAP} rows`
    : section.label;
  return {
    id: `${section.id}_heading`,
    type: "Title",
    layout: { span: 24 },
    properties: { content, level: 5 },
  };
}

function failedSectionBlock(section, description) {
  return {
    id: section.id,
    type: "Alert",
    layout: { span: 24 },
    properties: {
      type: "warning",
      showIcon: true,
      message: section.label,
      description:
        description ??
        "This section failed to load — its query may reference data no longer available.",
    },
  };
}

// ICU rejects an unknown currency code ("$") or a malformed locale tag with a
// RangeError. Both are AI-supplied and validateReportSpec only checks they are
// STRINGS — not that ICU accepts them — so probe the descriptor here, where
// verifySection's caller turns a throw into one Alert card. A KPI's descriptor
// would otherwise reach intlSeparators() below, outside that try, and take the
// whole report down; a table column's would survive compilation and throw
// inside _intl in the browser instead.
function verifyFormatUsable(format, where) {
  if (!format) return;
  const display = numberDisplay(format);
  try {
    new Intl.NumberFormat(display.locale, numberFormatOptions(display));
  } catch (error) {
    throw new Error(`${where} has an unusable number format: ${error.message}`);
  }
}

// Verifies the section's declared contract against its rows; throws on mismatch.
function verifySection(section, rows) {
  if (section.type === "kpi") {
    verifyKpiContract({ valueKey: section.valueKey, rows });
    verifyFormatUsable(section.format, "This KPI");
  } else if (section.type === "chart") {
    verifyChartContract({ x: section.x, y: section.y, rows });
  } else if (section.type === "table") {
    verifyTableContract({ columns: section.columns, rows });
    for (const column of section.columns) {
      verifyFormatUsable(column.format, `Column "${column.key}"`);
    }
  }
}

function compileReport({
  spec,
  results,
  catalog,
  roles,
  endpointId,
  created,
  updated,
  owner,
  visibility,
  resolvedAt,
}) {
  if (typeof endpointId !== "string" || endpointId === "") {
    fail("endpointId (the query-data endpoint) is required.");
  }
  // Inert re-validation only (no catalog): the per-section AnalyticsPipeline is
  // the security gate, so one inaccessible section must not throw here.
  const validated = validateReportSpec({ spec, roles });
  const { sections } = validated;

  // Align results with querySections() order: the resolver's :for step array.
  // Normalize an { '0': …, '1': … } object (sparse step results) to an array.
  let resultsArray = results ?? [];
  if (!Array.isArray(resultsArray)) {
    if (typeof resultsArray === "object") {
      resultsArray = Object.assign([], resultsArray);
    } else {
      fail("results must be the resolver's per-section step results.");
    }
  }
  const rowsBySectionId = new Map();
  orderedQueries(sections).forEach((entry, index) => {
    rowsBySectionId.set(entry.id, resultsArray[index] ?? null);
  });

  const filterSectionsByField = new Map(
    sections.filter((s) => s.type === "filter").map((s) => [s.field, s]),
  );

  // Filter controls collect into a single row at the top of the report,
  // regardless of where their sections sit in the spec; everything else keeps
  // spec order in the body below.
  const header = [];
  const filterBlocks = [];
  const bodyBlocks = [];

  header.push({
    id: "report_title",
    type: "Title",
    layout: { span: 24 },
    properties: { content: validated.title, level: 3 },
  });
  if (validated.description) {
    header.push({
      id: "report_description",
      type: "Paragraph",
      layout: { span: 24 },
      properties: { content: validated.description },
    });
  }

  // Provenance for everyone who opens the report — a read, NOT gated on
  // ownership. Three facts in order: who made it (and when), when it was last
  // edited (`updated` — never "spec changed"), and the resolve moment these
  // numbers were computed from. A shared report also names the publisher, the
  // answer to "why can I see this?"; the publisher is the owner (visibility is
  // the module's only sharing path), so `owner.name` fills both roles. Each
  // fact is dropped rather than shown blank when its input is absent.
  const madeBy = owner?.name;
  const provenance = [];
  if (madeBy) {
    provenance.push(
      created?.timestamp
        ? `Made by ${madeBy} on ${formatTimestamp(created.timestamp)}`
        : `Made by ${madeBy}`,
    );
  }
  if (updated?.timestamp) {
    provenance.push(`Last edited ${formatTimestamp(updated.timestamp)}`);
  }
  if (resolvedAt) {
    provenance.push(
      `Data as of ${formatTimestamp(resolvedAt, { withTime: true })}`,
    );
  }
  if (visibility === "shared" && madeBy) {
    provenance.push(`Shared with everyone by ${madeBy}`);
  }
  if (provenance.length) {
    header.push({
      id: "report_provenance",
      type: "Paragraph",
      layout: { span: 24 },
      properties: { content: provenance.join(" · "), type: "secondary" },
    });
  }

  for (const section of sections) {
    if (["kpi", "chart", "table"].includes(section.type)) {
      const rows = rowsBySectionId.get(section.id);
      if (rows === null || rows === undefined) {
        bodyBlocks.push(failedSectionBlock(section));
        continue;
      }
      // Contract-vs-rows check: a mismatch renders this section as an Alert
      // card while the rest of the report renders normally.
      try {
        verifySection(section, rows);
      } catch (error) {
        bodyBlocks.push(failedSectionBlock(section, error.message));
        continue;
      }

      if (section.type === "kpi") {
        const inlined = rows?.[0]?.[section.valueKey] ?? 0;
        const value =
          (section.filterBy ?? []).length === 0
            ? inlined
            : {
                __if_none: [
                  {
                    __state: `sections.${section.id}.rows.0.${section.valueKey}`,
                  },
                  inlined,
                ],
              };
        // Statistic formats its live numeric value natively; separators/symbol
        // come from the contract format so it matches the table's _intl output.
        const display = numberDisplay(section.format);
        const seps = intlSeparators(display);
        const properties = {
          title: section.label,
          value,
          precision: display.decimals,
          groupSeparator: seps.group,
          decimalSeparator: seps.decimal,
        };
        if (display.style === "currency") {
          properties.prefix = `${seps.symbol} `;
        }
        bodyBlocks.push({
          id: section.id,
          type: "Statistic",
          layout: { span: 6 },
          properties,
        });
      }

      if (section.type === "chart") {
        const option = buildEChartsOption({
          chart: section.chart,
          x: section.x,
          y: section.y,
          rows: [],
        });
        option.dataset.source = dataBinding(section, rows);
        bodyBlocks.push(sectionHeading(section, rows));
        bodyBlocks.push(sectionDownload(section, endpointId));
        bodyBlocks.push({
          id: section.id,
          type: "EChart",
          layout: { span: 24 },
          properties: { height: 400, option },
        });
      }

      if (section.type === "table") {
        bodyBlocks.push(sectionHeading(section, rows));
        bodyBlocks.push(sectionDownload(section, endpointId));
        bodyBlocks.push({
          id: section.id,
          type: "AgGridBalham",
          layout: { span: 24 },
          properties: {
            rowData: dataBinding(section, rows),
            columnDefs: section.columns.map((column) =>
              tableColumnDef(column, rows),
            ),
            defaultColDef: { sortable: true, resizable: true },
          },
        });
      }
    }

    if (section.type === "filter") {
      const boundSections = sections.filter((s) =>
        (s.filterBy ?? []).includes(section.field),
      );
      const onChange = requeryActions({
        boundSections,
        filterSectionsByField,
        endpointId,
      });
      if (section.control === "daterange") {
        filterBlocks.push({
          id: filterStateKey(section.field),
          type: "DateRangeSelector",
          layout: { span: 6 },
          properties: { title: section.label },
          events: { onChange },
        });
      } else {
        const sourced = filterOptions({
          filter: section,
          sections,
          catalog,
          roles,
          rows: rowsBySectionId.get(section.id),
        });
        if (sourced.failure) {
          // No usable options: the control is replaced by an Alert in the
          // filter row. Its bound sections still render their resolve-time
          // rows, they simply never re-query.
          filterBlocks.push(failedSectionBlock(section, sourced.failure));
        } else {
          filterBlocks.push({
            id: filterStateKey(section.field),
            type:
              section.control === "multiselect"
                ? "MultipleSelector"
                : "Selector",
            layout: { span: 6 },
            properties: {
              // Truncation is stated, never silent — the same way sectionHeading
              // says so for a capped table. The cap comes from whichever source
              // supplied the list, so the number in the title is the one that
              // actually cut it.
              title: sourced.truncated
                ? `${section.label} — first ${sourced.cap}`
                : section.label,
              allowClear: true,
              options: sourced.options,
            },
            events: { onChange },
          });
        }
      }
    }

    if (section.type === "markdown") {
      bodyBlocks.push({
        id: section.id,
        type: "Markdown",
        layout: { span: 24 },
        properties: { content: section.content },
      });
    }

    if (section.type === "download") {
      bodyBlocks.push({
        id: section.id,
        type: "Button",
        layout: { span: 6 },
        properties: { title: section.label, icon: "AiOutlineDownload" },
        events: {
          onClick: [
            {
              id: `query_${section.id}`,
              type: "CallAPI",
              params: { endpointId, payload: { query: section.query } },
            },
            {
              id: `download_${section.id}`,
              type: "DownloadCsv",
              params: {
                data: { __api: `${endpointId}.response` },
                filename: safeFilename(section.label),
              },
            },
          ],
        },
      });
    }
  }

  // Filters sit in their own full-width row so they stay together at the top
  // and don't interleave with KPIs (which share the same span).
  const filterRow = filterBlocks.length
    ? [
        {
          id: "report_filters",
          type: "Box",
          // `gap`, not the deprecated `contentGutter` — @lowdefy/layout still
          // resolves the old name but logs a deprecation warning on every
          // report render, and the Dynamic block surfaces it per resolve.
          layout: { span: 24, gap: 8 },
          blocks: filterBlocks,
        },
      ]
    : [];

  return [...header, ...filterRow, ...bodyBlocks];
}

export default compileReport;
