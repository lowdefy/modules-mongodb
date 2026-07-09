import buildEChartsOption from "./buildEChartsOption.js";
import validateReportSpec from "./validateReportSpec.js";

/**
 * Compiles a validated report spec plus resolve-time query results into
 * Lowdefy blocks — the trusted server-side half of "the AI supplies a spec,
 * the server compiles". Runs inside the resolve-report endpoint behind the
 * Dynamic block.
 *
 * Params:
 *   spec       — the stored report spec (revalidated here on every resolve).
 *   results    — per-query-section results, aligned with querySections():
 *                array (a :for step result) whose entries are row arrays; a
 *                missing/null entry marks a failed section (its AnalyticsQuery
 *                ran inside :try), rendered as an Alert card while the rest of
 *                the report renders normally.
 *   datasets   — the data dictionary (allowlist for revalidation).
 *   roles      — the viewing user's roles (dataset gates re-checked).
 *   endpointId — the scoped query-data endpoint id CallAPI targets for filter
 *                re-queries and downloads (the module passes _module.endpointId).
 *
 * Deferred client operators: compiled output carries `__state`, `__api` and
 * `__if_none` (double underscore) — the Dynamic block's server resolution
 * leaves them untouched and the client unescapes them to live operators.
 * Filter re-querying is event-driven: each filter control's onChange runs
 * CallAPI → query-data per bound section, then SetState copies the response
 * into `sections.<id>.rows`; bound data props read state once a filter has
 * fired, the inlined resolve-time snapshot before that.
 *
 * The compiler never emits `_secret` and never evaluates AI-provided strings
 * as operators — the spec is data.
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
// AnalyticsQuery drops null-valued filters, so an untouched control means "no
// constraint".
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
// next call replaces it (_api is keyed by endpointId).
function requeryActions({ boundSections, filterSectionsByField, endpointId }) {
  const actions = [];
  for (const section of boundSections) {
    actions.push({
      id: `query_${section.id}`,
      type: "CallAPI",
      params: {
        endpointId,
        payload: {
          spec: {
            ...section.query,
            filters: [
              ...(section.query.filters ?? []),
              ...boundFilters(section, filterSectionsByField),
            ],
          },
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

function failedSectionBlock(section) {
  return {
    id: section.id,
    type: "Alert",
    layout: { span: 24 },
    properties: {
      type: "warning",
      showIcon: true,
      message: section.label,
      description:
        "This section failed to load — its query may reference data no longer in the " +
        "data dictionary.",
    },
  };
}

function compileReport({ spec, results, datasets, roles, endpointId }) {
  if (typeof endpointId !== "string" || endpointId === "") {
    fail("endpointId (the query-data endpoint) is required.");
  }
  const validated = validateReportSpec({ spec, datasets, roles });
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

  const blocks = [];

  // Title block for the report header.
  blocks.push({
    id: "report_title",
    type: "Title",
    layout: { span: 24 },
    properties: { content: validated.title, level: 3 },
  });
  if (validated.description) {
    blocks.push({
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
        blocks.push(failedSectionBlock(section));
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
        blocks.push({
          id: section.id,
          type: "Statistic",
          layout: { span: 6 },
          properties: { title: section.label, value },
        });
      }

      if (section.type === "chart") {
        const option = buildEChartsOption({
          chart: section.chart,
          select: section.select,
          measures: section.measures,
          rows: [],
        });
        option.dataset.source = dataBinding(section, rows);
        blocks.push(sectionHeading(section));
        blocks.push({
          id: section.id,
          type: "EChart",
          layout: { span: 24 },
          properties: { height: 400, option },
        });
      }

      if (section.type === "table") {
        blocks.push(sectionHeading(section));
        blocks.push({
          id: section.id,
          type: "AgGridAlpine",
          layout: { span: 24 },
          properties: {
            rowData: dataBinding(section, rows),
            columnDefs: section.columns.map((column) => ({ field: column })),
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
        blocks.push({
          id: filterStateKey(section.field),
          type: "DateRangeSelector",
          layout: { span: 6 },
          properties: { title: section.label },
          events: { onChange },
        });
      } else {
        blocks.push({
          id: filterStateKey(section.field),
          type: "Selector",
          layout: { span: 6 },
          properties: {
            title: section.label,
            allowClear: true,
            options: section.options,
          },
          events: { onChange },
        });
      }
    }

    if (section.type === "markdown") {
      blocks.push({
        id: section.id,
        type: "Markdown",
        layout: { span: 24 },
        properties: { content: section.content },
      });
    }

    if (section.type === "download") {
      blocks.push({
        id: section.id,
        type: "Button",
        layout: { span: 6 },
        properties: { title: section.label, icon: "AiOutlineDownload" },
        events: {
          onClick: [
            {
              id: `query_${section.id}`,
              type: "CallAPI",
              params: { endpointId, payload: { spec: section.query } },
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

  return blocks;
}

export default compileReport;
