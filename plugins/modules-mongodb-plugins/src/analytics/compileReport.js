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
import { touchedCollections } from "./validatePipeline.js";
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

// Blocks laid out on the 24-column grid are block-level cells, and the layout
// engine takes alignment on a container rather than on an item — so an action
// that must sit at the right of its own cell shrinks to its content and pushes
// itself over with an auto left margin. Used by the header actions and by each
// section's ⤓.
const RIGHT_IN_CELL = {
  display: "block",
  width: "fit-content",
  marginLeft: "auto",
};

// Header action widths, on the same 24-column grid. ★ and ⋯ are icons alone; the
// chat link carries its label, so it needs the wider cell.
const FAVOURITE_SPAN = 2;
const MENU_SPAN = 2;
const CHAT_LINK_SPAN = 5;

// The layout engine's column count. A block with no declared span fills the row.
const GRID_COLUMNS = 24;

// Vertical separation ahead of each section GROUP, on top of the small row gap
// report.yaml sets on the content area. Two different distances, deliberately: a
// heading ends up nearer the content it names than the section above it, so it
// reads as belonging to what follows. A single uniform gap large enough to
// separate sections leaves the heading equidistant, belonging to neither.
const SECTION_TOP_GAP = 16;

// Stamp the gap on the group's FIRST WRAP LINE, not on its first block. Every
// compiled block is a sibling in one wrapping flex area — the "rows" are wrap
// lines, not nested containers — so a margin on one block alone drops its
// row-mates out of line with it: a heading would part from its ⤓, and the first
// filter of a shared row from the filters beside it.
//
// The group is whatever leads the section: its pending filter controls when it
// has any, otherwise its head row or its Alert. Anchoring on the group rather
// than the head row is what keeps a filter attached to the section it drives —
// stamped on the heading instead, the control sat 8px under the PREVIOUS
// section and 24px above its own, reading as though it filtered the wrong one.
function withTopGap(blocks) {
  let filled = 0;
  return blocks.map((block) => {
    if (filled >= GRID_COLUMNS) return block;
    filled += block.layout?.span ?? GRID_COLUMNS;
    return {
      ...block,
      style: { ...block.style, marginTop: SECTION_TOP_GAP },
    };
  });
}

// A chart's canvas. Full width inside the page's ~1100px column, so this is the
// short side: 280 gives axis labels and a legend room without the near-square
// canvas 400 produced, where a handful of categories became enormously wide bars
// floating in whitespace.
const CHART_HEIGHT = 280;

// The AgGridBalham wrapper is a fixed-height div (500 by default), so a five-row
// table sat in a 500px box with 350px of white under it. Size to the rows
// instead — balham's 28px row and 32px header, plus a couple of pixels of border
// — and keep the 500 as a CEILING, not a default: past that the grid scrolls and
// virtualises, which is what a table near the 1000-row pipeline cap needs. The
// floor leaves the no-rows overlay somewhere to render.
function tableHeight(rows) {
  const count = Array.isArray(rows) ? rows.length : 0;
  return Math.min(500, Math.max(120, 34 + count * 28));
}

// Filter control block ids double as their page-state keys.
function filterStateKey(field) {
  return `filter_${field}`;
}

// Filters anchored above the same section sit side by side rather than each
// taking a full row — a report with a date range and two selects spent three
// rows on controls before its first number. Three per row because the 24-col
// grid divides evenly (24/12/8) and a select much narrower than a third of the
// column stops showing its selection. Past three the grid wraps at the same
// span, so a fourth filter starts a second row at a third width instead of
// stretching alone across the page. Only the group anchored at one section
// shares a row: co-location is the point, so filters that scope different
// sections must not be pulled together (see the report-page design).
const FILTERS_PER_ROW = 3;
function filterSpan(groupSize) {
  return GRID_COLUMNS / Math.min(groupSize, FILTERS_PER_ROW);
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
// The section's ⤓, sharing a row with its heading (span 4 against the heading's
// 20) rather than taking a full row of its own — on a four-section report those
// were four wasted rows, each a labelled link competing with the heading above
// it. `hideTitle` is what makes it icon-only: the Button block falls back to
// rendering its blockId when `title` is absent, so dropping the title is not
// enough. Pushed to the right of its cell with an auto left margin, which needs
// the block to be block-level and shrink to its content.
function sectionDownload(section, endpointId) {
  return {
    id: `${section.id}_download`,
    type: "Button",
    layout: { span: 4 },
    style: { ...RIGHT_IN_CELL },
    properties: {
      title: "Export CSV",
      hideTitle: true,
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
  // span 20, leaving 4 for the ⤓ that follows it — the two make one head row.
  // Every caller pairs them; a failed or withheld section renders an Alert
  // carrying its own label instead of a heading, so nothing emits this alone.
  return {
    id: `${section.id}_heading`,
    type: "Title",
    layout: { span: 20 },
    properties: { content, level: 5 },
  };
}

const SECTION_FAILED_DESCRIPTION =
  "This section failed to load — its query may reference data no longer available.";

// A section whose pipeline is valid but queries a role-gated collection the
// viewer can't reach. Names no collection and no role: doing so would leak the
// app's access model, and there is nothing the viewer — owner or not — can do
// about it, so no recovery affordances either.
const SECTION_WITHHELD_DESCRIPTION =
  "You don't have access to the data in this section.";

function failedSectionBlock(section, description) {
  return {
    id: section.id,
    type: "Alert",
    layout: { span: 24 },
    properties: {
      type: "warning",
      showIcon: true,
      message: section.label,
      description: description ?? SECTION_FAILED_DESCRIPTION,
    },
  };
}

// A broken data section (chart/table/kpi) plus its owner-only recovery
// affordances. The recoveries are a DISPLAY gate over a server-side one:
// remove-report-section owner-matches in its own filter and the chat it links to
// is gated server-side, so hiding them from a non-owner only spares them a dead
// button — it is not the authorization. A non-owner keeps the Alert, which names
// the owner who can fix it (when known) and offers nothing to click. Blocks stay
// flat siblings of the Alert — no wrapping Box — so the page's byId lookups reach
// them.
function brokenSectionBlocks(
  section,
  description,
  {
    isOwner,
    ownerName,
    conversationId,
    chatPageId,
    reportPageId,
    removeEndpointId,
  },
) {
  if (!isOwner) {
    const named = ownerName
      ? `${description ?? SECTION_FAILED_DESCRIPTION} Ask ${ownerName} to fix it.`
      : description;
    return [failedSectionBlock(section, named)];
  }

  const blocks = [failedSectionBlock(section, description)];

  // Fix in chat — reopens the source conversation with the failing section
  // named. Absent when the report has no conversation to reopen.
  if (conversationId) {
    blocks.push({
      id: `${section.id}_fix_in_chat`,
      type: "Button",
      layout: { span: 24 },
      properties: {
        title: "Fix in chat",
        icon: "AiOutlineMessage",
        type: "link",
        size: "small",
      },
      events: {
        onClick: [
          {
            id: `fix_${section.id}`,
            type: "Link",
            params: {
              pageId: chatPageId,
              urlQuery: {
                conversation_id: conversationId,
                section_id: section.id,
              },
            },
          },
        ],
      },
    });
  }

  // Drop it — the module's only spec write. Sends a report id + section id, never
  // the spec; remove-report-section owner-matches, cascades filter bindings, and
  // refuses when this is the last section (its message surfaces as the CallAPI
  // error). report_id is read from the page URL — the same value resolve-report
  // loaded this report from. The re-navigation is the refresh: the report is a
  // server-resolved Dynamic block with no client refetch, so re-opening the page
  // re-resolves it without the dropped section.
  blocks.push({
    id: `${section.id}_drop`,
    type: "Button",
    layout: { span: 24 },
    properties: {
      title: "Drop this section",
      icon: "AiOutlineDelete",
      type: "link",
      danger: true,
      size: "small",
    },
    events: {
      onClick: [
        {
          id: `drop_${section.id}`,
          type: "CallAPI",
          params: {
            endpointId: removeEndpointId,
            payload: {
              report_id: { __url_query: "report_id" },
              section_id: section.id,
            },
          },
        },
        {
          id: `reload_${section.id}`,
          type: "Link",
          params: {
            pageId: reportPageId,
            urlQuery: { report_id: { __url_query: "report_id" } },
          },
        },
      ],
    },
  });

  return blocks;
}

function withheldSectionBlock(section) {
  return failedSectionBlock(section, SECTION_WITHHELD_DESCRIPTION);
}

// A failed data section is either "withheld" (valid pipeline, but it queries a
// role-gated collection the viewer's roles don't satisfy) or "broken"
// (everything else). The resolver's per-section :catch surfaces both as an
// error-free null row, so classify BEFORE the fact from the same walk the
// AnalyticsPipeline gate ran: touchedCollections enumerates every collection
// the pipeline reaches with the role gate suppressed. A throw is a
// grammar/catalog-membership fault — genuinely broken.
function classifyFailure(section, catalog, roles) {
  let touched;
  try {
    touched = touchedCollections({
      collection: section.query.collection,
      pipeline: section.query.pipeline,
      catalog,
    });
  } catch {
    return "broken";
  }
  // Per collection, never over their union. checkCollectionAccess enforces each
  // touched collection as it is reached, so the rule is "satisfy EVERY non-empty
  // roles list" — any-of within a collection, all-of across them. Flattening the
  // lists first tests all-of within, any-of across: a pipeline joining a
  // `sales` collection to a `finance` one reads as satisfied for a viewer
  // holding only `sales`, so a section the gate genuinely withheld is called
  // broken — offering its owner Fix-in-chat and Drop for a spec that is fine.
  const viewerRoles = roles ?? [];
  const withheld = touched.some((c) => {
    const required = catalog[c]?.roles ?? [];
    return (
      required.length > 0 && !required.some((r) => viewerRoles.includes(r))
    );
  });
  return withheld ? "withheld" : "broken";
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

// A filter's control block, built once and placed above the first section it
// drives (its position answers "what does this move"). Construction is identical
// to any placement: a DateRangeSelector, a Selector/MultipleSelector sourced via
// filterOptions, or — when no usable options exist — the same Alert a broken
// section renders. When the filter drives more than one section it sits above
// only the first, so it names the others; bound to one, position says it.
function filterControlBlock({
  section,
  boundSections,
  sections,
  catalog,
  roles,
  rows,
  endpointId,
  filterSectionsByField,
  span,
}) {
  const onChange = requeryActions({
    boundSections,
    filterSectionsByField,
    endpointId,
  });
  // The scope note goes in the label's `extra` — rendered under the control, in
  // the muted `.ant-form-item-extra` line — rather than appended to the title.
  // Inline, a filter naming three other sections wrapped its title over two
  // lines and pushed its input out of alignment with the control beside it,
  // which is worse now that filters share a row. It is also secondary
  // information: the label answers "what is this", the note "what else does it
  // move". Undefined when the filter drives one section, and `showExtra` is
  // false for an absent extra, so nothing renders. All three control types
  // spread `properties.label` into their Label wrapper, so this reaches the same
  // place on each.
  const scopeExtra =
    boundSections.length > 1
      ? `Also filters: ${boundSections
          .slice(1)
          .map((s) => s.label)
          .join(", ")}`
      : undefined;
  const label = scopeExtra ? { extra: scopeExtra } : undefined;

  // The span is the group's, not 24: controls anchored above the same section
  // share a row. It is never wider than the group needs, so a lone filter still
  // owns its row above the section group rather than sitting beside the span-6
  // KPI that may follow it in the flat block flow.
  if (section.control === "daterange") {
    return {
      id: filterStateKey(section.field),
      type: "DateRangeSelector",
      layout: { span },
      properties: { title: section.label, label },
      events: { onChange },
    };
  }
  const sourced = filterOptions({
    filter: section,
    sections,
    catalog,
    roles,
    rows,
  });
  if (sourced.failure) {
    // No usable options: the control is replaced by an Alert above the bound
    // section. Its bound sections still render their resolve-time rows, they
    // simply never re-query. It takes the group's span rather than the block's
    // own 24 so the surviving controls keep their row — a full-width Alert
    // between them would leave a half-width filter stranded on its own line.
    return {
      ...failedSectionBlock(section, sourced.failure),
      layout: { span },
    };
  }
  return {
    id: filterStateKey(section.field),
    type: section.control === "multiselect" ? "MultipleSelector" : "Selector",
    layout: { span },
    properties: {
      // Truncation is stated, never silent — the same way sectionHeading says so
      // for a capped table. The cap comes from whichever source supplied the
      // list. It stays on the title rather than joining the scope note in
      // `extra`: it describes what this control offers, not what it moves.
      title: sourced.truncated
        ? `${section.label} — first ${sourced.cap}`
        : section.label,
      label,
      allowClear: true,
      options: sourced.options,
    },
    events: { onChange },
  };
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
  is_owner,
  is_favourite,
  conversation_id,
}) {
  if (typeof endpointId !== "string" || endpointId === "") {
    fail("endpointId (the query-data endpoint) is required.");
  }
  // The owner-only affordances target sibling pages/endpoints in the same module
  // entry. compileReport runs at resolve time and cannot evaluate _module.pageId
  // / _module.endpointId (build-time operators), but the scoped endpointId it is
  // already handed carries the entry id as its first path segment
  // ({entryId}/{name}), and every sibling shares it.
  const entryId = endpointId.split("/")[0];
  const chatPageId = `${entryId}/chat`;
  const reportPageId = `${entryId}/report`;
  const removeEndpointId = `${entryId}/remove-report-section`;
  const favouriteEndpointId = `${entryId}/set-report-favourite`;
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

  // A filter's control is emitted once, immediately above the first section it
  // drives — position is the answer to "what does this move". Everything keeps
  // spec order in the body below.
  const header = [];
  const bodyBlocks = [];

  // The title row: the title, then its actions right-aligned beside it rather
  // than stacked underneath. ★ is always there — favouriting is a read-side act,
  // so a non-owner may star a shared report — and Continue-in-chat only where
  // there is a conversation to reopen and the viewer owns it. The spans are
  // decided here, together, because the title takes whatever the actions leave;
  // that is also why the buttons are pushed immediately after it.
  const showContinueInChat = Boolean(is_owner && conversation_id);
  const actionsSpan =
    FAVOURITE_SPAN + MENU_SPAN + (showContinueInChat ? CHAT_LINK_SPAN : 0);

  header.push({
    id: "report_title",
    type: "Title",
    layout: { span: 24 - actionsSpan },
    properties: { content: validated.title, level: 3 },
  });

  if (showContinueInChat) {
    header.push({
      id: "report_continue_in_chat",
      type: "Button",
      layout: { span: CHAT_LINK_SPAN },
      style: RIGHT_IN_CELL,
      properties: {
        title: "Continue in chat",
        icon: "AiOutlineMessage",
        type: "link",
        size: "small",
      },
      events: {
        onClick: [
          {
            id: "continue_in_chat",
            type: "Link",
            params: {
              pageId: chatPageId,
              urlQuery: { conversation_id },
            },
          },
        ],
      },
    });
  }

  // set-report-favourite takes the desired state, not a toggle — and the current
  // state is known at compile time, so the payload is a literal rather than a
  // client-side negation. The re-navigation is the refresh, the same mechanism
  // Drop-a-section uses: the report is a server-resolved Dynamic block with no
  // client refetch, so re-opening the page is what re-renders the ★ filled.
  header.push({
    id: "report_favourite",
    type: "Button",
    layout: { span: FAVOURITE_SPAN },
    style: RIGHT_IN_CELL,
    properties: {
      title: is_favourite ? "Remove from favourites" : "Add to favourites",
      hideTitle: true,
      icon: is_favourite ? "AiFillStar" : "AiOutlineStar",
      type: "text",
      size: "small",
    },
    events: {
      onClick: [
        {
          id: "toggle_favourite",
          type: "CallAPI",
          params: {
            endpointId: favouriteEndpointId,
            payload: {
              report_id: { __url_query: "report_id" },
              favourite: !is_favourite,
            },
          },
        },
        {
          id: "reload_after_favourite",
          type: "Link",
          params: {
            pageId: reportPageId,
            urlQuery: { report_id: { __url_query: "report_id" } },
          },
        },
      ],
    },
  });
  // ⋯ opens report_menu_modal — the SAME menu the reports list opens from a row,
  // living in the page's static config rather than compiled here. That split is
  // deliberate: a Modal, its TextInput/TextArea and a ConfirmModal emitted from
  // the compiler would each have to join report.yaml's `types` allowlist, where
  // one undeclared type blanks the WHOLE report to the fallback slot. Compiling
  // only the button keeps the new allowlist surface at a single action
  // (CallMethod) and gives both surfaces one implementation of the menu, its
  // ownership gates and its endpoints.
  //
  // The seed is what makes that reuse work: the menu reads `selected_report`,
  // which the list fills from the clicked grid row and this fills from literals
  // the compiler already holds. `_id` is the exception — the compiler is not
  // told the report id, so it comes from the page URL, the same value
  // resolve-report loaded the report from. rename_title / rename_description are
  // copied to their own paths so editing them leaves the title the delete
  // confirm shows alone.
  //
  // Shown to every viewer, not just the owner: Duplicate is a reader's path to a
  // copy they control, and the menu hides the items a viewer cannot use from the
  // same is_owner / visibility / roles tests the list uses. The endpoints
  // authorize regardless.
  header.push({
    id: "report_menu",
    type: "Button",
    layout: { span: MENU_SPAN },
    style: RIGHT_IN_CELL,
    properties: {
      title: "Report actions",
      hideTitle: true,
      icon: "AiOutlineEllipsis",
      type: "text",
      size: "small",
    },
    events: {
      onClick: [
        {
          id: "seed_report_menu",
          type: "SetState",
          params: {
            selected_report: {
              _id: { __url_query: "report_id" },
              title: validated.title,
              is_owner: Boolean(is_owner),
              visibility: visibility ?? "private",
            },
            rename_title: validated.title,
            rename_description: validated.description ?? "",
          },
        },
        {
          id: "open_report_menu",
          type: "CallMethod",
          params: {
            blockId: "report_menu_modal",
            method: "setOpen",
            args: [{ open: true }],
          },
        },
      ],
    },
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
  const ownerName = owner?.name;
  const madeBy = ownerName;
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

  const brokenCtx = {
    isOwner: is_owner,
    ownerName,
    conversationId: conversation_id,
    chatPageId,
    reportPageId,
    removeEndpointId,
  };

  // Each filter's control, keyed by the id of the FIRST section (spec order)
  // whose filterBy names its field — the interleave point it renders above.
  // validateReportSpec has already rejected any filter no section binds, so a
  // first subscriber always exists.
  // Grouped before any control is built, because a control's span comes from how
  // many filters share its anchor.
  const filtersByFirstSubscriber = new Map();
  for (const filter of sections.filter((s) => s.type === "filter")) {
    const boundSections = sections.filter((s) =>
      (s.filterBy ?? []).includes(filter.field),
    );
    const anchor = boundSections[0];
    const list = filtersByFirstSubscriber.get(anchor.id) ?? [];
    list.push({ filter, boundSections });
    filtersByFirstSubscriber.set(anchor.id, list);
  }
  for (const [anchorId, group] of filtersByFirstSubscriber) {
    const span = filterSpan(group.length);
    filtersByFirstSubscriber.set(
      anchorId,
      group.map(({ filter, boundSections }) =>
        filterControlBlock({
          section: filter,
          boundSections,
          sections,
          catalog,
          roles,
          rows: rowsBySectionId.get(filter.id),
          endpointId,
          filterSectionsByField,
          span,
        }),
      ),
    );
  }

  // One section's own blocks, returned rather than pushed so the caller can
  // treat the section and the filter controls that lead it as a single group.
  const sectionBlocks = (section) => {
    const out = [];
    if (["kpi", "chart", "table"].includes(section.type)) {
      const rows = rowsBySectionId.get(section.id);
      if (rows === null || rows === undefined) {
        if (classifyFailure(section, catalog, roles) === "withheld") {
          out.push(withheldSectionBlock(section));
        } else {
          out.push(...brokenSectionBlocks(section, undefined, brokenCtx));
        }
        return out;
      }
      // Contract-vs-rows check: a mismatch renders this section as an Alert
      // card while the rest of the report renders normally.
      try {
        verifySection(section, rows);
      } catch (error) {
        out.push(...brokenSectionBlocks(section, error.message, brokenCtx));
        return out;
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
        out.push({
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
        out.push(sectionHeading(section, rows));
        out.push(sectionDownload(section, endpointId));
        out.push({
          id: section.id,
          type: "EChart",
          layout: { span: 24 },
          properties: { height: CHART_HEIGHT, option },
        });
      }

      if (section.type === "table") {
        out.push(sectionHeading(section, rows));
        out.push(sectionDownload(section, endpointId));
        out.push({
          id: section.id,
          type: "AgGridBalham",
          layout: { span: 24 },
          properties: {
            height: tableHeight(rows),
            rowData: dataBinding(section, rows),
            columnDefs: section.columns.map((column) =>
              tableColumnDef(column, rows),
            ),
            defaultColDef: { sortable: true, resizable: true },
          },
        });
      }
    }

    // Filter sections emit no block at their own position — their control was
    // placed above its first subscribing section in the interleave pass above.

    if (section.type === "markdown") {
      out.push({
        id: section.id,
        type: "Markdown",
        layout: { span: 24 },
        properties: { content: section.content },
      });
    }

    if (section.type === "download") {
      out.push({
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
    return out;
  };

  for (const section of sections) {
    // A filter renders directly above its first subscribing section, and leads
    // that section's group — so the two are separated by the small row gap and
    // the whole group is pushed off what precedes it.
    const group = [
      ...(filtersByFirstSubscriber.get(section.id) ?? []),
      ...sectionBlocks(section),
    ];
    if (group.length > 0) bodyBlocks.push(...withTopGap(group));
  }

  return [...header, ...bodyBlocks];
}

export default compileReport;
