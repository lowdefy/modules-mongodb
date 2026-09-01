# Report visual polish

> **Status: settled.** Two independent passes settled this design from the same
> draft — one grounding it in a rendered report, a client-report corpus and the
> data-viz validator, the other in code-anchored probes of the ECharts theme
> layer — and this file is their reconciliation. The four open questions the
> draft carried are resolved against measured evidence in
> [`findings.md`](./findings.md); nothing below rests on an assumption about
> Flint, the block layer, or the app theme.

The open engine and `flint-chart` rendering make reports _correct_ and
_consistent_, but "consistent" is not the same as "good-looking". A saved report
today is a vertical stack of bare KPI numbers, tables, and compiled charts on the
page plane, with no containers, no comparison, and the stock ECharts palette. The
goal here is to raise the visual quality of what the module renders to something
that reads as a designed report rather than a dump of sections — **without
changing what the agent authors**: the section vocabulary and presentation
contract stay exactly as they are.

Relates to the [`ux/`](../../ux/design.md) wireframes (which framed the chat +
save-report flow) and the [`flint-charts`](../../flint-charts/design.md) design
(which made chart appearance compiled, not authored). This is the visual-quality
follow-up to both.

Inputs: a rendered 9-section report from the demo app, seven manually-built
client reports read for pattern (see [`findings.md` §6](./findings.md)), the
repo's data-viz guidance, and two probe passes ([`findings.md`](./findings.md),
[`probe.mjs`](./probe.mjs)). The design target is the deck in
[`wireframes.html`](./wireframes.html) — normative, judged section by section at
acceptance. The [`wireframes/`](./wireframes/README.md) canvas boards are kept as
**exploratory context**, not a target: they explored archetype layouts and two
spec additions this design rejects (see below).

## Goal

A report that a reader can scan in one screen and trust — grounded in what
`compileReport` can actually emit from the section vocabulary the agent already
has, with no new agent surface.

## Where the styling lives

Resolved. **The module owns nearly all of it.** Three vehicles carry this work:
`compileReport.js` for structure, `buildFlintOption.js`'s post-pass for
everything inside a chart the option pins, and one shared **ECharts theme
object** for what Flint leaves unset. Flint owns only the data→geometry mapping,
and its output is a plain mutable object we already post-process. The full layer
map — including the one thing that is genuinely not ours, the consuming app's
`colorPrimary` — is [`findings.md` §1](./findings.md).

The theme/option split is forced, not stylistic
([`findings.md` §3](./findings.md)): ECharts applies a theme _under_ the option,
and Flint pins the palette both as `option.color` and per-series, so **palette
and mark styling must be compiled server-side**, while **typography and axis
chrome ride the theme object** — one file
(`modules/ai-reporting/defaults/chart_theme.yaml`), set as `properties.theme` on
all three `EChart` render sites: the compiled report chart blocks, the chat
result card, and the expand modal. The latter two never pass through
`compileReport`, so the theme is the only vehicle that reaches them — and a
future theme change re-skins every surface without touching persisted options.

The corollary matters: **this design needs nothing from upstream and nothing
from the app theme.** It is not blocked, and it must not assume a particular
primary colour.

## The design

### One universal layout, derived from the section list

The agent emits an ordered list of typed sections and contributes no layout. That
stays true. **Layout is a pure function of section type, run position, and data
shape** — the compiler derives it, and there is nothing new for the agent to get
wrong.

No archetype field, no `layout:` key, no `width:` key, no density toggle.
Rejected because each adds a decision the agent or the saver would have to make
correctly — see [Rejected](#rejected) for the full argument against `width`,
which one of the two passes had proposed. This is the "one correct way" call:
the derivation is mechanical, so it cannot drift per report, and it
**re-computes on every open** — layout follows the data as it grows, instead of
freezing the shape the data happened to have on the day the report was saved.

The boundary of that claim, stated precisely: **per open, not per interaction.**
Filtered sections re-query per filter change, but the new option/height/rows
arrive through state bindings under a block tree that is fixed until the next
open — spans never move mid-session. That is safe because the first resolve
runs unfiltered, so the rows that decide "needs width" are a superset of
anything a filter later shows. If a filter ever gains a default applied at
first resolve, that superset assumption breaks and the derivation input must be
revisited.

The agent's intent channel is **section order**, which it already controls: two
narrow charts placed adjacent pair up; separated by a markdown section, they
don't.

A _run_ is a maximal sequence of adjacent same-type sections in spec order.
`compileReport` already walks sections in order; runs are the only new concept.

### The load-bearing change: sections become cards

Today every compiled block is a **sibling in one wrapping flex area** — the
"rows" are wrap lines, not containers, which is why `withTopGap` stamps its
margin on a group's first wrap line and why `filterSpans` must fill every line
exactly. Introducing cards means introducing the first real nesting into compiled
output:

```
before (flat siblings)              after (nested)
──────────────────────              ──────────────────────
Title   span 20                     Title  span 20  ┐ head row, still flat
Button  span  4                     Button span  4  ┘
EChart  span 24                     Card   span 24  ── contains the EChart
```

The head row stays outside the card — that is the corpus pattern (6 of 7
client reports put the heading above the card, not inside it). For full-width
sections it also stays flat, and `sectionHeading` / `sectionDownload` keep their
span-20/4 arithmetic. **Paired sections are the exception**: a head row is a
full 24-column wrap line, so two paired cards with flat head rows would each sit
beside a twelve-column hole. A paired section therefore compiles as a
**span-12 `Box` containing its own head row and card** — child spans re-base on
the wrapper, so the 20/4 split survives inside it, and the heading still sits
above the card.

Nesting inside a `Dynamic` fragment is **verified supported**, not assumed: the
runtime resolution builds fragments with the same recursive machinery as static
pages and validates nested slots recursively
([`findings.md` §8](./findings.md)). A stale comment in `compileReport.js`
("no wrapping Box — so the page's byId lookups reach them",
`brokenSectionBlocks`) predates that verification and should be corrected when
cards land — it is not a platform constraint.

`Card` and `Box` are already idiomatic in this repo (42 and 187 uses). Both must
join `report.yaml`'s `Dynamic` `properties.types.blocks` list — and the
verification sharpened what that list is: at runtime the check is membership in
the **app's client bundle**, and `properties.types` is what forces the bundling
at build. A consuming app that happens to use `Card` elsewhere masks a missing
declaration, so the demo can never catch this failure — **only the compile-time
test in the acceptance bar guards it** (item 8 below).

### Derivation rules

Spans are on the existing 24-column grid.

| Section run                  | Compiles to                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `kpi` × n                    | One tile row: n cards, balanced spans (`filterSpans` generalized, per-row cap 4) so every wrap line is exactly full |
| `filter` × n                 | Unchanged grouping (`filterSpans`, ≤ 3 per row), plus a Reset control and **one** shared scope line  |
| `chart`, needs width         | `span 24`, card                                                                                     |
| `chart`, doesn't need width  | `span 12`, card — paired 2-up with the next consecutive narrow chart                                 |
| trailing unpaired narrow     | promoted to `span 24`                                                                               |
| `table`                      | always `span 24`, card — tables never pair                                                          |
| `download` × n               | One "Downloads" card, `span 24`, buttons inside at `filterSpans(n)`                                  |
| `markdown`                   | `span 24`, **no card** — prose narrates between cards rather than sitting in one                     |

**"Needs width"** is decided from data the compiler already holds (`rows`, `x`,
`y`, `chart`, `stacked`):

- a temporal x-axis, or
- more than 8 categories, or
- more than 4 series.

A `pie` never needs width. Narrow charts pair; **tables never do** — a
half-width AgGrid is a horizontal-scroll trap, so even a 2-column table takes
the full row and lets `flex: 1` (below) spend the width on its columns. This is
a deliberate simplification adopted from the second pass; an earlier draft
paired ≤ 4-column tables.

`filterSpans` is reused rather than reinvented for both the tile row and the
download card: it already solves the exact problem (balanced rows, every wrap
line exactly full, `24/size` always whole), and its comment documents the bug
that a ragged trailing line causes in a flat flex flow. One change it needs: the
per-row cap is currently the baked-in `FILTERS_PER_ROW = 3`, and `filterSpans(4)`
with that cap yields a 2 × 2 grid of span-12 tiles — not the 4-up row the deck
draws and today's span-6 compile produces. The cap becomes a parameter:
**filters keep 3 per row, KPI tiles cap at 4** (the corpus and deck norm; five
tiles balance 3 + 2 and six balance 3 + 3, by the same arithmetic).

Promoting a trailing unpaired narrow chart to `span 24` is deliberate: a
half-width card with twelve empty columns beside it reads as a rendering fault,
which is worse than a slightly over-wide chart.

### KPI tiles

Each tile is a card: **label → value**, equal height from the card rather than
from the `Statistic`'s self-sizing (which is why the current row's labels sit at
different heights). Units belong on the number — `25.0` becomes `25.0%` from the
contract `format`, which already carries the descriptor.

**No delta, no sparkline, no caption.** Deltas and sparklines are what the
corpus does best and both are
[genuinely unreachable](./findings.md#7-what-remains-genuinely-unreachable): a
`kpi` section is one query returning one scalar, and a delta needs a second
resolved value for a shifted window that no part of the spec, `querySections`,
or the resolve path can express. An **inert** agent-written caption was proposed
as the cheap substitute and rejected — see [Rejected](#rejected). All of it is a
spec change, not a polish change, and pretending otherwise here would produce a
tile design that cannot be filled.

### The filter bar

Keep the grouping. Fix the text. `filterControlBlock` puts
`Also filters: <every other bound section>` in each control's label `extra`; the
code's reasoning is sound for one filter and does not survive the common case —
four filters each driving six sections renders **four near-identical three-line
grey paragraphs**, about 250px, more than any chart on the page.

Replacement: when every filter in a run drives the same section set, emit **one**
scope line under the bar. When they differ, keep the per-control note only on the
controls that actually differ. Plus a Reset, which 4 of 7 client reports carry and
the module has no equivalent of.

### Downloads

A run of `download` sections currently compiles to `span 6` Buttons at the page
bottom, wrapping 4 + 1 ragged, under no heading — and the report therefore
carries two unrelated download idioms, since chart and table sections already put
a `⤓` in their own head row. Group the run into one titled card. The `⤓`-in-the-
head-row idiom stays as-is and becomes the only one a reader has to learn for
per-section export.

### Chart internals

Split across the two vehicles the merge rule forces
([`findings.md` §3](./findings.md)):

**In `buildFlintOption`'s post-pass** — which already strips private keys,
overrides `barWidth`, moves the legend, and pins pie geometry, so the rewrite
point exists and is established practice in the file:

**Palette.** Replace the stock ECharts default, which
[fails four of five validator checks](./findings.md#4-the-palette-flint-ships-fails-the-reference-palette-passes)
on the real light card surface — including a normal-vision ΔE of 13.9 between
slots 2 and 3, meaning they are hard to tell apart _before_ colour-vision
deficiency is considered. Adopt the data-viz reference categorical palette,
validated against this repo's actual surfaces (`#ffffff` light, `#141414` dark):
both modes pass every check. (One pass had derived a bespoke 4-colour palette,
validated on its own surfaces — superseded by the 8-slot reference palette,
which covers the > 4-series charts stacked status data actually produces.
Re-validate against the final card surface at implementation.)

Two writes, not one: Flint declares the palette as `option.color` **and** as a
concrete hex on each `series[i].itemStyle.color`, and the per-series value wins on
bar and line. Setting `option.color` alone is a silent no-op there. A test should
assert **no stock hex survives anywhere in the option tree** — this is the kind of
half-fix that looks right in a diff and is wrong on screen.

The light-mode contrast WARN is not dismissable; it obligates visible labels or a
table view. A compiled report discharges it on both counts — every multi-series
chart carries a legend, and every chart section carries a `⤓` — and the design
states that deliberately rather than relying on it by luck.

**Colour identity is report-scoped, not chart-scoped.** Today hues are assigned
by series index within one chart, so `Done` is red in one section and green two
sections later. The rule, with its edges decided:

- **The union covers multi-series names and pie slice names.** Series names
  are humanized `y` column names; pie slice names are the `x` values — and
  both are entity names (a `Done / Cancelled` pie beside a stacked bar keyed
  on the same statuses is exactly the cross-section identity case). A
  single-series **axis** chart's name is its measure ("Total Revenue") — an
  identity shared with nothing — so single-series bar/line charts take a
  fixed slot (slot 1) and stay out of the union; putting them in would paint
  each one a different hue for no identity reason and burn the slots real
  shared identities need. Pies are exempt from that single-series rule: a pie
  colours per *slice* from `option.color` in slice order (it has no
  per-series colour), so each slice takes its union slot, and the capped
  "Other" slice (from the 6 + Other rule) always takes a **reserved
  muted/neutral colour**, never a categorical slot — an "Other" wearing a
  vivid identity hue reads as an entity it isn't.
- **Multi-series names assign from the union in first-appearance order**, so a
  name keeps its hue everywhere — "colour follows the entity, never its rank".
  This fixes the most jarring thing about the current render.
- **Past 8 union names, the overflow is assigned per chart** from the same
  palette (slots unused in that chart first). Names beyond the union lose
  cross-chart stability — with 8 hues there is no alternative that isn't more
  hues — but within any one chart slots stay unique. The earlier "fold the
  tail to Other" is dropped: at report scope the tail names live in different
  charts with nothing to fold together, and within one bar chart folding
  series means summing unrelated measures, which this file's own
  grouped-over-stacked rationale already rejects as meaningless.

**Mark styling** — verified JSON-safe ([`findings.md` §3](./findings.md)):
rounded bar caps (`itemStyle.borderRadius: [4, 4, 0, 0]`) — once per bar, not
per segment: in a stacked bar the segments are square and the cap goes on the
datum that ends the stack, chosen per category so a series that is zero there
doesn't take a corner nothing draws (rounding every segment pinches the
interior joins, which read as wrong on screen) — 2px lines with an
end-point symbol, a gradient `areaStyle` under single-series lines (a plain
`{ type: "linear", colorStops }` object — no functions needed), and pie slice
gaps (`borderWidth: 2, borderColor: <surface>`). All of it survives `strip()`
and JSON persistence.

**Legend orientation follows available width**, which turns the current defect
into the rule:

- `span 12` → horizontal band above the plot; `grid.right` reclaimed. A
  horizontal legend adds height Flint never budgeted (its `_height` was sized
  for a right-hand legend), so the post-pass adds the band's height to the
  canvas it returns.
- `span 24` → Flint's vertical right legend is _correct_ here, and `grid.right`
  (measured 79–163px, sized to the longest series name) is paying for something
  the reader gets. (The flint-charts design records legend-right as the fix for
  the absolute-`legend.left` defect; the conditional supersession at span 12
  gets a note there when this lands.)

**Both width-aware rules need a width input `buildFlintOption` does not have**
(`BASE_SIZE` is a constant today), threaded through every caller:

- `compileReport` passes the width the derived span gives.
- `api/chart-data.yaml` re-assembles the option per filter change, and its
  payload is untrusted client input — the section's width joins its
  `payloadSchema`, bounded to sane values (a lied-about width is only
  aesthetic, but the schema admits it deliberately).
- The chat path assembles **once**, at turn end, at the panel's ~420px — and
  that one option serves two surfaces, because the expand modal renders the
  persisted part option straight from state
  (`expand_chart_modal.yaml`: `option: { _state: expanded_chart.option }`);
  there is no assembly call at expand time to pass a second width to.
  Accepted consequence: the modal inherits the panel's more aggressive
  rotation, so an expanded chart can show rotated labels it would not need at
  three times the width — conservative, never overlapping, and strictly no
  worse than today. If that grates in practice, expand-time re-assembly (a
  `chart-data`-style call at the modal's width) is the named follow-up —
  real scope, not acquired quietly here.

**Label rotation.** Flint's rule, read off its source
([`findings.md` §5](./findings.md)): `rotate: 0` only when there are **≤ 4
categories and the longest label is ≤ 8 characters**, otherwise 90 — and the
available width is never consulted, so three 10-character labels with ~340px of
room each are set vertically, and a needless rotation also inflates
`grid.bottom` (61 → 91) and total height (277 → 307) and then collides with the
axis title `nameGap: 25` places beneath it. Override: compute available px per
category from the plot width the span actually gives (a conservative per-char
width estimate — there is no canvas to measure against server-side), and step
0 → 45 → 90. Flint only emits 0 or 90; 45 is the missing middle. Conservative on
purpose: an over-eager unrotation overlaps labels, which is worse than the tilt;
Flint sized `grid.bottom` for rotated labels, so the surplus after unrotation is
harmless padding rather than clipping. The e2e chart assertions gate this.

**Pie slices cap at 6 + Other**, matching the data-viz rule and the corpus's
worst failure (two client pies with ~20 slices each, leader labels overlapping
into an unreadable mat).

**In the shared theme object** (`defaults/chart_theme.yaml`, new): everything
Flint leaves unset — `textStyle.fontFamily` (the app's sans stack; `textStyle`
is `undefined` today, so every chart's type is visibly different from the text
around it), `axisLabel.fontSize` 10 → 12, axis line / split-line / label
colours, legend and tooltip text styling, `backgroundColor: transparent`.
Compiled options stay free of font names and axis colours.

How the one file reaches its three sites differs, and only two are `_ref`s: the
chat card and expand modal reference it directly from module YAML.
`compileReport` is plugin JS and cannot `_ref` module YAML, so
`api/resolve-report.yaml` loads the theme and passes it as a `compileReport`
parameter, which embeds it as `properties.theme` on each compiled chart block.
Filter re-queries then need nothing: `chart-data` swaps only the option under
the block, and the theme set at compile time keeps applying.

One consequence worth stating: chat chart **parts persist the compiled option**,
so palette changes reach old chat cards only via the theme — which the palette
deliberately does not ride. Accepted: old chat snapshots keep the palette of
their day, exactly as they keep their numbers; saved reports re-compile per open
and always get the current look.

**Tables.** `defaultColDef` gains `flex: 1`. This one change fixes both current
failures at once — the 2-column table with 600px of blank white, and the
6-column table clipped mid-header at the right edge.

## Rejected

- **`width: full | half` on sections (agent-authored layout).** Proposed by one
  of the two passes; rejected on three grounds. (1) A `width` freezes at save
  time while derived layout **re-computes per open** — the chart that tolerated
  `half` at 5 categories is unreadable at 14, and nobody edits the spec to fix
  it, whereas the derived rule promotes it the day it needs the room. (2) For
  the agent to use `width` well, the prompt must teach it when a chart tolerates
  half width — which is the derived heuristic rewritten as prose for an LLM to
  apply probabilistically instead of implemented once, deterministically.
  Ordering is already the agent's intent channel. (3) The asymmetry: adding
  `width` to a derived-layout compiler later is a backwards-compatible one-liner
  (key present → skip derivation); removing it once saved specs carry it is a
  breaking change that will never happen. **`width` is therefore the named
  escape hatch** if a concrete need for a pinned layout (e.g. a hero KPI — no
  corpus or production instance today) ever surfaces — deliberately not built
  ahead of one.
- **An inert `caption` on KPI tiles** (an agent-written display string,
  `110% of target · 128 deals`). Proposed as the cheap 80% of the corpus's
  delta pattern; rejected because it freezes at save time while the tile's
  value re-resolves per open and moves with filters — the caption drifts from
  the number it annotates. The bar for any future caption: **tied to data and
  refreshing when the data changes**, i.e. the computed form, which is a spec
  change (a second resolved query per tile) and its own design.
- **Layout archetypes / a density toggle.** New surface, new failure mode,
  speculative. Covered above.
- **Dual y-axes**, which 3 corpus charts use. It is the data-viz skill's #1 named
  chart mistake; `CHART_TYPES` cannot express it and must not learn to.
- **Styling anything from `colorPrimary`.** It belongs to the consuming app.
- **Per-tile deltas and sparklines.** Unreachable from a one-scalar `kpi`
  section; a spec change, tracked separately if wanted.
- **Table cell styling (status ink).** The ops canvas board's amber overdue
  counts read well, but "no enum-tag styling" is a standing presentation-
  contract decision; a `severity` hint would be the first cell-styling key and
  deserves its own argument in its own design, not a rider here.
- **Editing `docs/` to match this design.** `docs/` is the source of truth for
  consumer-observable behaviour; it gets updated _from_ the implementation, at
  the end, not ahead of it.

## Acceptance bar

"Looks good" is not the bar. These are:

1. `validate_palette.js` passes on both modes against `#ffffff` / `#141414`.
2. A test asserts no stock ECharts hex survives in any assembled option, on all
   three chart kinds — bar, line, pie — since the per-series override differs
   between them.
3. The demo's 9-section report drops from **7810px** to under ~4000px of scroll,
   with no section rendering smaller than its data needs.
4. Zero axis-label ↔ axis-title collisions across the demo report; zero clipped
   or under-filled table columns.
5. A series or pie-slice name that appears in more than one section has the
   same hue in both; a capped "Other" slice is neutral, never a categorical
   hue.
6. Side-by-side against [`wireframes.html`](./wireframes.html), section by
   section — not a subjective call.
7. `ldf:b` clean, and the report still resolves: the `Dynamic` `types` allowlist
   is the failure mode to watch, since a missed block type blanks the whole
   report rather than one section.
8. A unit test compiles a spec exercising every section shape (including the
   broken-section and owner-recovery branches) and asserts every emitted block,
   action, and operator type is declared in `pages/report.yaml`'s `Dynamic`
   `properties.types` — parsing the YAML in the test so the two can never
   drift. This is the only guard that works everywhere: at runtime the check is
   against the app's client bundle, so a consuming app that uses `Card`
   elsewhere masks a missing declaration and the demo can never surface it.

Mechanical gates run per phase: `ldf:b` and `pnpm e2e` — the chart-data and
report-render specs already assert compiled-option shape and section rendering,
and each phase updates their expectations deliberately, in the same change.
(3)–(6) need a running app with data, so they are `/r:dev-test` steps judged
with screenshots at PR review, not build-gate steps.

## Out of scope

- KPI deltas, sparklines, captions, and chart-associated stat strips in their
  strong form — all need spec changes
  ([`findings.md` §7](./findings.md)).
- The reports list, the chat panel, and the save-report sheet. Chart internals
  changes reach the chat panel because it shares `buildFlintOption` and the
  theme object, and that is intended — its 420px panel benefits from the same
  rotation and legend fixes — but its layout is not touched here.
- Dark mode. The theme object makes it _possible_ later (swap the file), but
  the app has no dark theme to match; the dark palette is validated so the door
  stays open, not because anything ships.
- `docs/ai-reporting` updates, which follow the implementation.

## Risks

- **The `Dynamic` allowlist.** `Card`/`Box` joining `types.blocks` is the one
  change that can blank a whole report — and the demo cannot catch the miss,
  because the runtime check is bundle membership and the demo bundles `Card`
  anyway ([`findings.md` §8](./findings.md)). It lands alone (step 3 below) so
  a failure is attributable, and acceptance item 8 is the standing guard.
- **Flint version drift.** The post-pass rewrites an option shape
  `flint-chart@0.5.0` produces; the dependency is pinned exactly, and the
  post-pass tests assert the pre-rewrite shape so a bump fails loudly, not
  silently.
- **Unrotation overlap.** A too-generous fit estimate overlaps labels.
  Mitigated by the conservative char-width rule, the 45° intermediate step, and
  e2e updates in the same change.
- **Theme/option interplay per chart type.** The merge rule is verified for the
  general case; a per-type surprise (e.g. pie label colours) shows up in the
  side-by-side and is contained to the theme file.
- **Ragged paired charts.** Chart height follows content (the contract is
  explicit), so two paired narrow charts can have ragged bottoms. Accepted: the
  wrap line top-aligns them, and pairing already requires both to be narrow. If
  ragged rows read badly in practice, a follow-up can pin paired plot heights;
  designing that now would be speculation.

## Shape of the work

Roughly, and in dependency order — `/r2:decompose` owns the real split. Steps
1–2 are the chart pass (no structural change, improves the chat panel on its
own); 3–6 are structure and chrome.

1. `buildFlintOption` chart internals (palette + two-write override, mark
   styling, legend, rotation, pie cap) **plus** the shared theme object wired to
   all three `EChart` sites — self-contained, testable without the block layer.
2. Report-scoped colour identity, which needs a report-wide pass over series
   names before per-section assembly.
3. Cards + the `Dynamic` types allowlist — the risky structural change, alone.
4. Derivation rules (runs, pairing, spans) on top of cards.
5. Filter bar text, downloads card, table `flex`.
6. Demo consumer exercising a report that hits every rule (a paired narrow pair,
   a wide temporal chart, a capped pie, a 6-column table, a download run), then
   docs.

## Related

- [`findings.md`](./findings.md) — the measured evidence: layer map, defect
  list, palette validation, rotation rule, corpus census.
- [`probe.mjs`](./probe.mjs) — re-runnable probes behind the theme-merge,
  JSON-safety and rotation findings.
- [`wireframes.html`](./wireframes.html) — the normative acceptance deck.
- [`wireframes/`](./wireframes/README.md) — exploratory canvas boards from the
  parallel pass; non-normative.
- [`flint-charts`](../../flint-charts/design.md) — established
  compiled-not-authored chart appearance and the post-pass precedent.
- [`ux/`](../../ux/design.md) — the original chat + save-report wireframes.
