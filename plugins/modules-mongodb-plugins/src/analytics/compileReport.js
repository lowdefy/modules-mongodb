import {
  MAX_FILTER_OPTIONS,
  MAX_QUERY_FILTER_OPTIONS,
  PIPELINE_RESULT_CAP,
  REPORT_CURRENCY,
  REPORT_DECIMALS,
  REPORT_LOCALE,
} from "./constants.js";
import buildFlintOption, {
  humanize,
  PALETTE,
  pieSliceNames,
} from "./buildFlintOption.js";
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
 *   endpointId — the scoped query-data endpoint id CallAPI targets for the row
 *                re-queries of filtered kpi/table sections, and for every CSV
 *                download (the module passes _module.endpointId).
 *   chartEndpointId
 *              — the scoped chart-data endpoint id a filtered CHART section
 *                re-queries instead: its rows are inlined into an assembled
 *                ECharts option, so the server re-assembles and returns the
 *                option and its canvas height rather than rows.
 *   can_share  — whether this viewer holds one of the module's share_roles.
 *                Decided by the endpoint (it holds the var) and passed in as a
 *                boolean, so the ⋯ menu's publish and unpublish items can be
 *                included or left out HERE rather than gated by a `_user`
 *                operator in compiled output. Absent reads as false, which
 *                matches an unset share_roles: nothing can be published.
 *   theme      — optional `{ light, dark }` pair of ECharts theme objects. Each
 *                carries only typography and axis chrome, never a palette:
 *                ECharts merges a theme under the option, and buildFlintOption
 *                already pins colours into it, so a palette here would never
 *                show. Both are emitted into every chart section behind an
 *                `_if` on `_media: darkMode` — see themeSwitch for why the
 *                choice cannot be made here. Omitted entirely (not just falsy)
 *                when absent, matching every caller that predates it.
 *
 * The contract is verified against the actual rows per section: a missing
 * column key or a non-numeric y/KPI value renders that one section as an Alert
 * card (a graceful rendering failure). Verification skips empty results and
 * tolerates null value cells.
 *
 * Deferred client operators: compiled output carries `__state`, `__api`,
 * `__if_none`, `__url_query`, `__event` and `__ne` (double underscore) — the
 * Dynamic block's server resolution leaves them untouched and the client
 * unescapes them to live operators.
 *
 * The compiler never emits `_secret` and never evaluates AI-provided strings as
 * operators — the spec is data.
 */

function fail(message) {
  throw new Error(`compileReport: ${message}`);
}

// A DropdownMenu item, in the Menu block link shape the block shares with Menu and
// MobileMenu. The id is the key the block reports back on click, which is what the
// header's ⋯ dispatches on.
function menuLink(id, title, icon, properties = {}) {
  return { id, type: "MenuLink", properties: { title, icon, ...properties } };
}

// `skip` for an action that belongs to one ⋯ item: skip unless the clicked key is
// this one. Strict === true, so this has to evaluate to a boolean — __ne does.
function unlessItem(key) {
  return { __ne: [{ __event: "key" }, key] };
}

// Publish and unpublish differ only in the value they write, so they are one shape:
// set the visibility, then re-open the page. The re-navigation IS the refresh — the
// report is a server-resolved Dynamic block with no client refetch — and it runs
// after the call, which throws on rejection and stops the chain.
function visibilityActions(key, visibility, endpointId, pageId) {
  return [
    {
      id: `menu_${key}_call`,
      type: "CallAPI",
      skip: unlessItem(key),
      params: {
        endpointId,
        payload: { report_id: { __url_query: "report_id" }, visibility },
      },
    },
    {
      id: `menu_${key}_reload`,
      type: "Link",
      skip: unlessItem(key),
      params: { pageId, urlQuery: { report_id: { __url_query: "report_id" } } },
    },
  ];
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

// What report.yaml caps the content grid at, and so the widest a section can be
// drawn. It is the only width a compiled section has to go on: nothing here runs
// in a browser that could measure the real one.
const REPORT_CONTENT_WIDTH = 1100;

// The horizontal room a section's card takes out of its span before the canvas
// inside it starts: the card body's padding on both sides, plus the gap to the
// card beside it on the same wrap line. Estimated, not measured — nothing here
// runs in a browser — from antd's 24px card body padding and the content area's
// row gap.
//
// Deducted at every span, including the full-width one where there is no
// neighbour to gap against, because the error it guards runs one way only: chart
// assembly reads the width to decide legend orientation and label rotation, and
// an OVER-stated width leaves labels untilted that then collide, which reads
// worse than the tilt it skipped. At the full column the deduction is a couple
// of percent; at half of it, twice the share — which is what makes it worth
// taking off at all.
const CARD_HORIZONTAL_CHROME = 64;

// The pixel width a chart laid out at `span` of the grid's columns is drawn at —
// the width its assembly has to be told, because a chart assembled for one width
// and laid out at another gets the legend orientation and label rotation of a
// canvas it is not on.
export function chartWidthForSpan(span) {
  return (
    Math.round((span / GRID_COLUMNS) * REPORT_CONTENT_WIDTH) -
    CARD_HORIZONTAL_CHROME
  );
}

// Two charts to a wrap line, so half the grid each. Half the column also sits
// well under the width at which Flint funds a right-hand legend column instead
// of a horizontal band (NARROW_WIDTH in buildFlintOption), which is what keeps a
// paired chart spending its width on the plot rather than on its legend.
const PAIRED_CHART_SPAN = GRID_COLUMNS / 2;

// Vertical separation ahead of each section GROUP, on top of the small row gap
// report.yaml sets on the content area. Two different distances, deliberately: a
// heading ends up nearer the content it names than the section above it, so it
// reads as belonging to what follows. A single uniform gap large enough to
// separate sections leaves the heading equidistant, belonging to neither.
const SECTION_TOP_GAP = 16;

// Stamp the gap on the group's FIRST WRAP LINE, not on its first block. The
// blocks a group is made of sit side by side in one wrapping flex area — a
// "row" is a wrap line, not a container — so a margin on one block alone drops
// its row-mates out of line with it: a heading would part from its ⤓, and the
// first filter of a shared row from the filters beside it. A section's card is
// its own wrap line, so it never takes the gap when a head row precedes it, and
// a pair of half-width chart boxes is ONE line — both boxes take the gap, and
// nothing inside either of them does, since only the group's own blocks are
// walked.
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
// rows on controls before its first number. At most three per row because the
// 24-col grid divides evenly (24/12/8) and a select much narrower than a third
// of the column stops showing its selection. Only the group anchored at one
// section shares a row: co-location is the point, so filters that scope
// different sections must not be pulled together (see the report-page design).
const FILTERS_PER_ROW = 3;

// A row of KPI tiles takes four rather than three: a tile is a label over a
// number, which still reads at a quarter of the column where a select showing
// its selection does not.
const KPIS_PER_ROW = 4;

// The cell a filter group's Reset takes at the end of its closing line, leaving
// the rest to the shared scope note. The same 20/4 split a section's head row
// uses for its heading and its ⤓, for the same reason: an action shrunk to its
// content needs a cell to be pushed to the right of, not a share of the width.
const RESET_SPAN = 4;

// One span per block in the group, distributed so EVERY wrap line the group
// occupies is exactly full. A ragged trailing line is not cosmetic here: all
// compiled blocks are siblings in one wrapping flex area, so the 16 columns left
// over after a fourth filter are columns the following section flows into — a
// report with four filters and four KPIs put the last filter and the first two
// numbers on one line and split the KPIs across two. Filling each line is what
// keeps the controls and the numbers on lines of their own.
//
// Rows are balanced rather than greedy — four filters are 2+2, not 3+1 — so no
// filter stretches alone across the page while its neighbours sit at a third of
// it. Balancing also holds every row to `perRow` or fewer, which is what keeps
// 24/size a whole number of columns: every cap the callers pass divides 24.
function filterSpans(groupSize, perRow = FILTERS_PER_ROW) {
  const rows = Math.ceil(groupSize / perRow);
  const base = Math.floor(groupSize / rows);
  const longRows = groupSize % rows;
  const spans = [];
  for (let row = 0; row < rows; row += 1) {
    const size = base + (row < longRows ? 1 : 0);
    for (let i = 0; i < size; i += 1) spans.push(GRID_COLUMNS / size);
  }
  return spans;
}

// Maximal sequences of adjacent same-type sections, in spec order — the unit
// layout is derived over: n adjacent kpis are one tile row, two adjacent narrow
// charts are one pair.
//
// Section ORDER is the author's only channel into this, and the spec says
// nothing else about layout: two charts placed adjacent pair up, and the same
// two with a section of any other type between them do not. Adjacency is
// therefore read off the spec exactly as written — filter sections included,
// even though a filter emits nothing at its own position: the control it emits
// above its first subscriber may be precisely what renders between the two.
function groupRuns(sections) {
  const runs = [];
  for (const section of sections) {
    const run = runs[runs.length - 1];
    if (run && run[0].type === section.type) run.push(section);
    else runs.push([section]);
  }
  return runs;
}

// Past these, half a column stops working: a ninth distinct x label tilts and
// then collides with its neighbours, and a fifth series funds a legend wider
// than the plot left beside it.
const MAX_NARROW_CATEGORIES = 8;
const MAX_NARROW_SERIES = 4;

// Date.parse is far too permissive in V8 — "FY 2018" parses — so a date-like
// string has to start with a digit or a month name to count, the same
// restriction Flint imposes.
const MONTH_PREFIX = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

// Whether Flint will type this column of x values temporal. Mirrored from
// flint-chart's data-driven inference rather than guessed at, because the
// consequence has to match what gets DRAWN: Flint tests numeric before temporal,
// so an all-numeric column — "2024" strings included — is quantitative and gets
// a category axis, while a column whose every present value is a Date or a
// date-like string gets the time axis whose dense ticks are what need the room.
function isTemporalAxis(values) {
  const present = values.filter(
    (value) => value !== null && value !== undefined,
  );
  if (present.length === 0) return false;
  if (
    present.every((value) => !(value instanceof Date) && !Number.isNaN(+value))
  ) {
    return false;
  }
  return present.every((value) => {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    return (
      (/^\d/.test(trimmed) || MONTH_PREFIX.test(trimmed)) &&
      !Number.isNaN(Date.parse(trimmed))
    );
  });
}

// Whether a chart section needs the whole column, judged from the rows the
// compiler already holds. Three triggers, each a way for half a column to become
// unreadable: a temporal x axis, more than eight distinct categories, or more
// than four series.
//
// A pie has none of them — no axis to label, a slice count capped at seven by
// assembly, and a radius that fills whatever square it is given — so a pie is
// always narrow enough to pair, however many rows it summarises.
//
// A section with no rows is broken or withheld: it renders an Alert, which has
// no business sitting in a half-column hole, and there is no data to judge
// anyway. It reads as needing the width.
export function needsWidth(section, rows) {
  if (!Array.isArray(rows)) return true;
  if (section.chart === "pie") return false;
  if ((section.y ?? []).length > MAX_NARROW_SERIES) return true;
  const values = rows.map((row) => row?.[section.x]);
  if (isTemporalAxis(values)) return true;
  // Keyed by String so two equal dates count once, and so a mixed column cannot
  // over-count by object identity.
  return new Set(values.map(String)).size > MAX_NARROW_CATEGORIES;
}

// Layout is derived here, on every open, from three things and nothing else: the
// section's type, its position in its run, and the shape of the data the resolve
// returned. None of it is stored in the spec — the agent authors no widths — so a
// report follows its data as that grows rather than keeping the shape the data
// had the day it was saved.
//
// The input is the FIRST, UNFILTERED resolve. Its rows are a superset of
// anything a filter can later narrow them to, so a chart wide enough for all of
// them stays wide enough for a subset, and a filter re-query swaps only
// options/rows/heights through state bindings under a block tree that does not
// move again until the next open. A filter that gained a DEFAULT applied at that
// first resolve would break the superset assumption, and the derivation input
// would have to be revisited.
//
// Returns the span each kpi/chart section is laid out at (with `boxed` for a
// chart that is half of a pair), and the groups the section gap leads: one
// section, except where derivation put several on one wrap line — a pair of
// charts, a row of KPI tiles — which lead as one.
function deriveSectionLayout({
  sections,
  rowsBySectionId,
  filtersByFirstSubscriber,
}) {
  const spanBySection = new Map();
  const gapGroups = [];
  for (const run of groupRuns(sections)) {
    if (run[0].type === "kpi") {
      // One tile row for the whole run, balanced so every wrap line it takes is
      // exactly full. It leads as ONE group: a run of five tiles is two lines,
      // and a second gap between them would read as two sections of numbers.
      const spans = filterSpans(run.length, KPIS_PER_ROW);
      run.forEach((section, index) =>
        spanBySection.set(section.id, { span: spans[index] }),
      );
      gapGroups.push(run);
      continue;
    }
    if (run[0].type === "download") {
      // The whole run compiles to one Downloads card (see downloadsCard), so
      // it leads as ONE group — the same reason a kpi run does: a run of five
      // exports is two button rows, and a gap between them would read as two
      // separate download sections.
      gapGroups.push(run);
      continue;
    }
    if (run[0].type === "chart") {
      let index = 0;
      while (index < run.length) {
        const section = run[index];
        const next = run[index + 1];
        if (
          !needsWidth(section, rowsBySectionId.get(section.id)) &&
          next !== undefined &&
          !needsWidth(next, rowsBySectionId.get(next.id)) &&
          // A filter control anchored on the SECOND of the two renders between
          // them, breaking the wrap line they were paired for and stranding the
          // first beside a twelve-column hole. Both take the full width instead.
          !filtersByFirstSubscriber.has(next.id)
        ) {
          spanBySection.set(section.id, {
            span: PAIRED_CHART_SPAN,
            boxed: true,
          });
          spanBySection.set(next.id, { span: PAIRED_CHART_SPAN, boxed: true });
          gapGroups.push([section, next]);
          index += 2;
          continue;
        }
        // Alone on its line: a chart that needs the width, or a narrow one with
        // nothing to pair with. It takes the whole column rather than staying
        // half of one — a half-width card beside an empty half reads as a
        // rendering fault, not as a decision.
        spanBySection.set(section.id, { span: GRID_COLUMNS });
        gapGroups.push([section]);
        index += 1;
      }
      continue;
    }
    // Everything else is full width, one section to a line: a half-width AgGrid
    // is a horizontal-scroll trap, and prose reads across the column.
    for (const section of run) gapGroups.push([section]);
  }
  return { spanBySection, gapGroups };
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
//
// Pinned to UTC: without a timeZone the format follows the SERVER clock, so the
// same report reads a different "Data as of …" time — and a midnight-UTC
// date-only stamp shifts a whole day west of UTC. The module carries no
// per-viewer timezone, so UTC is the one stable, reproducible choice (and it is
// what keeps this deterministic across the machines that run the tests).
function formatTimestamp(value, { withTime = false } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  };
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
// next call replaces it (_api is keyed by endpointId) — which holds across the
// two endpoints the pairs span, since each SetState immediately follows its own
// call and reads that call's endpoint id. The server builds the $match from the
// triples and prepends it to the section's pipeline.
//
// A chart section re-queries chart-data rather than query-data: its rows are
// inlined into an assembled option in type-dependent shapes and its layout is
// derived from the labels, so the whole option and the canvas height it needs
// come back re-assembled instead of rows.
function requeryActions({
  boundSections,
  filterSectionsByField,
  endpointId,
  chartEndpointId,
  colors,
  spanBySection,
}) {
  const actions = [];
  for (const section of boundSections) {
    if (section.type === "chart") {
      actions.push({
        id: `query_${section.id}`,
        type: "CallAPI",
        params: {
          endpointId: chartEndpointId,
          payload: {
            chart: section.chart,
            // chart-data revalidates the spec, which requires a title; a chart
            // section's label is required, so it is always there to supply one.
            title: section.label,
            x: section.x,
            y: section.y,
            ...(section.stacked ? { stacked: true } : {}),
            // Re-assembly makes the same width-driven layout decisions the
            // compiled option was built with, so it has to be told the same
            // width — the DERIVED span's, not the full column's: a paired chart
            // re-queried at 24 columns would come back laid out for a canvas
            // twice the one it is drawn on. Spans do not move mid-session, so
            // the span decided at this open is the span the re-query will land
            // in.
            width: chartWidthForSpan(spanBySection.get(section.id).span),
            // For the same reason, and one more: the map was decided over the
            // UNFILTERED rows, so it covers names a filtered re-query can only
            // narrow. Re-derived from whatever the filter left instead, a series
            // would take the hue of its new rank rather than its own.
            colors,
            query: section.query,
            filters: boundFilters(section, filterSectionsByField),
          },
        },
      });
      actions.push({
        id: `set_${section.id}`,
        type: "SetState",
        params: {
          [`sections.${section.id}.option`]: {
            __api: `${chartEndpointId}.response.option`,
          },
          [`sections.${section.id}.height`]: {
            __api: `${chartEndpointId}.response.height`,
          },
        },
      });
      continue;
    }
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

// Both themes travel to the browser and the browser picks. It has to be this
// way round: the ink a chart's labels need depends on the card the chart is
// drawn on, `_media` is a CLIENT operator, and this function runs server-side
// inside the resolve — so a choice made here would be made blind. Emitted as an
// operator instead, it resolves per render, which also means toggling dark mode
// re-inks every chart on the page without re-resolving the report.
//
// The doubled payload is a theme object per mode per chart section, around a
// kilobyte each. Rejected the alternative of one ground-independent grey: the
// best single ink is ~4:1 against both surfaces, where a per-mode ink is 7:1
// against each, so it would have spent light mode's contrast to half-fix dark.
//
// `_if`/`_media` are allowlisted in report.yaml's `types.operators`; the leading
// underscore doubles because Dynamic collapses `__x` back to `_x` on resolve.
function themeSwitch(theme) {
  if (theme === undefined) return undefined;
  return {
    __if: {
      test: { __media: "darkMode" },
      then: theme.dark,
      else: theme.light,
    },
  };
}

// A section's own block sits inside a Card of its own — the container that
// makes a report read as a stack of panels rather than bare numbers on the page
// plane. Two section types bring their own frame and take no card: a table (the
// grid draws one) and markdown (prose is what goes between the panels). The
// span rides on the CARD, not the block inside it: the
// card is what the layout places, and a span in both would be two sources for
// one number. The id convention is load-bearing the other way round — the inner
// block keeps the section id that every state binding, re-query and chart
// assembly already names, and the wrapper takes `${id}_card`.
//
// `blocks` is the slots.content shorthand, as on the header's DropdownMenu — a
// resolved fragment is built by the same recursive walk as a static page, so it
// nests the same way.
function sectionCard(section, span, block) {
  return {
    id: `${section.id}_card`,
    type: "Card",
    layout: { span },
    blocks: [block],
  };
}

// A paired chart's WHOLE section — head row and card — inside a half-width
// wrapper, so the two of a pair sit side by side. It has to be a container and
// not merely a narrower card: a head row is a full 24-column wrap line, so two
// paired sections with flat head rows would each put their heading on a line of
// its own beside a twelve-column hole. Nested, the child spans re-base against
// the wrapper (`--lf-span` does not inherit), so the 20/4 heading-and-⤓ split
// still divides this half-width line and the heading still sits above the card.
function sectionBox(section, blocks) {
  return {
    id: `${section.id}_box`,
    type: "Box",
    layout: { span: PAIRED_CHART_SPAN },
    blocks,
  };
}

// A run of `download` sections compiles to one Card — the only section type
// whose panel carries its own title, since every other panel is already named
// by the head row above it and a download has no head row to put one in.
// Buttons share the run's row(s) at filterSpans(n), the same balancing a run
// of filters or kpis gets, rather than each stacking full-width or wrapping
// ragged at the page's raw width.
function downloadsCard(run, endpointId) {
  const spans = filterSpans(run.length);
  return {
    id: `${run[0].id}_downloads`,
    type: "Card",
    layout: { span: GRID_COLUMNS },
    properties: { title: "Downloads" },
    blocks: run.map((section, index) => ({
      id: section.id,
      type: "Button",
      layout: { span: spans[index] },
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
    })),
  };
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
// flat siblings of the Alert rather than sharing a container: a failure is not a
// panel of content, and each recovery is a full-width row of its own. Nesting is
// available here — a resolved fragment builds with the same recursive machinery
// as a static page, which is how every healthy section gets its card — so this
// flat shape is a layout choice and nothing more.
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

// Aligns the resolver's per-section step results with querySections() order,
// which is the only thing that relates the two: a result carries no section id.
// A missing entry reads as null — the section's AnalyticsPipeline failed inside
// :try, or the viewer may not read it.
function rowsBySection(sections, results) {
  const map = new Map();
  orderedQueries(sections).forEach((entry, index) => {
    map.set(entry.id, results?.[index] ?? null);
  });
  return map;
}

// Report-scoped colour identity: one hue per entity name, decided once for the
// whole report, so an entity is the same colour in every section that names it —
// a status in a pie and in the stacked bar beside it — rather than taking
// whichever hue its position in one chart's series list happened to fall on.
//
// The union is entity names only: a multi-series chart's series names (its
// humanized `y` columns) and a pie's slice names (its `x` values, taken as they
// will be drawn — ranked and capped, the aggregate excluded, since a name the
// pie folds away needs no hue). Both are names a reader matches from one section
// to the next; a single-series axis chart's is not, and is left out — see
// applyPalette.
//
// First appearance in spec order wins, and only the first eight names get in.
// The ninth onward are coloured per chart at assembly from the slots that chart
// left unused: they lose cross-section stability, which is the whole of what
// eight hues can buy, but no chart repeats a hue within itself.
export function assignReportColors({ sections, results }) {
  const rows = rowsBySection(sections, results);
  const assigned = new Map();
  for (const section of sections) {
    if (section.type !== "chart") continue;
    // A broken or withheld section has no rows, so a pie's slices are unknowable
    // and none of its marks will be drawn — it takes no slot rather than
    // throwing.
    const sectionRows = rows.get(section.id);
    if (sectionRows === null || sectionRows === undefined) continue;
    let names = [];
    if (section.chart === "pie") {
      names = pieSliceNames({ x: section.x, y: section.y, rows: sectionRows });
    } else if (section.y.length > 1) {
      names = section.y.map(humanize);
    }
    for (const name of names) {
      if (assigned.size >= PALETTE.length) break;
      const key = String(name);
      if (assigned.has(key)) continue;
      assigned.set(key, PALETTE[assigned.size]);
    }
  }
  // Built through a Map so a slice literally named "__proto__" lands as an own
  // property rather than vanishing into the prototype.
  return Object.fromEntries(assigned);
}

// The sections a filter moves BEYOND the one it sits above — position answers
// for that one. Undefined when position answers for all of them: an empty note
// would still reserve the line under the control.
function scopeNote(boundSections) {
  if (boundSections.length < 2) return undefined;
  return `Also filters: ${boundSections
    .slice(1)
    .map((s) => s.label)
    .join(", ")}`;
}

// A filter's bound-section set, as a comparable key. Every filter in a group
// shares its first subscriber — that is what grouped them — so the sets differ
// only past the anchor, and two filters driving the same sections key alike
// because boundSections is always read off the spec in spec order.
function scopeKey(boundSections) {
  return boundSections.map((s) => s.id).join("\u0000");
}

// Which bound-section set, if any, a filter group states ONCE under its controls
// rather than once per control. Four filters over six sections rendered four
// identical three-line notes — more vertical space than any chart on the page —
// for the same sentence four times.
//
// The most common set wins and its controls drop their own note; a control whose
// set differs keeps one, because a shared line cannot speak for it. Nothing wins
// when every set is distinct: n notes are already the shortest way to say n
// different scopes. A group of one shares with itself, so a lone filter's note
// becomes the line too — scope is written in one place at every group size.
function sharedScopeKey(group) {
  const counts = new Map();
  for (const { boundSections } of group) {
    const key = scopeKey(boundSections);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let winner = null;
  for (const [key, count] of counts) {
    if (winner === null || count > counts.get(winner)) winner = key;
  }
  if (winner === null) return null;
  const count = counts.get(winner);
  return count === group.length || count > 1 ? winner : null;
}

// Reset clears state and stops there. It does not re-query: every section
// binding is an __if_none over its state key and the value the first, unfiltered
// resolve inlined, so clearing the key IS the unfiltered data — and it is that
// data exactly, as of the timestamp the header's "Data as of" line states, which
// a fresh unfiltered query would silently move on.
//
// The section keys are the ones a re-query WOULD have written, per type, since
// those are the only ones a filter change can leave behind. They have to be
// cleared here rather than left to the controls: SetState fires no onChange, so
// emptying a control does not run its own re-query.
function filterResetAction(anchorId, group, boundUnion) {
  const params = {};
  for (const { filter } of group) params[filterStateKey(filter.field)] = null;
  for (const section of boundUnion) {
    if (section.type === "chart") {
      params[`sections.${section.id}.option`] = null;
      params[`sections.${section.id}.height`] = null;
    } else {
      params[`sections.${section.id}.rows`] = null;
    }
  }
  return { id: `reset_${anchorId}`, type: "SetState", params };
}

// What closes a filter group: the scope its controls share, said once, and the
// Reset that puts every section they drive back to the report as it opened.
//
// The spans are arithmetic, not decoration. filterSpans fills the controls' wrap
// lines exactly because leftover columns are columns the next section flows up
// into — so whatever follows the controls has to fill a line too. These two
// share one, 20 + 4, and whichever of them is alone takes all 24. Reset shrinks
// to its content and pushes right inside its cell, so it lands at the end of the
// group's last line at either span.
function filterGroupFooter({
  anchorId,
  group,
  boundUnion,
  note,
  rowsBySectionId,
}) {
  // Nothing to put back: every section these filters drive failed its resolve,
  // so each renders an Alert that reads no state and would re-query on no
  // change. The controls degrade the same way when their options cannot be
  // sourced, and a Reset for a report with nothing to reset is a dead control.
  const resettable = boundUnion.some(
    (section) => rowsBySectionId.get(section.id) != null,
  );
  const blocks = [];
  if (note) {
    blocks.push({
      id: `filters_${anchorId}_scope`,
      type: "Paragraph",
      layout: { span: resettable ? GRID_COLUMNS - RESET_SPAN : GRID_COLUMNS },
      properties: { content: note, type: "secondary" },
    });
  }
  if (resettable) {
    blocks.push({
      id: `filters_${anchorId}_reset`,
      type: "Button",
      layout: { span: note ? RESET_SPAN : GRID_COLUMNS },
      style: RIGHT_IN_CELL,
      properties: { title: "Reset", type: "text", size: "small" },
      events: { onClick: [filterResetAction(anchorId, group, boundUnion)] },
    });
  }
  return blocks;
}

// A filter's control block, built once and placed above the first section it
// drives (its position answers "what does this move"). Construction is identical
// to any placement: a DateRangeSelector, a Selector/MultipleSelector sourced via
// filterOptions, or — when no usable options exist — the same Alert a broken
// section renders.
function filterControlBlock({
  section,
  boundSections,
  sections,
  catalog,
  roles,
  rows,
  endpointId,
  chartEndpointId,
  filterSectionsByField,
  colors,
  spanBySection,
  span,
  showScope,
}) {
  const onChange = requeryActions({
    boundSections,
    filterSectionsByField,
    endpointId,
    chartEndpointId,
    colors,
    spanBySection,
  });
  // A note only this control needs — its scope differs from the one its group
  // states below, or it is the only thing that would say it. It goes in the
  // label's `extra`, rendered under the control in the muted
  // `.ant-form-item-extra` line, rather than appended to the title: inline, a
  // filter naming three other sections wrapped its title over two lines and
  // pushed its input out of alignment with the control beside it. It is also
  // secondary information — the label answers "what is this", the note "what
  // else does it move". `showExtra` is false for an absent extra, so nothing
  // renders when there is nothing to say. All three control types spread
  // `properties.label` into their Label wrapper, so this reaches the same place
  // on each.
  const scopeExtra = showScope ? scopeNote(boundSections) : undefined;
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
  chartEndpointId,
  created,
  updated,
  owner,
  visibility,
  resolvedAt,
  is_owner,
  is_favourite,
  can_share,
  conversation_id,
  theme,
}) {
  if (typeof endpointId !== "string" || endpointId === "") {
    fail("endpointId (the query-data endpoint) is required.");
  }
  if (typeof chartEndpointId !== "string" || chartEndpointId === "") {
    fail("chartEndpointId (the chart-data endpoint) is required.");
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
  const visibilityEndpointId = `${entryId}/set-report-visibility`;
  const duplicateEndpointId = `${entryId}/duplicate-report`;
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
  const rowsBySectionId = rowsBySection(sections, resultsArray);

  // Before any section is emitted: every chart's hues come out of one map, so
  // the pass that builds it has to have seen the whole spec first.
  const colors = assignReportColors({ sections, results: resultsArray });

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
  // ⋯ is a DropdownMenu whose trigger is the ⋯ button, and it is compiled here
  // rather than living in the page's static config, because a dropdown OWNS its
  // trigger. A Modal can be opened from anywhere by id — which is how this used to
  // reuse the list's menu — while a Dropdown or Popover cannot: it wraps the block
  // that opens it, and neither registers a method to open one from elsewhere. The
  // ⋯ sits in this compiled header row, so the menu has to be here too.
  //
  // The cost, accepted deliberately: publish, unpublish and duplicate have a second
  // implementation below, alongside the actions/report_*.yaml files the list's menu
  // cell _refs — compiled output cannot _ref build-time config. Rename and delete do
  // NOT: they only open the static modals that own their behaviour, so those two stay
  // single-definition. The same posture the ★ already has, one row up.
  //
  // Allowlist surface (report.yaml properties.types, where one missed type blanks the
  // WHOLE report): one block, DropdownMenu, and two operators, __event and __ne, for
  // the item dispatch. Every action type used here was already declared.
  //
  // Which items show is decided HERE, server-side, from facts this function already
  // holds — is_owner, visibility and can_share. Building the links from
  // `_user.hasSomeRoles` instead would put another operator in that allowlist to save
  // nothing: the answer is the same for the whole page load.
  //
  // An item's link and its actions are pushed TOGETHER, so a viewer's compiled config
  // carries only the actions their own menu can reach. The block fires one onClick for
  // the whole menu, carrying the clicked link's id, so each item's actions still carry
  // a `skip` keyed to that id — the guard is against the other shown items, not
  // against the hidden ones, which are not emitted at all.
  //
  // Shown to every viewer, not just the owner: Duplicate is a reader's path to a copy
  // they control, and the menu leaves out the items a viewer cannot use. The endpoints
  // authorize regardless — a menu is an affordance.
  const reportVisibility = visibility ?? "private";
  const canPublish =
    Boolean(is_owner) && Boolean(can_share) && reportVisibility !== "shared";
  // Unpublish is the one item whose gate is not is_owner alone: a share_roles holder
  // may retract a report they do not own. See docs/ai-reporting/concepts/ownership.md.
  const canUnpublish =
    reportVisibility === "shared" && (Boolean(is_owner) || Boolean(can_share));
  const menuItems = [];
  // No Open item: this menu only opens on the report page, which is already where Open
  // would navigate. The list's menu cell has one.
  if (is_owner) {
    menuItems.push({
      link: menuLink("rename", "Rename", "AiOutlineEdit"),
      // Seeded FROM selected_report (which rename_modal writes back to on save), not
      // from the literals in the seed below, so a title saved without a reload
      // survives. Mirrors actions/report_rename_open.yaml.
      actions: [
        {
          id: "menu_rename_seed",
          type: "SetState",
          skip: unlessItem("rename"),
          params: {
            rename_title: { __state: "selected_report.title" },
            rename_description: {
              __if_none: [{ __state: "selected_report.description" }, ""],
            },
          },
        },
        {
          id: "menu_rename_open",
          type: "CallMethod",
          skip: unlessItem("rename"),
          params: {
            blockId: "rename_modal",
            method: "setOpen",
            args: [{ open: true }],
          },
        },
      ],
    });
  }
  // Publish and unpublish are one endpoint with opposite values. Neither corrects
  // selected_report.visibility the way the shared actions do: this surface
  // re-navigates immediately, so the seed's literals are re-resolved rather than
  // patched.
  if (canPublish) {
    menuItems.push({
      link: menuLink("publish", "Publish to the app", "AiOutlineGlobal"),
      actions: visibilityActions(
        "publish",
        "shared",
        visibilityEndpointId,
        reportPageId,
      ),
    });
  }
  if (canUnpublish) {
    menuItems.push({
      link: menuLink("unpublish", "Unpublish", "AiOutlineEyeInvisible"),
      actions: visibilityActions(
        "unpublish",
        "private",
        visibilityEndpointId,
        reportPageId,
      ),
    });
  }
  menuItems.push({
    link: menuLink("duplicate", "Duplicate", "AiOutlineCopy"),
    // The copy opens in a NEW TAB rather than replacing this page: it is a different
    // report, so refreshing here would leave the reader on the original with nothing
    // to show a copy was made.
    //
    // pageId + urlQuery, and NOT the `url` string duplicate-report returns. Link's
    // `url` param means an external address: it prefixes `https://` whenever the value
    // has no scheme, so the root-relative "/{entry}/report?report_id=…" the endpoint
    // returns navigates to a HOST called {entry}. The returned url exists for the
    // assistant to hand a person in chat; in-app navigation always goes through
    // pageId/urlQuery, same as the chat's Open button
    // (pages/chat/components/saved_from_chat.yaml).
    actions: [
      {
        id: "menu_duplicate_call",
        type: "CallAPI",
        skip: unlessItem("duplicate"),
        params: {
          endpointId: duplicateEndpointId,
          payload: { report_id: { __url_query: "report_id" } },
        },
      },
      {
        id: "menu_duplicate_open",
        type: "Link",
        skip: unlessItem("duplicate"),
        params: {
          pageId: reportPageId,
          urlQuery: {
            report_id: { __api: `${duplicateEndpointId}.response.report_id` },
          },
          newTab: true,
        },
      },
    ],
  });
  if (is_owner) {
    menuItems.push({
      link: menuLink("delete", "Delete", "AiOutlineDelete", { danger: true }),
      // Hands off to the confirm modal, which owns the write and its own follow-up
      // (this page cannot stay on a report that no longer resolves), so nothing runs
      // after the open. Mirrors actions/report_delete_open.yaml.
      actions: [
        {
          id: "menu_delete_open",
          type: "CallMethod",
          skip: unlessItem("delete"),
          params: {
            blockId: "delete_confirm_modal",
            method: "setOpen",
            args: [{ open: true }],
          },
        },
      ],
    });
  }
  header.push({
    id: "report_menu",
    type: "DropdownMenu",
    layout: { span: MENU_SPAN },
    properties: {
      trigger: "click",
      placement: "bottomRight",
      links: menuItems.map((item) => item.link),
    },
    // slots.content — the blocks that trigger the dropdown. RIGHT_IN_CELL goes on the
    // button rather than on the DropdownMenu: antd's Dropdown renders no element of
    // its own, so a style on the block has nothing to land on.
    blocks: [
      {
        id: "report_menu_trigger",
        type: "Button",
        style: RIGHT_IN_CELL,
        properties: {
          title: "Report actions",
          hideTitle: true,
          icon: "AiOutlineEllipsis",
          type: "text",
          size: "small",
        },
      },
    ],
    events: {
      onClick: [
        {
          id: "seed_report_menu",
          type: "SetState",
          // Re-seeded on every item click, not only on open, because it is what the
          // static modals read. Only `selected_report` — seeding the rename inputs
          // from these literals instead would freeze them at resolve time, so a
          // rename saved a moment ago would be overwritten the next time the form
          // was opened. The list seeds the same shape from its row.
          params: {
            selected_report: {
              _id: { __url_query: "report_id" },
              title: validated.title,
              description: validated.description ?? "",
              is_owner: Boolean(is_owner),
              visibility: reportVisibility,
            },
          },
        },
        ...menuItems.flatMap((item) => item.actions),
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
  // Between the two filter passes: the anchors are known (a pair of charts will
  // not form across a control anchored on the second of them), and the spans a
  // chart's re-query has to carry are not yet needed.
  const { spanBySection, gapGroups } = deriveSectionLayout({
    sections,
    rowsBySectionId,
    filtersByFirstSubscriber,
  });

  // Assembly is memoised because a paired chart has to know its neighbour's
  // canvas height before either of them is emitted, and assembling twice would
  // mean building the same option twice per open. A section that throws caches
  // its error, so the failure degrades that one section exactly as it would have
  // in the emit loop.
  const assembledCharts = new Map();
  const assembleChart = (section) => {
    if (!assembledCharts.has(section.id)) {
      try {
        assembledCharts.set(section.id, {
          assembled: buildFlintOption({
            chart: section.chart,
            x: section.x,
            y: section.y,
            rows: rowsBySectionId.get(section.id),
            stacked: section.stacked,
            width: chartWidthForSpan(spanBySection.get(section.id).span),
            colors,
          }),
        });
      } catch (error) {
        assembledCharts.set(section.id, { error: error.message });
      }
    }
    return assembledCharts.get(section.id);
  };

  // Two charts sharing a wrap line take the taller one's canvas. Height follows
  // content — rotated labels and a legend band each buy their own room — so a
  // pair left to itself ends up with ragged bottoms and reads as a rendering
  // fault rather than as two views of one row. The shorter chart's plot grows
  // into the extra height instead of sitting above dead space, because the
  // option positions its grid from the canvas edges rather than at a fixed
  // plot size.
  //
  // Pinned, not bound: the pair's height is decided here and a filtered
  // re-query does not move it. That cannot clip, because the first resolve is
  // unfiltered — a filter can only narrow the rows, and fewer categories never
  // need more room than the height decided over all of them.
  const pairHeightById = new Map();
  for (const group of gapGroups) {
    if (group.length !== 2) continue;
    if (!group.every((s) => spanBySection.get(s.id)?.boxed)) continue;
    const heights = group
      .map((s) => assembleChart(s).assembled?.height)
      .filter((h) => typeof h === "number");
    if (heights.length !== 2) continue;
    const tallest = Math.max(...heights);
    for (const section of group) pairHeightById.set(section.id, tallest);
  }

  for (const [anchorId, group] of filtersByFirstSubscriber) {
    const spans = filterSpans(group.length);
    // Decided once for the whole group: which scope the closing line states, and
    // therefore which controls have nothing of their own left to say.
    const sharedKey = sharedScopeKey(group);
    const shared = group.find(
      ({ boundSections }) => scopeKey(boundSections) === sharedKey,
    );
    const sharedNote = shared ? scopeNote(shared.boundSections) : undefined;
    // Every section any filter in the group drives, in spec order — what Reset
    // has to put back, which is wider than any one control's bound set.
    const fields = new Set(group.map(({ filter }) => filter.field));
    const boundUnion = sections.filter((section) =>
      (section.filterBy ?? []).some((field) => fields.has(field)),
    );
    const blocks = group.map(({ filter, boundSections }, index) =>
      filterControlBlock({
        section: filter,
        boundSections,
        sections,
        catalog,
        roles,
        rows: rowsBySectionId.get(filter.id),
        endpointId,
        chartEndpointId,
        filterSectionsByField,
        colors,
        spanBySection,
        span: spans[index],
        showScope: scopeKey(boundSections) !== sharedKey,
      }),
    );
    blocks.push(
      ...filterGroupFooter({
        anchorId,
        group,
        boundUnion,
        note: sharedNote,
        rowsBySectionId,
      }),
    );
    filtersByFirstSubscriber.set(anchorId, blocks);
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
        // The tile's share of its run's row, so n adjacent kpis read as one row
        // of numbers rather than as n sections that happen to be narrow.
        out.push(
          sectionCard(section, spanBySection.get(section.id).span, {
            id: section.id,
            type: "Statistic",
            properties,
          }),
        );
      }

      if (section.type === "chart") {
        const { span, boxed } = spanBySection.get(section.id);
        // Assembly reads the rows: it inlines them and sizes the canvas to the
        // labels it lays out, and it rejects a spec it cannot render — so a
        // throw here degrades this one section rather than the report, the way
        // a contract mismatch does.
        const { assembled, error } = assembleChart(section);
        if (error !== undefined) {
          out.push(...brokenSectionBlocks(section, error, brokenCtx));
          return out;
        }
        // A paired chart wears its pair's height so the two line up; anything
        // else is sized by its own labels.
        const pinned = pairHeightById.get(section.id);
        const height = pinned ?? assembled.height;
        // Option and height move together where height is the chart's own: the
        // re-assembled option's height belongs to the labels in it, so binding
        // one without the other would draw new data at the old canvas size. A
        // pinned pair height is the exception and stays put, so a re-query
        // cannot break the pair's alignment.
        const properties =
          (section.filterBy ?? []).length === 0
            ? { height, option: assembled.option }
            : {
                option: {
                  __if_none: [
                    { __state: `sections.${section.id}.option` },
                    assembled.option,
                  ],
                },
                height: pinned ?? {
                  __if_none: [
                    { __state: `sections.${section.id}.height` },
                    assembled.height,
                  ],
                },
              };
        // A filtered re-query swaps option/height only (see chart-data), so a
        // theme set here at compile time keeps applying across refetches.
        const chartTheme = themeSwitch(theme);
        if (chartTheme !== undefined) {
          properties.theme = chartTheme;
        }
        const parts = [
          sectionHeading(section, rows),
          sectionDownload(section, endpointId),
          // Inside a box the card re-bases against the wrapper, so it fills the
          // half-width line rather than taking half of it again.
          sectionCard(section, boxed ? GRID_COLUMNS : span, {
            id: section.id,
            type: "EChart",
            properties,
          }),
        ];
        out.push(...(boxed ? [sectionBox(section, parts)] : parts));
      }

      if (section.type === "table") {
        out.push(sectionHeading(section, rows));
        out.push(sectionDownload(section, endpointId));
        // No card: a grid already draws the panel — a header band, row rules and
        // a border on all four sides — so a card around it is a second frame
        // holding nothing the first doesn't. The grid IS this section's panel.
        out.push({
          id: section.id,
          type: "AgGridBalham",
          layout: { span: GRID_COLUMNS },
          properties: {
            height: tableHeight(rows),
            rowData: dataBinding(section, rows),
            columnDefs: section.columns.map((column) =>
              tableColumnDef(column, rows),
            ),
            // flex fills the report column whatever the column count — without
            // it a narrow table left hundreds of pixels of blank space beside
            // its columns, and a wide one clipped its header mid-word instead
            // of shrinking to fit.
            defaultColDef: { sortable: true, resizable: true, flex: 1 },
          },
        });
      }
    }

    // Filter sections emit no block at their own position — their control was
    // placed above its first subscribing section in the interleave pass above.

    // No card: prose is what narrates BETWEEN the panels, so putting it in one
    // of its own would read as another result rather than as the text around
    // them.
    if (section.type === "markdown") {
      out.push({
        id: section.id,
        type: "Markdown",
        layout: { span: 24 },
        properties: { content: section.content },
      });
    }

    // download sections never reach here: a whole run compiles to one
    // Downloads card in the emit loop below, before sectionBlocks is called.
    return out;
  };

  // Emitted a gap group at a time — one section, or the several derivation put
  // on a single wrap line. A filter renders directly above its first subscribing
  // section and leads that section's group, so the two are separated by the
  // small row gap while the whole group is pushed off what precedes it.
  for (const group of gapGroups) {
    // A download run has no filter to interleave (filterBy is not a download
    // field) and compiles as one card rather than one block per section, so it
    // bypasses sectionBlocks entirely.
    if (group[0].type === "download") {
      bodyBlocks.push(...withTopGap([downloadsCard(group, endpointId)]));
      continue;
    }
    const blocks = group.flatMap((section) => [
      ...(filtersByFirstSubscriber.get(section.id) ?? []),
      ...sectionBlocks(section),
    ]);
    if (blocks.length > 0) bodyBlocks.push(...withTopGap(blocks));
  }

  return [...header, ...bodyBlocks];
}

export default compileReport;
