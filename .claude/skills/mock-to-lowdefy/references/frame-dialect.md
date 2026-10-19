# The frame dialect

A frame is one self-contained HTML file whose `<style>` is `assets/frame.css`
copied **verbatim** — and nothing else. The dialect IS the Lowdefy layout
model: two element kinds, a 24-column span formula, mobile-first breakpoints.
Author to the dialect and the frame → YAML translation in the next phase is
mechanical.

## The two element kinds

- A **block** is `<div class="c">` (optionally `+ card`). If it has children it
  contains exactly ONE `<div class="r">` holding them. Blocks live only inside
  a `.r`.
- A **row** is `<div class="r">` — the content area of its parent block. It is
  always the single child of a `.c`/`.fi` block (or the page root directly under
  `<body>`).
- Page root: `<body><div class="r"><div class="c"> …page… </div></div></body>`.

## Spans, gaps, stacking

- **Column width:** `.c` defaults to span 24 (full row). Set `style="--s: 12"`
  for a 12/24 column at desktop; `--sm` for below 768px (defaults to 24 = stack
  on mobile). Siblings' `--s` should sum to 24 per visual row.
- **Compute spans from the mock's CSS column ratios**, never by eye:
  `1fr 1fr` → 12+12 · `1.25fr 1fr` → 13+11 · `1.5fr 1fr` → 14+10 ·
  `2fr 1fr` → 16+8 · `repeat(N,1fr)` → 24/N each · arbitrary `a b` →
  round(24·a/(a+b)). A ~17px quantization miss on odd splits is expected;
  pick the nearest span.
- **Gap:** `--g` on the `.r` (e.g. `<div class="r" style="--g: 16px">`) —
  applies both axes and feeds the child `.c` width math automatically. ALWAYS a
  px length; for no gap OMIT `--g` entirely — never a unitless `--g: 0` (it
  invalidates the span math).
- **Vertical stacks:** children of a `.r` default to span 24 — one per line,
  row-gap applies. There is no `flex-direction: column`; Lowdefy stacks this way.
- **Content-width items** (buttons, pills, brand marks, nav links): class `fi`
  instead of `c`.
- **Right-alignment:** class `sb` on the `.r` (space-between) — PREFERRED. A
  `<div class="sp"></div>` spacer only when a row has more than two groups
  (spacers translate to Lowdefy antipatterns).
- **Row alignment:** rows STRETCH children to the tallest sibling by default
  (same as Lowdefy). Class `top` on the `.r` top-aligns instead — required on
  any row whose children differ in height (titlebars, unequal column grids),
  else short children inflate. `mid` vertically centers; `ctr` centers both axes.

## Ids are the addressing system

- **Every `.c` and `.fi` carries a unique descriptive snake_case `id`** naming
  the AREA's role (`titlebar`, `kpi_strip`, `members_table`, `filters_card`) —
  not its type. Leaf placeholders name the content they stand in for
  (`title_text`, `refresh_btn`, `runs_table`). `.sp` spacers take no id.
- `assets/frame.css` renders each id on its element automatically — centered on
  `.ph` leaves, corner-tagged on containers — so a developer can open the
  rendered frame, point at any area by its id, and prompt for a change ("split
  `activity_body` into two columns", "remove `legend`"). You never write label
  markup, and the zero-text-nodes rule still holds.
- **These ids become the Lowdefy block ids verbatim** in the layout phase. Make
  them the real, descriptive ids you would want in the running app.

## Sizes live on leaves only

- **No width or height on containers** (`.c`/`.fi` with children) — a
  container's size must emerge from its children, paddings and gaps, exactly as
  it will in the Lowdefy app. If a mock container is taller than its content adds
  up to (CSS min-heights, stretched whitespace), absorb the slack by growing a
  `.ph` inside it — never by pinning the container.
- Explicit size lives ONLY on:
  - **`.ph` leaf placeholders** — height always (approximate the content they
    replace, round to 4px; a whole table / timeline / chart = ONE `.ph` at its
    height); width additionally when content-sized (buttons, pills).
  - **The untagged `.c shell` stub** — height = the mock nav's real height.

## Interaction states (modals, drawers, tabs, collapse)

When the mock has overlay or revealed content, add each state as a **separable
layer** so the frame can be rendered base-only or one-state-at-a-time:

- **Overlays (modal / drawer):** an `.ovl` layer wrapping exactly ONE `.c`
  panel. The panel is the ONLY container allowed inline width/height (it has no
  span context — its size IS its geometry):

  ```html
  <div class="ovl" data-ldf-layer="edit_open">
    <!-- centered: modal -->
    <div class="c card" id="edit_modal" style="width:560px">
      …panel content…
    </div>
  </div>
  ```

  `.ovl right` / `.ovl left` pin a drawer to that edge (the panel then takes
  height from the viewport and needs only a width). Modal panels center; the
  panel's content follows normal dialect rules (prefer a width-only panel whose
  height derives from its leaves).

- **In-place swaps (tabs / collapse):** the revealed panel gets
  `data-ldf-layer="<state-id>"` at its natural spot; the default panel it
  replaces gets `data-ldf-layer-hide="<state-id>"`. Both occupy the same slot in
  the tree.
- **Triggers stay in the base page** — the region that opens each state is
  ordinary base content; never move it into the layer.

## Structural invariants (get these wrong and the geometry silently breaks)

- **Zero text nodes** anywhere — every leaf is a `.ph`.
- A block (`.c`/`.fi`) is either a LEAF (usually `.ph`, no children) or contains
  EXACTLY ONE `.r` and nothing else. An `.r` never appears anywhere except as
  that single child (or the page root under `<body>`). Never nest an `.r`
  directly inside another `.r`.
- Every `.c`/`.fi` has a unique id.
- No inline width/height/min-height on a container. Width only on content-sized
  `.ph` leaves; the `.c shell` stub is the only container that keeps a height.
- **Never place a span-sized `.c` inside a `.fi` subtree** — a `.fi` shrinks to
  its content, so percentage spans inside it have no width base and collapse.
  Inside a `.fi`'s row use only `.fi` children; if you need spans, make the
  container a `.c` with a real span.
- Custom-property hygiene: `--g` is always a px length; `--s`/`--sm` are whole
  numbers 1–24. Malformed values silently fall back (`--g`→0px, spans→24) and
  wreck the geometry.

## Allowed inline styles — nothing else

`--s`, `--sm`, `--g`, `height`/`width` (per the leaf rule), `padding`, and
`max-width` + `margin` for a centered wrapper
(`style="max-width:1240px; margin:0 auto; padding:26px"`). No colors, fonts,
position, floats, grid, or own flex properties — those live in `assets/frame.css`.

## Shell chrome is excluded

The mock's top menu bar / sider / menu icons (logo, nav links, bell, avatar,
theme toggle) are NOT converted — a Lowdefy page shell provides them. If the
mock has a top nav, emit exactly ONE untagged stub as the first element of the
page root: `<div class="c shell" id="shell" style="height:<H>px"></div>` where
`<H>` is the mock nav's real height from its CSS. Nothing from inside the nav
appears in the frame.
