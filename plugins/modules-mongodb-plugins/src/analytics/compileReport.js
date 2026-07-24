import {
  MAX_FILTER_OPTIONS,
  REPORT_CURRENCY,
  REPORT_DECIMALS,
  REPORT_LOCALE,
} from "./constants.js";
import buildEChartsOption from "./buildEChartsOption.js";
import validateReportSpec, { catalogFieldValues } from "./validateReportSpec.js";
import {
  verifyChartContract,
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
 *   roles      — the viewing user's roles (passed through for symmetry).
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

// The extra filters a bound section's re-query carries: each bound filter
// contributes constraints whose values read live page state (deferred __state).
// AnalyticsPipeline drops null-valued triples, so an untouched control means
// "no constraint".
function boundFilters(section, filterSectionsByField) {
  const extra = [];
  for (const field of section.filterBy ?? []) {
    const control = filterSectionsByField.get(field).control;
    const key = filterStateKey(field);
    if (control === "daterange") {
      extra.push(
        { field, op: "gte", value: { __state: `${key}.0` } },
        { field, op: "lte", value: { __state: `${key}.1` } }
      );
    } else {
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
  const decimals = Number.isInteger(format?.decimals) ? format.decimals : REPORT_DECIMALS;
  if (format?.style === "currency") {
    return { style: "currency", decimals, currency: format.currency || REPORT_CURRENCY, locale };
  }
  return { style: "decimal", decimals, locale };
}

// Intl.NumberFormat options for a display descriptor.
function numberFormatOptions(display) {
  const base = { minimumFractionDigits: display.decimals, maximumFractionDigits: display.decimals };
  return display.style === "currency"
    ? { style: "currency", currency: display.currency, ...base }
    : { style: "decimal", ...base };
}

// The grouping/decimal separators and currency symbol a locale actually uses,
// resolved at compile time (Node ships full ICU). Lets the KPI Statistic format
// its live numeric value natively while matching the table's runtime _intl
// output — e.g. en-ZA yields "R", a space group and a comma decimal.
function intlSeparators(display) {
  const parts = new Intl.NumberFormat(display.locale, numberFormatOptions(display)).formatToParts(
    11111.11
  );
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

// A table column: a column carrying a `format` descriptor is numeric — it
// right-aligns and formats via _intl; a column without one renders plain text
// (enum tag styling was deliberately dropped). `label` becomes the header.
function tableColumnDef(column) {
  const def = { field: column.key };
  if (column.label !== undefined) def.headerName = column.label;
  if (column.format) {
    def.type = "numericColumn";
    def.cellRenderer = numericCellRenderer(numberDisplay(column.format));
  }
  return def;
}

// A select filter's options: the agent's declared `options`, else the enum
// `values` cataloged for the field in one of its bound sections' collections.
function filterOptions(filter, sections, catalog) {
  if (filter.options !== undefined) return filter.options.slice(0, MAX_FILTER_OPTIONS);
  const boundSections = sections.filter((s) => (s.filterBy ?? []).includes(filter.field));
  const collections = boundSections.map((s) => s.query?.collection).filter(Boolean);
  const values = catalogFieldValues(catalog, filter.field, collections);
  return (values ?? []).slice(0, MAX_FILTER_OPTIONS);
}

// EChart and AgGridAlpine have no `title` property (their schemas set
// additionalProperties: false), so a section's label renders as a preceding
// Title block — the same pattern the chat results panel uses for charts.
function sectionHeading(section) {
  return {
    id: `${section.id}_heading`,
    type: "Title",
    layout: { span: 24 },
    properties: { content: section.label, level: 5 },
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

// Verifies the section's declared contract against its rows; throws on mismatch.
function verifySection(section, rows) {
  if (section.type === "kpi") {
    verifyKpiContract({ valueKey: section.valueKey, rows });
  } else if (section.type === "chart") {
    verifyChartContract({ x: section.x, y: section.y, rows });
  } else if (section.type === "table") {
    verifyTableContract({ columns: section.columns, rows });
  }
}

function compileReport({ spec, results, catalog, roles, endpointId }) {
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
  const querySectionIds = sections
    .filter((s) => ["kpi", "chart", "table"].includes(s.type))
    .map((s) => s.id);
  const rowsBySectionId = new Map();
  querySectionIds.forEach((id, index) => {
    rowsBySectionId.set(id, resultsArray[index] ?? null);
  });

  const filterSectionsByField = new Map(
    sections.filter((s) => s.type === "filter").map((s) => [s.field, s])
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
                  { __state: `sections.${section.id}.rows.0.${section.valueKey}` },
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
        bodyBlocks.push(sectionHeading(section));
        bodyBlocks.push({
          id: section.id,
          type: "EChart",
          layout: { span: 24 },
          properties: { height: 400, option },
        });
      }

      if (section.type === "table") {
        bodyBlocks.push(sectionHeading(section));
        bodyBlocks.push({
          id: section.id,
          type: "AgGridAlpine",
          layout: { span: 24 },
          properties: {
            rowData: dataBinding(section, rows),
            columnDefs: section.columns.map(tableColumnDef),
            defaultColDef: { sortable: true, resizable: true },
          },
        });
      }
    }

    if (section.type === "filter") {
      const boundSections = sections.filter((s) =>
        (s.filterBy ?? []).includes(section.field)
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
        filterBlocks.push({
          id: filterStateKey(section.field),
          type: "Selector",
          layout: { span: 6 },
          properties: {
            title: section.label,
            allowClear: true,
            options: filterOptions(section, sections, catalog),
          },
          events: { onChange },
        });
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
          layout: { span: 24, contentGutter: 16 },
          blocks: filterBlocks,
        },
      ]
    : [];

  return [...header, ...filterRow, ...bodyBlocks];
}

export default compileReport;
