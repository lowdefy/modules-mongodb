# Structural block model (v5 / vite-hono line) — verified against source

The layout phase uses this small block set plus the page shell. All ship with a
default Lowdefy app (no `plugins:`). This reference is the discipline the
`lowdefy-docs` MCP does not teach — where `style:` lands, the sizeless-structure
rule, the repetition family, and the page-shell compensation.

| Block                                      | Role                                                                                                          | Sizing                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Box`                                      | Every wrapper, row, column, grid, toolbar.                                                                    | NEVER width/height — spans, flex, gap, padding only.              |
| `Card`                                     | Bordered/filled panels: cards, tiles, sidebar panels.                                                         | NEVER width/height — height derives from `.body` padding + slots. |
| `ListSelector` → `ControlledList` → `List` | Vertical repetition of ≥3 identical stacked items, in that preference order (see below).                      | Sizeless; rows derive from their templates/slots.                 |
| `Html`                                     | **Every content slot** (text runs, buttons, tables, tab bars, charts, timelines, images) and toolbar spacers. | **The only block that carries width/height.**                     |

Frame element → block: `card` class → Card · a vertical repetition region → a
repetition block (or explicit sibling Boxes for a horizontal grid) · every leaf
`.ph` → an `Html` slot · everything else structural → Box.

## The fact everything hinges on: where `style:` lands

Every block renders as `<div id="bl-<blockId>">` (the layout wrapper) with the
component inside. **Flat `style:` keys apply to that wrapper** — a slot's flat
width/height pins its box regardless of the inner component. Dot-prefixed slot
keys (`.element`, `.header`, `.body`, `.content`, …) style a block's inner parts.

## Html (the slot block)

Every sized slot **renders its own id** so developers can see and point at slots
in the running app (verified recipe — copy it exactly):

```yaml
- id: runs_table # the frame's id, verbatim — the handle the
  type: Html # content pass uses to replace this slot
  class: flex items-center justify-center overflow-hidden font-mono text-xs text-zinc-500 bg-zinc-200 rounded-md
  style:
    height: 412px
  properties:
    html: runs_table # = the block id, always
```

- Why this works: flat `class` (like flat `style`) lands on the measured
  wrapper — the flex utilities center the inner html element, and the font/color
  utilities inherit into the label text. The `bg-zinc-200 rounded-md` classes
  give the slot a neutral placeholder fill (it is temporary — the content pass
  removes it). Tailwind is always available in Lowdefy v5; anything you write
  INSIDE an html string is styled with Tailwind classes only, never `style=""`
  attributes.
- Content-sized slots (buttons, pills, labels) add `width` and
  `layout.flex: 0 1 auto` (from the frame's `.fi`). Width > ~350px → use
  `maxWidth` + flex instead (390px viewport matters).
- Spacer variant: `layout.flex: 1 0 auto`, no style, no class, empty
  `properties.html` — spacers are invisible and unlabeled.
- A whole table / timeline / chart / tab bar is ONE slot at the frame's height.
  The content pass swaps in AgGrid / Tabs / Button / Title / charts later —
  those types do NOT appear in this pass.
- Structural blocks (Box/Card/List) are NEVER labeled — only the most-nested
  Html slots carry visible ids.

## Card

- Inner padding via the `.body` style slot:

  ```yaml
  style:
    .body:
      padding: 18px
  ```

  **`properties.bodyStyle` is v4 and does NOTHING in v5** — writing it silently
  leaves antd's default padding.

- Other slots: `.element` (surface), `.header`. No `title` in this pass — a
  header row is an Html slot inside the body.
- No height: card height = `.body` padding + slots + gaps. antd adds a 1px
  border and the app theme renders the surface — don't fight it with a forced
  background.

## The repetition family: ListSelector → ControlledList → List

Strict preference order for vertical repetition. Horizontal repetition is NEVER
a list block (row-mode item areas are auto-width flex children; spans inside
collapse to content width — measured 586px → 146px): use explicit sibling Boxes
with spans, one per instance (the frame already draws each instance).

### ListSelector — the default (display lists, no inputs in the items)

An input-category block (from the renderer): rows come from **`properties.data`**
(NOT page state — no onInit seeding), each row is an antd Card whose content
renders from the nunjucks **`properties.html`** template with `{ item, index }`
context. Items are NOT nested blocks.

- Structure-pass settings (all verified): `selectable: false` (selection is
  content behavior), `bordered: false` (row borders add 2px/row),
  `gap: <frame spacing>` (real row gap — no marginBottom hack needed),
  `overscan: 4000` (it virtualizes; keep placeholder rows in the DOM), and a
  `.body` style slot with `padding: '0'` (row body hugs the template box).
- The template carries the item id (`<div id="bl-{{ index }}.<item_id>" …>` —
  one instance per data row) and is styled with Tailwind classes only
  (`h-[104px] rounded-md bg-zinc-200 …`), never `style=""`. `properties.data`
  gets one `- {}` row per instance the frame drew.

```yaml
- id: folder_list
  type: ListSelector
  properties:
    selectable: false
    bordered: false
    gap: 12
    overscan: 4000
    data:
      - {}
      - {}
      - {}
      - {}
      - {}
    html: |
      <div id="bl-{{ index }}.folder_item" class="h-[104px] rounded-md bg-zinc-200 flex items-center justify-center overflow-hidden font-mono text-xs text-zinc-500">folder_item</div>
  style:
    .body:
      padding: "0"
```

### ControlledList — when the mock shows form inputs inside the items

A list-category block: renders **one content area per item** of the state array
at `state[<block id>]`, items are real nested blocks — plus antd List chrome and
add/remove buttons.

- Seeding: `events.onInit` fires ONLY on the page block. One SetState; key = the
  block id exactly; value `[{}, …]` with the instance count the frame drew.
  Wrong key or non-page onInit ⇒ zero items.
- Item ids use `$`: `expense_list.$.expense_item` → `expense_list.0.expense_item`,
  … .
- `properties.hideAddButton: true` in this pass — the Add Item chrome distorts
  geometry. `minItems` can pad short seeds; don't use it here.
- Spacing: `marginBottom` on the item template (`layout.gap` flows inside each
  item, not between items).

### List — the plain fallback

Same state-seeding, `$` ids and `marginBottom` mechanics as ControlledList,
without any chrome. Never `properties.direction: row`. Vertical stacking needs no
direction (item areas are block-level).

**A single placeholder region stays a single Html slot** — a timeline slot is
one Html block at the frame's height, even if the mock's pixels show repeated
rows inside. Expanding it invents structure.

## PageHeaderMenu (the page shell)

Production Lowdefy pages never rebuild nav chrome from blocks — the shell page
type owns the header (logo, menus, profile are content-pass concerns; here
`properties: {}`). Anatomy above your first block at a 1440px viewport:

```
64px  antd header (--ant-layout-header-height)
40px  hardcoded breadcrumb-spacer div (20px at 768–1023px, 12px below 768)
 0px  content element default padding-top (default padding '0 40px 40px')
────
104px = the minimum y of your first block, unless compensated
```

Compensation (the one sanctioned negative margin) on the page block:

```yaml
style:
  .content:
    padding: "0"
    marginTop: -46px # = shell stub height − 104
```

See `phases/02-layout.md` for the worked derivation (the content wrapper's
padding-top cancels; only the stub height matters). `.content` padding `'0'`
also removes the default 40px side padding so the wrapper's own
maxWidth/margin/padding reproduce the mock's x positions exactly.

No top nav in the mock → the page is a plain `Box` and none of this applies.

**Prefer the app's own page/layout component when one exists.** Many apps wrap
the page type in a shared layout component (e.g. `layout/page`) so page files
never declare `PageHeaderMenu` directly. The layout phase's shared-component
discovery decides this: if a page wrapper is available, `_ref` it and let it own
the shell; hand-roll the `PageHeaderMenu` + 104px compensation only when no
shared wrapper exists.

## Not in this pass

Everything content: `AgGridBalham`/`Table`, `Tabs`, `Button`, typography
(`Title`, `Paragraph`, `Markdown`), `Icon`, `Img`, `Tag`, `Avatar`,
`Statistic`, `Descriptions`, charts, inputs, `requests:`/`connections:`. The
content phase replaces the Html slots with these, by slot id.
