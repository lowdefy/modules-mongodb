# Phase 3 — fill the content slots

Third phase (mock → frame → layout → **content** → wire). The input is phase 2's
output: a Lowdefy page whose structure is final and whose content is labeled
`Html` placeholder slots, plus the ORIGINAL mock (html + css) that shows what
each slot looks like, plus the **design spec** (the behavioural half a static
mock can't show). The output is the same page with every slot replaced by a
real, visually-matched, mock-data-hydrated block — and a
`TODO(request-substitute)` trail for the wire task that swaps mock data for real
`requests:`.

Do not restructure the layout — phase 2's block tree, ids and `layout:` props
are a contract; you only replace slot blocks and fill properties. Keep the
multi-file layout (page + `components/*.yaml` via plain-path `_ref`); edit
content in place, moving a subtree into a new `components/` file only when your
content makes it large.

## Two co-inputs, two jobs

- **The mock is the VISUAL contract** — what each slot looks like.
- **The design spec is the BEHAVIOURAL contract** — what a static mock can't
  show: per-tab / per-state ownership (does each tab have its OWN filters and
  request, or one shared set?), shared-vs-per-instance data, conditional
  visibility, and data bindings. Consult it explicitly for every slot whose
  behaviour isn't visible in the mock. Neither input alone is enough; the frame
  stayed purely visual on purpose.

## Setup — build the slot ledger first

1. Read the page YAML. Every `Html` block with a sized `style` (height and/or
   width) is a content slot; its `properties.html` label = its id. Spacers
   (`flex: '1 0 auto'`, no size) are not slots — leave them alone.
2. Read the original mock html + stylesheet. For each slot, find the mock element
   it stands for (match by id name first, then position) and note WHAT it shows:
   text, numbers, pills, a table and its columns, a chart, a button and its
   label.
3. **Pre-decide the obvious block types from repo conventions** — don't ask when
   there's no real choice. Data table → `AgGridBalham` (the house grid theme,
   never Material/Alpine). Pager → the `Pagination` block. Search box → a text
   input. Chart → `EChart`. Repeated card/row list → `ListSelector`. Reserve a
   question only for a GENUINE fork (see the per-slot loop). Any slot that phase
   2 already mapped to a shared component or interactive container keeps that
   block — fill it, never retype it.
4. Present the ledger: `slot id · size · what the mock shows · chosen block ·
status`. Repeated instances of one template (`kpi1_value` … `kpi6_value`,
   List item slots) form ONE ledger row — decide once, apply to all.

Then walk the ledger top to bottom, one row at a time.

## No theme derivation

A module doesn't own the app theme. Do NOT open with "propose `theme.antd.token`
from the mock", and do NOT set app-level `theme.darkMode`, `algorithm`, or
`token` values from a module page — on an app with an established theme, a
mock/theme mismatch is expected, not a defect. **Match intent within the existing
theme.** If antd's derived value is close, leave it alone. Surface a genuine
divergence as a flagged SUGGESTION to the app owner ("the mock's buttons are
#b08d3e vs the app's primary — intentional?"), never an app-wide edit. (When the
skill really is bootstrapping a brand-new app with no theme, authoring the theme
up front is legitimate — but that is not the module case.)

## The per-slot loop

### 1. Block type — pre-decided, or one focused question

If step 3 pre-decided the block (convention or the design dictates it), state it
in the ledger and move on. Ask ONLY at a genuine fork — offer the two probable
types from the archetype table with a one-line rationale each, and let the user
name any other. One slot per question, never a wall.

Archetype starting points (the FIRST is the usual pick):

| The mock shows                              | Probable blocks                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Page/section heading (+ optional sub-line)  | `Title` / `Html`                                                                  |
| Body text, meta lines, captions             | `Html` / `Paragraph`                                                              |
| A button                                    | `Button` / `DropdownButton`                                                       |
| A pill / status badge                       | `Tag` / `Badge`                                                                   |
| A data table                                | `AgGridBalham` / `Table` (Balham is the house theme — never Material/Alpine)      |
| A tab bar                                   | `Tabs` / `ButtonSelector`                                                         |
| KPI number + label                          | `Statistic` / `Html`                                                              |
| Label/value detail grid                     | `Descriptions` (when it fits the mock's shape) / `Html` (freer key/value layouts) |
| A timeline / activity / log feed            | `EventsTimeline` (recipe below) / `TimelineList`                                  |
| Page controls (1 2 3 › or "showing x of y") | `Pagination` — always the block, aligned per the mock                             |
| A repeated card/row list                    | `ListSelector` (aligned per the mock) / `ControlledList` when items hold inputs   |
| A chart / sparkline / graph — ANY size      | `EChart` — pills → `Tag`, charts → `EChart`; don't hand-roll either from Html/CSS |
| An image / logo                             | `Img` / `Avatar`                                                                  |
| A breadcrumb line                           | `Breadcrumb` / `Menu`                                                             |
| An inline warning / callout                 | `Alert` / `Paragraph`                                                             |
| An empty/error state                        | `Result` / `Paragraph`                                                            |
| A modal / drawer / tabs / collapse          | keep phase 2's block — fill its slots, never retype it                            |
| A form control                              | the most specific input from `references/input-blocks.md`                         |

For TEXT-ish display (headings, body copy, meta lines, composite titles) `Html`
is a first-class choice, exactly as production apps use it. For CONTROLS and DATA
(buttons, inputs, tables, tabs, charts, key/value panels) use the native block —
don't approximate them with Html.

Button conventions: `properties.title` + an `AiOutline*` icon where the mock
shows one (Save=`AiOutlineSave`, Edit=`AiOutlineEdit`, Add=`AiOutlinePlus`,
Delete=`AiOutlineDelete`); styling via `color: primary|danger` +
`variant: solid|borderless|link` (never the deprecated `type:` prop);
`hideTitle: true` for icon-only buttons.

### 2. Look up the chosen block's schema via the `lowdefy-docs` MCP

The MCP is served by the dev server and is release-exact — core blocks AND the
project's local plugins. It is the source of truth for per-block knowledge:

- `lowdefy_list_types` (what exists) → `lowdefy_get_schema` (the real
  properties) → `lowdefy_get_examples` (worked config) →
  `lowdefy_search_docs` / `lowdefy_get_doc` (concepts, theming, style slots).

A schema lookup per block type you place is cheap insurance. Extract: the
`properties` schema, the theme tokens it responds to, the style slot keys
(`.element`, `.body`, …), events, and — for input/list blocks — the state/value
shape. The project's `plugins/` folder is already reflected in the MCP; a custom
block there beats a stock one.

### 3. Data, logic, visibility — one combined question (only when dynamic)

If the block displays data or behaves dynamically, ask the user once — or read it
straight from the design spec when the spec covers it:

- **The data:** entity, fields, cardinality, one example row/series.
- **Enums / lookup data:** does it read from an enum set (status → label/color)?
  Which values exist?
- **Operator logic:** derivations, formatting, mappings (`_state` reads,
  `_if`/`_switch`, date/number formatting) — described as intent; you pick the
  operators.
- **Visible condition:** should this block show only under some condition? The
  answer becomes the block's `visible:` with the operator expression.

Record the answers in the ledger. Static content (a heading, a fixed label)
needs none of this — skip the question.

### 4. Replace the slot: map visuals, hydrate mock data

Go back to the ORIGINAL mock element and make the block match it, climbing this
ladder and stopping at the first rung that works (each extra class/style is noise
for every later pass):

1. **`properties` first** — most visual intent maps to properties (title text,
   button color, tag color, `columnDefs` matching the mock's headers,
   `size: small`, icons).
2. **Theme — match intent, don't overfit.** antd derives a coherent system from
   its seed tokens; most of the mock's look is antd doing its job. If antd's
   value is close, leave it alone. A genuinely local deviation (one card unlike
   the rest) uses per-block `properties.theme` (a scoped ConfigProvider). Do NOT
   reach for app-level theme (see "No theme derivation"). Almost never write
   `style` on an antd block.
3. **Arrangement**: check `layout:` first (align/justify/gap/span already express
   most of it), then Tailwind `class`, then `style` — last resort only.

Two hard rules across everything you write:

- **Any html string** (Html block content, ListSelector/nunjucks templates) **is
  styled with Tailwind classes ONLY** — never a `style=""` attribute. SIMPLE
  arbitrary values (`h-[104px]`, `text-[13px]`, `bg-zinc-100`) compile — but
  arbitrary values containing FUNCTIONS (`bg-[linear-gradient(...)]`,
  `bg-[url(...)]`) do NOT reliably compile and render as nothing. Gradients and
  image backgrounds go on the BLOCK's `style:` instead
  (`style: { background: 'linear-gradient(135deg, #f3a072 0%, #ee6c4d 100%)' }`
  — quoted, because of the `#`).
- **Block-style YAML only** — every key on its own line; the only inline form is
  `{}`. **QUOTE every scalar containing a `#` anywhere** — not just at the start:
  `border: 1px solid #eef0f2` unquoted parses as `border: 1px solid` (the color
  becomes a YAML comment and every color on the page silently dies).

Replacement rules:

- **Keep the block id** and **keep `layout:` verbatim** (flex/span/sm — phase 2's
  geometry contract).
- **Keep interaction wiring**: Modal/Drawer blocks, their CallMethod triggers,
  and Tabs/Collapse titles are structure — fill their slots only.
- **Repeated lists**: a `ListSelector`'s content lives in its `properties.html`
  nunjucks template — replace the placeholder template with real row markup (keep
  the `bl-{{ index }}.*` id on the row root) and `properties.data` with realistic
  mock rows. If the user picks an INPUT block for anything inside the items,
  retype the list to `ControlledList`.
- **Drop the placeholder visuals** (the `bg-zinc-200` fill class, the label
  `class`/`html`). Keep explicit `height` only where the real block needs it (see
  data-slot sizing); otherwise the real content now defines the size.
- **Data-slot sizing**: a table/list/chart's frame height was a placeholder. Set
  the real size from app convention — a paginated `AgGridBalham` uses
  `height: 70vh`, not the mock's row-count height. Only fixed-chrome regions keep
  their exact frame height.
- **Hydrate with realistic mock data now** — hard-coded in `properties` or seeded
  via the page's `events.onInit` SetState (Lists: replace the `[{}]` stubs with
  realistic objects, keep the SetState key = the List id).
- **Wire the logic now**: operator expressions for the described
  derivations/mappings, and `visible:` for any condition — against mock state, so
  the behaviour is inspectable immediately. If a condition/mapping depends on
  future request data, its mock-state seed gets a TODO marker.
- **Mark every mock-data site** with a greppable TODO directly above it:

```yaml
# TODO(request-substitute) runs_table: "latest 20 crawl runs — status, started, duration, files changed"
rowData:
  - status: ok
    started: "2026-07-02 14:02"
    duration: 38s
    files: 12
  - status: error
    started: "2026-07-02 13:31"
    duration: 41s
    files: 3
```

One marker per data site, exactly
`# TODO(request-substitute) <slot_or_list_id>: "<data description>"` — the wire
task greps for these and swaps the mock data for `requests:` + operators.

### Validate as you go (against the running app)

The developer runs the dev server; the `lowdefy-docs` MCP serves live-app tools
against it. After each few replacements: `lowdefy_build_status` (build errors,
file:line) → `lowdefy_get_page_config` (bad block types surface here) →
`lowdefy_screenshot_page` (LOOK at the render vs the mock: geometry,
light/dark mode, charts drawn, pills intact, table widths, alignment) → fix.
Also run `pnpm ldf:b` for a build-only compile check. Never deliver YAML you have
reason to believe is broken; your final output must match what you verified.

## When no block fits — authoring a custom block

Custom blocks are a legitimate tool, not a failure — they're the right answer
when a slot needs real React behaviour. One question decides it: **is the gap
about how it _looks_, or about _behaviour_?**

- **Looks** — layout, spacing, colour, a static or data-bound _visual_ → that is
  config: `properties`, theme, composition of existing blocks, or `Html` +
  `_nunjucks`. Never write a block for how something looks.
- **Behaviour / state** → a custom block is fair game.

Behaviour that earns a block is **imperative/ephemeral React that the
declarative `_state` → re-parse cycle can't carry**: a `useRef`/`useEffect`, a
high-frequency ephemeral value (drag coords, caret, scroll offset, animation
frames), a subscription with cleanup (websocket, `IntersectionObserver`,
interval), or a third-party React lib's own lifecycle (editor, map, `react-dnd`,
canvas). "Needs state" alone is NOT it — which tab, which row, the filter value,
a derived total are all `_state` and operators.

Try the cheap rungs first (props → compose → `Html` + `_nunjucks` → an existing
published plugin), and reach for a block only when none can express the
_behaviour_. When you do, proceed inline — but leave a one-line note on the slot
so the escalation is never invisible:

```yaml
# CUSTOM-BLOCK <slot_id>: "<what it does>" — no block fits: <the imperative-state / lib-lifecycle reason>
```

Then hand off to your project's block-authoring skill (e.g.
`r:lowdefy-block-plugins`) to build it into the project's local plugin folder,
and return to finish the slot. Keep it **bridged to Lowdefy**: config in via
`properties`, results out via `setState`/`triggerEvent`, `methods` for imperative
control — only the ephemeral/imperative bits stay internal, so app-meaningful
state never hides inside the block. Build it as a reusable primitive if the
pattern recurs; a clean one-off is fine if it doesn't.

## After the last slot

1. Show the completed ledger: slot id → chosen block → data / enums / operator
   logic / visible condition (or "static") → TODO markers written.
2. Offer the shell as a final optional step: if the page hand-rolls
   `PageHeaderMenu`, `properties.title` / app `menus:` are still bare (a shared
   page wrapper already owns them).
3. Remind the developer of the next hop: the **wire** task replaces every
   `TODO(request-substitute)` with real `connections:`/`requests:` wiring
   (`design-tasks-ui` emits it; it resolves requests/operators against the same
   `lowdefy-docs` MCP).

## Production polish rules (recurring faults — treat each as a hard rule)

**Colour & mode**

- **Never hardcode text colors** (titles, labels, secondary text) — antd tokens
  color them correctly in both modes. In Html use `var(--ant-color-text)` /
  `var(--ant-color-text-secondary)`; for tinted backgrounds use antd palette vars
  (`var(--ant-blue-1)`), never raw hex.
- **Tag/pill colors via presets** (`color: green|red|blue|gold`) — preset tags
  adapt to dark mode; hex backgrounds don't.
- (Mode pinning and `algorithm: compact` are app-theme decisions — the module
  inherits them; don't set them from a module page.)

**Forms**

- Pick the most specific input from `references/input-blocks.md` (phone →
  `PhoneNumberInput`, password → `PasswordInput`, type-ahead → `AutoComplete`,
  segmented → `SegmentedSelector`) — never approximate with `TextInput`.
- Input with **no visible label** (switch rows, table-embedded inputs):
  `properties.label.disabled: true`.
- **Horizontal label + input**: one block via the label OBJECT —
  `properties.label: { title: …, span: N }` (span 24 = label above); never a
  separate text block next to the input.
- **Label subtext**: `properties.label.extra`; drop the colon with
  `colon: false`.
- **Toolbar/filter rows**: the controls' spans sum to 24 so they share the row.
- **Stacked input rows need little extra gap** (inputs carry built-in label +
  margin) — `gap: 0`–`8`, not 16+.

**Tables (AgGrid)** — the production idiom:

- **Every mock column appears** — including trailing action/button columns.
- **Sizing**: `flex: 2` + `minWidth` on the free-text primary column, fixed
  `width:` on every other; `defaultColDef: { sortable: false, filter: false,
resizable: true }` for mock data; the grid fills its card.
- **Rich cells via the `cell` shorthand**, not hand-rolled renderers: status pill
  → `cell: { type: tag, colorMap: { done: '#52c41a', in-progress: '#1677ff' } }`;
  dates → `cell: { type: date, format: YYYY-MM-DD }`; 2-line clamp →
  `ellipsis: 2`. Reserve an html `cellRenderer` for genuinely composite cells
  (two-line name+secondary, button cells) — palette/token colors, never raw hex.

**Lists & pagination**

- Repeated card/row lists → `ListSelector` (real data rows, template matching the
  mock's row layout), aligned as the mock shows.
- Any pager → the `Pagination` block, aligned per the mock. Never hand-build
  pagers from Buttons/Html.

**Timelines / activity / log feeds** — use `EventsTimeline` from
`@lowdefy/modules-mongodb-plugins` (declare it under `plugins:`). It renders
log-event records: each carries `type` + `date` plus `title` / `description` /
`info`, and `eventTypeConfig` maps each `type` to `{ color, title, icon }`
(react-icons `AiOutline*` names, antd palette hexes):

```yaml
plugins:
  - name: '@lowdefy/modules-mongodb-plugins'
    version: 0.11.0
# …
- id: activity_feed
  type: EventsTimeline
  properties:
    compact: true
    reverse: false
    disableContactLink: true    # mock data — no contact pages to link
    data:
      - type: file-changed
        date: '2026-07-09T14:02:00Z'
        title: File Changed
        description: Q3-report.xlsx updated
        info: 13 min ago
      - type: run-completed
        date: '2026-07-09T13:31:00Z'
        title: Run Completed
        description: 12 files scanned, 3 changed
    eventTypeConfig:
      file-changed:
        color: '#1890ff'
        title: File Changed
        icon: AiOutlineFile
      run-completed:
        color: '#52c41a'
        title: Run Completed
        icon: AiOutlineCheckCircle
```

**Charts — `EChart`, sparklines included**
Every chart-shaped visual (dashboard chart, mini sparkline, bar strip) is an
`EChart`, never Html/CSS shapes. Verify exact properties via `lowdefy_get_schema`
/ `lowdefy_get_examples` for EChart. Sparklines hide all chrome and size via the
block (`grid` at 0, axes `show: false`, `showSymbol: false`).

**Text & number fidelity**

- **Transcribe visible text EXACTLY** — currency prefixes ("R 12 400" not "ZAR
  12400"), labels, annotations, sub-lines.
- Titles with a sub-line: the secondary line is smaller (secondary color token).
- Statistic/KPI tiles: the label is visibly smaller than the value.

**Spacing fidelity**

- Repeated rows (category lists, sidebar items) copy the MOCK's row spacing —
  measure it, never default to a comfortable 16/24. The screenshot loop catches
  this.

**Alignment**

- Amount/total columns right-align when the mock does.
- Titlebar action buttons push fully right (keep phase 2's justify — content
  edits must not break it).
- `PageHeaderMenu` has a `properties.breadcrumb` — real apps prefer it; keep any
  measured breadcrumb block, but know the property exists.
