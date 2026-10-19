# Lowdefy layout engine (v5 / vite-hono line) — verified against source

This is the layout _discipline_ the pipeline depends on. The `lowdefy-docs` MCP
gives you per-block schemas and props; it does NOT teach any of the grid math,
the align/selfAlign shim, the breakpoint cascade, or the geometry anti-patterns
below. That is what this reference is for.

Every parent with `blocks:` wraps its children in a flex row (`lf-row`); every
child gets a wrapper (`lf-col` or a flex item). The child's `layout:` decides
its mode. **A child is in exactly one of two modes:**

- **Grid-col mode** (default): a column in a 24-wide grid,
  `flex-basis = span/24 · (100% + gap) − gap`. Default span 24 = full row.
- **Flex-item mode**: the moment ANY of `flex`, `grow`, `shrink`, `size` is set,
  spans are ignored and the child is a plain flex item (packs to content width).

**The default-span-24 trap:** children with no `layout:` are full-width rows
that stack. Any horizontal grouping needs explicit layout on every child —
`flex: '0 1 auto'` for content-width packing, or spans summing to 24.

## Parent (row) properties — under the parent's `layout:`

| Prop        | Accepts                                                                        | Default                   | Notes                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gap`       | number, `[x, y]`                                                               | 0                         | space between children; also feeds the span math — never subtract it yourself                                                                                                                                                                        |
| `align`     | `top` / `middle` / `bottom` / `stretch`                                        | **unset → CSS `stretch`** | children stretch to the tallest sibling unless you set `top`. The docs claim default `top`; the code says otherwise — trust this table. **This release DROPS a lone `align`** (deprecation shim misfire) — always pair it with the same `selfAlign`. |
| `justify`   | `start` / `center` / `end` / `space-between` / `space-around` / `space-evenly` | unset                     | Lowdefy names, not raw CSS                                                                                                                                                                                                                           |
| `direction` | `row` / `column` / …                                                           | `row`                     | vertical stacking already happens via span 24 — you rarely need `column`                                                                                                                                                                             |
| `wrap`      | `'wrap'` / `'nowrap'` / `'wrap-reverse'`                                       | `wrap`                    | **booleans are silently invalid**                                                                                                                                                                                                                    |
| `overflow`  | CSS overflow                                                                   | unset                     |                                                                                                                                                                                                                                                      |

## Child properties — under the child's `layout:`

Grid-col mode: `span` 0–24 (0 = `display: none`), `offset`, `order`, `push`,
`pull`. Flex-item mode: `flex` (string, passes verbatim; `true` → `'0 1 auto'`),
`grow` (default 0), `shrink` (default 1), `size` (flex-basis). Either mode:
`selfAlign: top|middle|bottom` overrides the parent's align for one child.

## Breakpoint cascade (subtle — memorize the table)

Breakpoints are mobile-first min-widths: sm 640, md 768, lg 1024, xl 1280.
The two viewports worth checking are 1440px (md/lg rules apply) and 390px
(base/xs).

1. Base is always span 24.
2. **Top-level `span` applies from md up** — below md the block is full width.
3. `sm: {…}` cascades DOWN to the base (applies at 390px!) and up until md.
4. `xs: {…}` is applied after `sm` and wins below 640px.
5. `md: {…}` merges with the top level; `lg`/`xl`/`2xl` are independent.

| Config                     | 390px | 700px | 1440px |
| -------------------------- | ----- | ----- | ------ |
| `span: 8`                  | 24    | 24    | 8      |
| `span: 8` + `sm.span: 12`  | 12    | 12    | 8      |
| `span: 14` + `sm.span: 24` | 24    | 24    | 14     |

Last row is the house idiom: desktop split, stacked on mobile. Because plain
`span` already stacks below 768px, `sm.span: 24` is technically redundant — but
write it anyway on every split (explicit beats implied, and `sm.span: 12`
variants for 2-up grids slot in naturally).

## Recipes

**Toolbar (content-width slots, right-aligned tail):**

```yaml
- id: action_bar
  type: Box
  layout:
    gap: 12
    align: middle # align always pairs with selfAlign (release shim)
    selfAlign: middle
  blocks:
    - id: bar_label
      type: Html
      class: flex items-center justify-center overflow-hidden font-mono text-xs text-zinc-500 bg-zinc-200 rounded-md
      layout:
        flex: 0 1 auto
      style:
        width: 120px
        height: 20px
      properties:
        html: bar_label
    - id: bar_spacer
      type: Html
      layout:
        flex: 1 0 auto
      properties:
        html: ""
    - id: clear_btn
      type: Html
      class: flex items-center justify-center overflow-hidden font-mono text-xs text-zinc-500 bg-zinc-200 rounded-md
      layout:
        flex: 0 1 auto
      style:
        width: 84px
        height: 33px
      properties:
        html: clear_btn
```

(Exactly two groups? `justify: space-between` on the parent replaces the spacer.)

**Two columns, stacked on mobile, top-aligned (columns hug their content):**

```yaml
- id: layout
  type: Box
  layout:
    gap: 16
    align: top # the pair — a lone align is dropped
    selfAlign: top
  blocks:
    - id: main
      type: Box
      layout:
        span: 14
        sm:
          span: 24
      blocks:
        # …
    - id: sidebar
      type: Box
      layout:
        span: 10
        sm:
          span: 24
      blocks:
        # …
```

**Full-width element between columns:** give it no span (or 24) — it takes a
full row; later siblings wrap to the next row.

## Anti-patterns (each one observed breaking a build or a layout)

- `wrap: true` / `wrap: false` — invalid CSS value, silently becomes nowrap.
- Raw CSS names in `align`/`justify` (`flex-start`, `flex-end`) — use the maps.
- Mixing grid-col and flex-item siblings in one row — legal, confusing; pick one.
- Omitting `align: top, selfAlign: top` on rows whose columns differ in height —
  the shorter column stretches to the tallest sibling (a 277px card rendered
  600px tall). With sizeless structural blocks this is THE geometry killer.
- A lone `layout.align` without `selfAlign` — this release's deprecation shim
  then DROPS the align entirely (verified in the dist): always write the pair,
  `align: top, selfAlign: top`.
- Width/height on structural blocks — sizes belong on Html slots only;
  containers derive from slots + paddings + gaps.
- Deprecated v4 names (`contentGutter`, `contentAlign`, `contentJustify`,
  `contentGap`, `align`-for-self, …) — warn at runtime; use
  `gap`/`align`/`justify`/`selfAlign`.
- Fixed pixel `width` on any slot wider than ~350px — overflows the 390px
  viewport; use flex + `maxWidth`.
