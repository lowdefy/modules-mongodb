# @lowdefy/modules-mongodb-ai-reporting

## 0.36.0

### Minor Changes

- [#206](https://github.com/lowdefy/modules-mongodb/pull/206) [`7446425`](https://github.com/lowdefy/modules-mongodb/commit/7446425232dcd684914387e458af8d9315952d95) Thanks [@JohannMoller](https://github.com/JohannMoller)! - ai-reporting: rename the `reporting` module to `ai-reporting`, and declare the AI gateway plugin it needs

  The module is an AI surface — a chat that authors MongoDB pipelines against a catalog you
  supply, and saves the answers as reports — but `reporting` named it as though it were a
  static report renderer. `ai-assistant` already signals its nature in its name; this brings
  the reporting module in line, so the module list reads as what each module actually is.

  **Migration.** Point the `source` at the new path:

  ```yaml
  modules:
    - id: ai-reporting
      source: "github:lowdefy/modules-mongodb/modules/ai-reporting@v0.36.0"
  ```

  The entry `id` is yours to choose, and it is what scopes page URLs — `- id: ai-reporting`
  serves the chat at `/ai-reporting/chat`. Renaming the entry alongside the source is the
  recommended move and is what the demo and the docs now show, but it will break existing
  bookmarks and any hard-coded links into the module's pages. Keep `- id: reporting` if you
  would rather leave URLs where they are; nothing else depends on the entry being renamed.

  Nothing inside the module was renamed. The `reporting-data` connection, the
  `REPORTING_MONGODB_URI` and `REPORTING_DATA_MONGODB_URI` secrets, the `ReportingData`
  connection type, the `_analytics` operator, the `reporting-assistant` agent and the
  `lowdefy-reporting-catalog` bin all keep their names — so no connection remaps, no secret
  renames, and no catalog regeneration. Documentation moved from `docs/reporting/` to
  `docs/ai-reporting/`, which is the only change the catalog bootstrap CLI reflects: the
  header comment it writes into a generated catalog now cites the new doc paths.

  **The manifest now declares `@lowdefy/connection-ai-gateway`.** The module ships an `ai`
  connection (`type: AIGateway`) and the reporting assistant (`type: AIGatewayAgent`), both
  types from that package, but it never declared it — leaving each consuming app to know it
  had to add the plugin itself, and to pick its version. If you were adding it by hand you
  can drop it, unless your app declares an AI gateway connection or agent of its own.

  That gap had teeth. The plugin's newest stable release, `5.5.1`, keys agent tools by
  `endpointId` rather than by the configured tool `name`, and a module-scoped endpoint id
  contains a `/` — which providers reject against the tool-name pattern
  `^[a-zA-Z0-9_-]{1,128}$`, failing every chat turn with a 400 while the built agent config
  looked entirely correct. The manifest therefore pins an exact version rather than a range,
  because `^5` resolves straight back into the bug.

## 0.35.0

## 0.34.0

## 0.33.0

### Patch Changes

- [#199](https://github.com/lowdefy/modules-mongodb/pull/199) [`da8c876`](https://github.com/lowdefy/modules-mongodb/commit/da8c8765210b34894d9c91930289df0c35c25beb) Thanks [@JohannMoller](https://github.com/JohannMoller)! - layout: add a `full_bleed` var to the `page` component; reporting: fix the chat page under a header-bar `page_type`

  The chat page pinned its workspace to `100dvh`, which is only the height of the
  content area under `PageSidebarLayout` — the one page block with no header bar
  above the content. Under `PageHeaderMenu` or `PageSiderMenu` the workspace was
  taller than the space it had by the header's height, so the chat composer sat
  below the fold and the page gained a scrollbar. `header-menu` is the layout
  module's default `page_type`, so this was the default case.

  `layout`'s `page` component now takes `full_bleed: true` for a page whose content
  is the whole content area. It zeroes the content padding, applies the top offset
  the selected page type actually reserves, and publishes the remaining height as
  the CSS custom property `--layout-content-height`. Custom properties inherit, so
  content nested any depth down can size off it:

  ```yaml
  _ref:
    module: layout
    component: page
    vars:
      full_bleed: true
      hide_title: true
      hide_footer: true
  ```

  ```yaml
  style:
    height: var(--layout-content-height, 100dvh)
  ```

  `full_bleed` is applied under `content_style`, so a page can still add its own
  background or override an offset, and the two remain independent.

  All three page blocks reserve the same band above the content (the breadcrumb, or
  an empty spacer in its place), so the pull-up over it applies to all three.

  For `page_type: sidebar` the published values are `100dvh` and `marginTop: -40px`
  — what the chat page hard-coded before — so a sidebar host sees no change.

## 0.32.1

## 0.32.0

### Minor Changes

- [#124](https://github.com/lowdefy/modules-mongodb/pull/124) [`11049eb`](https://github.com/lowdefy/modules-mongodb/commit/11049eb9766d5836ae01847ec80e0da4d030e86c) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Add the reporting module: an AI assistant that answers questions and builds saved reports over an app's MongoDB data.

  **Open query engine.** The assistant authors read-only MongoDB aggregation pipelines over an app-supplied collections catalog — `$lookup`, `$unwind`, array work, window functions, faceting — with joins composed directly from catalog `relationships`. Safety rests on two layers: every pipeline is validated against three independent default-deny grammars (stages, aggregation expressions, `$match` query documents) plus resource caps, and then **reconstructed** so only nodes the validator explicitly approved reach the driver; the connection points at a read-only MongoDB principal. The catalog is both the assistant's data dictionary and its authorization boundary, bound at the connection so a request cannot substitute a wider one. (A pre-built MongoDB view can back a collection where a fixed grain or field hiding is wanted.) The engine is exposed as the `ReportingData` connection's `AnalyticsPipeline` request, the `_analytics` server operator, and a `DownloadCsv` action.

  **Charts.** Charts — in the chat results panel and in saved reports — are compiled server-side by the `flint-chart` compiler (pinned exactly `0.5.0`; its output shape is the contract), which derives axis names, label rotation, grid padding, colours and pie labels from the result rows. A chart section declares `chart` / `x` / `y`; the assistant contributes no chart config. A chart's canvas is a constant plot area plus the axis furniture its labels need, so heights vary between sections and a filter change can resize the section it re-queries. Two behaviours are documented in `docs/reporting/reference/presentation-contract.md`: bar charts over plain category labels render sorted by value descending regardless of the pipeline's `$sort`, and tooltips use the ECharts defaults because the compiled option travels to the browser as JSON. A bar chart accepts `stacked: true` to stack multiple `y` series into one bar per category (a validation error on `line`/`pie`). Two columns that humanize to the same display name — or an `x` column whose display name lands on `Measure`/`Value` — are rejected with the rename that fixes it. Filtered chart sections re-query through a `chart-data` endpoint (a chart needs a compiled option back, not rows); table sections use `query-data`. The plugin exposes `_analytics.buildFlintOption` (`{ chart, x, y, rows }` → `{ option, height }`, JSON-safe); `compileReport` takes a `chartEndpointId` alongside the other endpoint ids.

  **Report filters.** Reports support multi-select filters with `any`/`all` matching over scalar and array fields, and filters whose options are looked up from another collection rather than typed by hand — a foreign-key filter that shows names instead of ids, a pre-filtered list, or the distinct values of an array field. A looked-up list resolves on every report open, through the same pipeline validation and per-viewer role gate as any section's query. Two behaviours worth knowing: a bound filter matches **documents**, not array elements (a section that `$unwind`s the filtered array still sees every element of a matching document); and an options query's `valueKey` must project a string or number, because the value round-trips through the browser and an ObjectId would arrive back as a bare hex string that no longer equals the field — a non-scalar `valueKey` fails the options contract and renders as an Alert naming `$toString`. The catalog enum `values` a filter can fall back on are role-gated: a collection the viewer may not query contributes no options. The relevant caps are `MAX_QUERY_FILTER_OPTIONS` (500) and `MAX_ARRAY_LITERAL_LENGTH` (500, the pipeline **text** an `$in`/`$nin`/`$all` literal may hold), which sit under the pipeline byte and node budgets.

  **Catalog bootstrap CLI.** The plugins package ships a bin, `lowdefy-reporting-catalog`, that drafts a collections catalog from a live database — `pnpm exec lowdefy-reporting-catalog` in any app that installs the package. It depends on `js-yaml` (`mongodb` is a peer). See `docs/reporting/how-to/bootstrap-catalog.md`.

  **Data model.** Persisted report and conversation documents follow the repo's snake_case + change-stamp convention: `created` / `updated` are full change stamps (`{ timestamp, user: { name, id } }`), and fields use `conversation_id`, `data_parts`, and a `report_id` endpoint/URL parameter (the report page reads `?report_id=`). Model ownership is a named reference, `owner: { user_id, name }`, following the shape `deals.salesperson` uses: `owner.user_id` is the authorization key every scope filter and mutation matches, and `owner.name` rides along so a list row or report header can name the owner without a lookup — kept distinct from the `created` change stamp, since `owner` is current state and the stamps are history. Three fragments under `modules/reporting/defaults/` keep this mechanical rather than per-caller: `user_id.yaml` (the `sub ?? id` derivation, `_ref`'d by every read and write site so a writer and reader can never silently disagree), `owner.yaml`, and `change_stamp.yaml` (reporting declares no dependencies, so it carries its own stamp shape rather than the events module's, though the shape is identical). The report **spec** vocabulary (`optionsQuery`, `valueKey`, `labelKey`, `filterBy`) stays camelCase: a spec is a config DSL, closer to Lowdefy's own vocabulary than to a Mongo document. Names owned by the framework — `conversationId` (the `AgentChat` block property and agent-hook payload key) and `messages` / `steps` / `toolResults` (the `onFinish` payload) — are left as the framework spells them.
