# Phase 2 — FRAME → Lowdefy structural layout

Second phase (mock → frame → **layout** → content). The frame is a 1:1 encoding
of the target block tree — same two-element structure, same 24-column math, same
breakpoint semantics, and every element already carries the id its block will
use. Translation is **mechanical**: walk the frame tree, apply the mapping
table, copy every number and id. Do not re-derive layout from the mock; do not
redesign; do not invent.

Read alongside: `references/lowdefy-layout.md` (engine mechanics),
`references/lowdefy-blocks.md` (block model, style slots, shell). Use the
`lowdefy-docs` MCP (`lowdefy_get_schema`) to verify interactive-container
property names (Modal/Drawer/Tabs/Collapse props, CallMethod methods) when the
mock has states. **This phase's mapping table and recipes are the LAW for
structure, layout and the shell** — never replace them with anything a docs
lookup suggests: `layout:` uses ONLY the props in the mapping table (span,
sm.span, gap, flex, align+selfAlign, justify); `contentJustify`/`contentGap` are
deprecated traps; the shell compensation and sizeless-structure rules stand
regardless of any schema.

## Step 0 — shared-component discovery (do this FIRST)

Real apps provide the page shell, breadcrumb, title bar, filter bar, cards and
pagination as **shared components**. Hand-rolling them from raw blocks is wrong
output. Before translating, map frame regions onto existing components, and
hand-roll ONLY regions with no shared equivalent. Discovery is mechanical (no
maintained inventory — the manifests ARE the inventory) and has two steps:

1. **Enumerate candidate component ids.** Read `exports.components` in every
   `modules/*/module.lowdefy.yaml` (the always-there fixed set is the `layout`
   module's exports — e.g. `page`, `card`, `floating-actions`, `auth-page`).
   Add the shared component files under `modules/shared/layout/` (e.g.
   `title-block`, `pagination`, `sort-filters`, `card`) and any app-local
   `/components/` folders. This is the INDEX — which components exist.
2. **Read the contract of each mapped component.** The manifest export carries
   only `id` + `description`; that is not enough to emit a correct `_ref`. For
   each region you map onto a shared component, open that component's YAML and
   read its `_ref` `vars`/`slots` interface — the actual keys you must pass. The
   `lowdefy-docs` MCP covers built-in _block_ schemas, but these composed
   components are repo source, so their contract lives in the component file.

Then: regions the frame tagged with `data-ldf-component`, and regions that
clearly match a discovered component (a titlebar → `title-block`, a pager →
`pagination`, the page shell → `layout/page`), become a plain-path `_ref` to
that component with its `vars`/`slots` filled. Everything else translates as
blocks below. Prefer a shared page/layout wrapper over hand-rolling
`PageHeaderMenu` + the 104px compensation.

## The architecture: structure is sizeless, slots carry the numbers

The output has exactly two kinds of blocks:

1. **Structural blocks** — `Box`, `Card`, the repetition family
   (`ListSelector`/`ControlledList`/`List`) and the page shell. They carry **NO
   width and NO height** (and no minHeight). Geometry comes from `layout:` (span,
   flex, gap, align) plus padding — matched to the frame with spans and layout
   mechanics, never pixel sizes. They also carry **no forced background** — the
   app theme renders their surface.
2. **`Html` placeholder slots** — one per frame `.ph` leaf. **This is where
   width and height live**, along with the frame's id, verbatim. The content
   phase replaces each Html slot with the real content block by pointing at that
   id — so the slot's explicit box is what makes the eventual conversion
   accurate.

Every sized slot renders its own id (`properties.html` = the block id, centered
via the label class) so developers see slot names in the running app and can
point at one. ONLY the Html slots are labeled — never structural blocks, never
spacers. Copy the slot recipe from `references/lowdefy-blocks.md` verbatim.

Because structural blocks are sizeless, two disciplines carry all the geometry —
get them right or containers inflate:

- **`align: top, selfAlign: top` (always the pair — a lone `align` is silently
  dropped by this release) on every row whose children differ in height** — rows
  stretch children to the tallest sibling by default; a 277px card WILL render
  600px tall next to a 600px column without it.
- **Slot sizes + paddings must add up**: a card's height is its `.body` padding
  plus its slots and gaps. The frame already encodes this; copy it.

## Ids are given, never invented

Block id = the frame element's `id`, verbatim — including dot-ids
(`kpi1.kpi_card`). The ONE exception: collapsing ≥3 repeated vertical instances
into a list block — the instances' ids become the ListSelector template id
`bl-{{ index }}.<item_id>` or the ControlledList/List item template
`<list_id>.$.<item_id>` (see the repetition rules).

Before the YAML, output a short manifest table: every frame region → block type
→ where its size comes from (or → the shared component it maps to). Then hold
yourself to it.

## The element mapping (apply mechanically)

| Frame source                                                                                                                                       | Lowdefy YAML                                                                                                                                                                                                                                                               | Must-copy notes                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `<div class="c">` + its inner `<div class="r">`                                                                                                    | ONE block, id from the frame. `.c` attrs → the block's sizing; `.r` attrs → its children's arrangement.                                                                                                                                                                    |                                                                                                              |
| `--s: N`                                                                                                                                           | `layout.span: N`                                                                                                                                                                                                                                                           | omit when 24                                                                                                 |
| `--sm: N`                                                                                                                                          | `layout.sm.span: N`                                                                                                                                                                                                                                                        | absent → add nothing (stacks by default)                                                                     |
| `--g: Npx` on a `.r`                                                                                                                               | `layout.gap: N` on the owning block                                                                                                                                                                                                                                        |                                                                                                              |
| `.r` class `top`                                                                                                                                   | `layout.align: top` AND `layout.selfAlign: top`                                                                                                                                                                                                                            | **without it, children stretch to the tallest sibling.** Always the PAIR: this release drops a lone `align`. |
| `.r` class `mid` / `sb` / `ctr`                                                                                                                    | `align: middle` + `selfAlign: middle` / `justify: space-between` / `justify: center` + the align pair                                                                                                                                                                      | any `align` needs its `selfAlign` twin                                                                       |
| `<div class="fi">` (container)                                                                                                                     | `layout.flex: 0 1 auto`                                                                                                                                                                                                                                                    | **NEVER omit** — a `.fi` without flex becomes a full-width row. No width/height.                             |
| `<div class="sp"></div>`                                                                                                                           | NO block — translate to `layout.justify` on the OWNING block: `[content, sp, content]` → `justify: space-between`; `[sp, content]` → `justify: end`. Empty Html spacer blocks are an ANTIPATTERN — emit one only in the rare multi-spacer row that justify cannot express. |                                                                                                              |
| class `card`                                                                                                                                       | `type: Card`, padding via the `.body` style slot                                                                                                                                                                                                                           | `properties.bodyStyle` is a v5 no-op. No height.                                                             |
| class `ph` (leaf)                                                                                                                                  | **`Html` slot**: frame id, style height (+ width if the frame has one), the placeholder fill class + label, `properties.html` = the id; `layout.flex: 0 1 auto` when the frame element is `.fi`                                                                            | the ONLY blocks that carry width/height — and the only labeled ones                                          |
| inline `padding` / `max-width` / `margin`                                                                                                          | same keys under `style:`                                                                                                                                                                                                                                                   | the full style budget for structural blocks                                                                  |
| a `.ph` whose content is a table / chart / list / tab bar / button / breadcrumb / timeline / descriptions / statistic / title / text / tag / input | a sized `Html` slot (the content pass swaps in the real block) — EXCEPT a button that TRIGGERS a state, which is a real Button (below). Never place content blocks in this pass.                                                                                           |                                                                                                              |
| `.ovl[data-ldf-layer]` overlay                                                                                                                     | Modal or Drawer block (per the panel) — see interactive containers                                                                                                                                                                                                         |                                                                                                              |
| `<div class="c shell">` stub                                                                                                                       | NO block — page `type: PageHeaderMenu` + the offset compensation below (or a shared page wrapper from Step 0)                                                                                                                                                              | no stub → page `type: Box`                                                                                   |

## Interactive containers (modal / drawer / tabs / collapse)

These are the ONLY content-like regions that must be REAL blocks in this pass —
the wiring has to work when a developer clicks. Follow the production idiom:
open/close is `CallMethod` + `toggleOpen`, never a `visible:` toggle.

**Modal / Drawer** (a frame `.ovl` layer): one block, id = the panel's id
verbatim, placed at TOP LEVEL of the page's blocks (a sibling of the content,
never nested inside its trigger). The panel's inline width → `properties.width`.
Its children translate normally (Html slots inside, sized). Closed at rest.

```yaml
- id: edit_modal
  type: Modal # Drawer for edge panels
  properties:
    width: 560 # the frame panel's width
    footer: false # geometry stays slot-driven
  blocks:
    - id: edit_form # …normal slot translation inside…
```

**The trigger** — the region that opens each state becomes a real `Button`
(never an Html slot), sized via `style`, its label = its own id (this pass has
no content text):

```yaml
- id: edit_button
  type: Button
  layout:
    flex: 0 1 auto
  style:
    width: 96px
    height: 36px
  properties:
    title: edit_button
  events:
    onClick:
      - id: open_edit_modal
        type: CallMethod
        params:
          blockId: edit_modal
          method: toggleOpen
```

**Tabs** — one `Tabs` block; the mock's base panel is the first slot, each state
layer another. Tab TITLES match the mock's visible tab labels exactly:

```yaml
- id: detail_tabs
  type: Tabs
  properties:
    tabs:
      - key: overview
        title: Overview
      - key: activity
        title: Activity
  slots:
    overview:
      blocks: [] # …base panel slots…
    activity:
      blocks: [] # …state layer slots…
```

**Collapse** — same shape with `properties.panels` + `slots`; `defaultActiveKey`
lists ONLY the panels open at rest. State-layer regions live inside the
Modal/Drawer/Tabs/Collapse — never duplicated in the base tree.

## No wrapper mountains

A Box whose ONLY child is another Box, where the parent adds nothing the child
couldn't carry (no span < 24, no padding, no distinct justify/align), must not
exist — merge the two (keep the ids you need, fold the gaps into the survivor).
Derive the LAYOUT, never mirror the frame's (or mock's) wrapper nesting
one-to-one. If the frame itself has a pointless chain, collapse it during
translation.

## Page shell and the 104px constant

(Only when you are hand-rolling the shell — prefer a shared page wrapper from
Step 0.) `PageHeaderMenu` renders a 64px header plus a hardcoded breadcrumb-
spacer that is 40px tall at 1440px, so content cannot start above y=104
uncompensated. Compensate on the page block; the content wrapper keeps the
mock's FULL padding:

```yaml
pages:
  - id: connection-runs
    type: PageHeaderMenu
    properties: {}
    style:
      .content:
        padding: "0"
        marginTop: -46px # T = shell stub height − 104
    blocks:
      - id: content
        type: Box
        style:
          maxWidth: 1240px
          margin: 0 auto
          padding: 26px 26px 80px
        layout:
          gap: 16
        blocks:
          # …page content…
```

**T = (the frame's shell stub height) − 104** — the wrapper's padding-top
cancels out; only the stub height matters. Stub 58 → `marginTop: '-46px'`.
Audit: first-region y = 64 + 40 + T + wrapper padding-top = the frame's
first-region y. This is the ONE sanctioned negative margin. Never rebuild nav
chrome from blocks; page `properties` stay `{}` in this pass.

## Repetition: grids vs vertical lists

**Horizontal grids (KPI strips, card grids) — explicit siblings, never a list
block.** (Row-direction lists render items as auto-width flex areas; spans
inside collapse to content width — measured 586px → 146px.) The frame already
draws each instance with its dot-id; translate them one by one.

**Vertical repetition (≥3 identical stacked instances)** — pick by the strict
preference order in `references/lowdefy-blocks.md`:

1. **`ListSelector`** — the default for display lists (no form inputs in the
   items). Rows from `properties.data` (one `- {}` per instance the frame drew),
   template markup carrying `bl-{{ index }}.<item_id>` and the item's box, styled
   with Tailwind classes only.
2. **`ControlledList`** — when the mock shows form inputs inside the items.
   Nested blocks, template id `<list_id>.$.<item_id>`, seeded from the PAGE
   block's `events.onInit` SetState (key = the block id, `[{}, …]` with the
   instance count), `properties.hideAddButton: true`, spacing via `marginBottom`.
3. **`List`** — the plain fallback. Same seeding, `$` ids and `marginBottom`;
   never `properties.direction: row`.

A single placeholder region stays a single Html slot even if the mock shows
repeated rows inside it — expanding it invents structure.

## Responsive collapse

- Every `span` < 24 pairs with `layout.sm.span: 24` unless the frame's `--sm`
  says otherwise (KPI `--sm:12` → `sm.span: 12`).
- No fixed `width` above ~350px on any slot — wide content-sized slots take
  `layout.flex: 0 1 auto` (or `grow: 1`) with `style.maxWidth`.
- Toolbars keep default wrap; the page must not scroll horizontally.

## Data-block slot sizes are placeholders

A table/list/chart slot inherits the frame's height in this pass, but that height
is mock-specific (a table drawn at 5-row height). The content phase overrides
data-block sizes with the app idiom (`height: 70vh` for a paginated table).
Only fixed-chrome regions keep their exact frame heights. Copy the frame height
now; the content phase decides which stick.

## YAML & html style rules (hard)

- **Block-style YAML only** — never flow/JSON-style maps or sequences
  (`layout: { span: 12 }`, `data: [{}, {}]` are both wrong). Every key on its own
  line; the ONLY allowed inline form is the empty object `{}`. Quote values
  starting with `#` (colors — `#` opens a YAML comment) and `'0'`.
- **Any html string is styled with Tailwind classes ONLY** — never a `style=""`
  attribute. Arbitrary values (`h-[104px]`, `bg-zinc-200`, `rounded-md`) compile
  from html strings.

## File layout — apps are folders, not one file

Real Lowdefy apps never inline everything. Write the output as MULTIPLE files
into the target module/feature source, consumed via plain-path `_ref`:

- The page: `pages/<page-id>/<page-id>.yaml` (kebab-case id, file named after
  it) — or, in a module, the module's page location.
- `pages/<page-id>/components/<snake_case>.yaml` — every modal, drawer, and any
  self-contained subtree bigger than ~40 lines, consumed at its spot with
  `- _ref: pages/<page-id>/components/<name>.yaml`.
- Register the page in the app/module manifest as normal.

Plain string-path `_ref` for the slot scaffolding you emit (a shared-component
`_ref` from Step 0 may carry `vars`/`slots` per that component's contract).

## Self-check

- [ ] Shared-component discovery done; regions mapped to existing components
      (page wrapper, title-block, pagination, …) before any hand-rolling
- [ ] Manifest table emitted; every frame region accounted for
- [ ] Multi-file output written into the module/feature source; plain-path
      `_ref`s resolve
- [ ] Every mock STATE has its real interactive block (Modal/Drawer/Tabs/
      Collapse) and a working trigger (Button + CallMethod toggleOpen, or
      tab/panel titles == the visible labels)
- [ ] Every block id copied verbatim from the frame (list templates excepted)
- [ ] ZERO width/height/minHeight on structural blocks; ZERO forced background —
      sizes only on Html slots (and inside ListSelector item templates)
- [ ] Every sized Html slot is labeled: `properties.html` == its block id, with
      the centering label class
- [ ] ZERO empty Html spacer blocks (right-alignment = layout.justify on the
      parent); ZERO single-child Box-in-Box wrapper chains
- [ ] Every `.fi` became `layout.flex: 0 1 auto`; every `top` row became the
      `align: top` + `selfAlign: top` pair (never a lone `align`)
- [ ] Card padding via the `.body` style slot; no `bodyStyle` anywhere
- [ ] Shell via a shared wrapper, or hand-rolled with `T = stub − 104` and the
      mock's full wrapper padding
- [ ] Vertical lists follow the preference order; ListSelector `data` rows ==
      instance count with the `bl-{{ index }}.*` template id; ControlledList/List
      seeded from the page onInit with the exact instance count
- [ ] Every span < 24 has its `sm` collapse; no fixed slot width > 350px
- [ ] Block-style YAML throughout; html styled with Tailwind classes only
