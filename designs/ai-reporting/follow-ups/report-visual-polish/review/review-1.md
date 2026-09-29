# Review 1

### 1. The code records a flat-siblings constraint the cards change ignores

> **Resolved (auto).** Verified against the runtime source, not the demo: fragment
> building and validation both recurse into nested slots (`buildSubBlocks.js`,
> `validateFragment.js` `walkBlocks`), and resolved blocks are ordinary page
> blocks — the comment is not a platform constraint. Recorded as findings §8;
> the design now says the stale comment gets corrected when cards land. Bonus
> fact folded into the design: the runtime type check is app-bundle membership,
> so `properties.types` is a bundling *declaration* — a consuming app using
> `Card` elsewhere masks a miss, which the demo can never surface (see #7).

The design's load-bearing change nests every section's content in a `Card`, and
the broken-section compiler already carries a comment pointing the other way:
"Blocks stay flat siblings of the Alert — no wrapping Box — so the page's byId
lookups reach them" (`compileReport.js:664-666`, from commit `3fc937c5`). If
that comment states a real limitation of blocks nested inside the `Dynamic`
subtree — ids unreachable by `CallMethod`, state binding, or the recovery
buttons' wiring — it sinks or reshapes the whole cards approach, and the design
never mentions it. If the comment is over-cautious (id-based state binding is
nesting-agnostic in ordinary Lowdefy pages), it should be corrected when cards
land so it stops warning implementers off the pattern. Either way this is a
verifiable factual question the design should have answered, not left open: a
tiny demo probe settles it (nest a `Statistic` and a `Selector` in a `Card`
inside a `Dynamic` block; bind state into them and `CallMethod` at one).

### 2. Paired narrow charts contradict "head row stays flat and untouched"

> **Resolved.** Paired sections compile as a span-12 `Box` holding their own
> head row + card (child spans re-base inside the wrapper, so the 20/4 split
> survives; heading stays above the card, matching the corpus and the deck).
> Full-width sections keep the flat head row. The "untouched" claim is dropped
> from the design; deck notes 2 and 4 updated to match.

The design promises pairing "keeps `sectionHeading` / `sectionDownload` and
their span arithmetic untouched", but the head row is `Title` span 20 + `⤓`
span 4 — a full 24-column wrap line (`compileReport.js:615-633`). In the flat
wrap-line flow the design describes, two paired span-12 cards would compile as
Head₁(24) / Card₁(12) / Head₂(24 — wraps) / Card₂(12): each card sits beside a
twelve-column hole, which is exactly the rendering fault the design's own
trailing-promotion rule exists to prevent. Pairing therefore _requires_
touching the head-row arithmetic: either each paired section (head row + card)
is wrapped in a span-12 `Box` (child spans re-base on the wrapper, so the
20/4 split survives inside it — and `Box` becomes load-bearing, tying into
finding 1), or paired sections move their heading inside the card. The
derivation-rules section should decide the mechanism and drop the "untouched"
claim; the deck's plate 2 already draws the head _inside_ each half-width cell,
so the deck and the text currently disagree.

### 3. `filterSpans` reuse gives four KPIs a 2×2 grid, not the deck's 4-up row

> **Resolved.** `filterSpans` gains a per-row cap parameter: filters keep 3,
> KPI tiles cap at 4 (deck, corpus, and today's span-6 norm). Five tiles
> balance 3+2, six 3+3. Design's derivation rules and reuse note updated.

The design says the KPI tile row takes "spans from `filterSpans(n)`", reused
"rather than reinvented". But `filterSpans` bakes in `FILTERS_PER_ROW = 3`
(`compileReport.js:187, 201-211`): `filterSpans(4)` → `ceil(4/3) = 2` rows →
`[12, 12, 12, 12]`, a 2×2 grid of giant tiles. Today's compile is span 6
(`compileReport.js:1431`) — a 4-up row — and the deck's target plate draws
4-up (`m-row four`). As written, the reuse _regresses_ the most common KPI
count. The fix is to parameterize the cap (`filterSpans(n, perRow)`) and decide
the KPI per-row cap explicitly (4 matches the corpus and the deck; the filter
bar keeps 3), stating what 5–6 tiles do.

### 4. Report-scoped colour identity is wrong at both edges

> **Resolved.** The union covers multi-series names only; single-series charts
> take fixed slot 1 and stay out of it. Past 8 union names, overflow assigns
> per chart from slots unused in that chart — cross-chart stability is lost
> only for names past the cap, and "fold the tail to Other" is dropped for the
> reasons the finding gives (nothing to fold across charts; folding within a
> chart sums unrelated measures).

Series names are humanized `y` column names (`buildFlintOption.js:120-126`), so
they are shared identities only when the agent pivots entity values into
columns (Done/Cancelled). Two edges the rule doesn't survive:

- **Single-series charts pollute the union.** A report of six single-series
  charts ("Total Revenue", "Orders", …) assigns each a different hue for no
  identity reason — implying distinctions that don't exist — and burns the
  8 slots that real shared identities need. Single-series charts should take a
  fixed slot (slot 1) and stay out of the union.
- **"Past 8 names, fold the tail to Other" cannot work at report scope.** The
  tail names live in different charts, so there is nothing to fold together;
  and within one bar chart, folding series means summing unrelated measures —
  which the code itself rejects as meaningless (the grouped-over-stacked
  rationale at `buildFlintOption.js:136-141`). Decide the real overflow rule:
  e.g. the union covers multi-series names only, and past 8 the overflow
  reuses slots with the legend as the disambiguator (per-chart local
  assignment for names beyond the union), rather than a fold that can't exist.

### 5. Span-aware chart internals need a width input threaded through three call sites — one untrusted

> **Resolved.** The design now states the width parameter and all its callers:
> `compileReport` (span-derived), `chart-data.yaml` (width joins the untrusted
> `payloadSchema`, bounded), chat card and expand modal (own widths). Both
> riders added: horizontal legends add height to the returned canvas, and the
> flint-charts design gets a supersession note for legend-right at span 12
> when this lands.

Rotation-by-available-width and legend-orientation-by-span both require
`buildFlintOption` to know the width it renders at, and today it has no such
input (`BASE_SIZE` is a constant, `buildFlintOption.js:17`). The design treats
the chart pass as self-contained, but the width has to be plumbed through every
caller:

- `compileReport` — knows the derived span; straightforward.
- `chart-data.yaml` — filter changes re-assemble the option server-side per
  change, and its payload is explicitly untrusted client input
  (`chart-data.yaml:1-9`). The section's span/width must join `payloadSchema`,
  validated/bounded (a lied-about width is only aesthetic, but the schema
  must admit it deliberately).
- The chat card and expand modal — different widths (~420px panel vs. modal),
  currently implicit.

Two riders the design should also state: a horizontal legend above the plot
_adds height_ the post-pass must add to Flint's `_height` (which was sized for
a right-hand legend); and `flint-charts/design.md` records legend-right as the
deliberate fix for the absolute-`legend.left` defect (`e6463f7c`) — the
conditional supersession at span 12 should be noted there when this lands, per
the repo's update-the-design-first rule.

### 6. Layout derives from the unfiltered resolve and never re-derives within a session — say so

> **Resolved.** The universal-layout section now states the boundary — per
> open, not per interaction — why it is safe (first resolve is unfiltered, so
> the derivation input is a superset), and the trigger that would break it
> (a filter default applied at first resolve).

Filtered sections bind `option`/`height`/`rows` through state
(`compileReport.js:1404-1414, 1459-1476`) and `chart-data` re-assembles per
filter change, but the block tree — and every derived span — is fixed until the
next open. The design's headline argument is "derived layout re-computes per
open"; the boundary (per _open_, not per _interaction_) is nowhere stated, and
it matters: it is safe today only because the first resolve runs unfiltered, so
the rows that decide "needs width" are a superset of anything a filter shows.
One sentence in the derivation section fixes it — and flags that if a filter
ever gains a default applied at first resolve, the superset assumption breaks.

### 7. Make the allowlist mechanical, not vigilant

> **Resolved.** Acceptance item 8 added: a unit test compiles a spec
> exercising every section shape and asserts every emitted type is declared in
> `pages/report.yaml`, parsing the YAML in the test. Finding 1's verification
> made this stronger than proposed: the runtime check is app-bundle
> membership, so this test is the *only* guard that works in every consuming
> app — the risk section now says so.

The design names the `Dynamic` types allowlist as the single highest-risk line
and mitigates by sequencing ("lands alone"). That's vigilance where the repo's
own principle asks for mechanism. Add an acceptance item: a unit test that
compiles a spec exercising every section shape (including broken-section and
owner-recovery branches) and asserts every emitted block, action, and operator
type is ⊆ the types declared in `pages/report.yaml` — parsing the YAML in the
test so the two can never drift. The risk section then describes a build-time
failure, not a hazard to remember.

### 8. The theme's path into compiled blocks is unstated

> **Resolved.** The design now states the threading: two sites `_ref` the
> file; `resolve-report.yaml` loads it and passes it as a `compileReport`
> parameter, embedded as `properties.theme` per chart block. `chart-data`
> swaps only the option under the block, so filter re-queries need no theme.

`compileReport` is plugin JS; it cannot `_ref` the module's
`defaults/chart_theme.yaml`. The two chat YAML sites can reference the file
directly, but the compiled report charts need `resolve-report.yaml` to load the
theme and pass it into `compileReport` as a parameter, which then embeds it as
`properties.theme` on each chart block. The design's "one file, three
`properties.theme` references" reads as three refs; one of the three is a
threading through the resolve routine, and stating it also settles a question
an implementer would otherwise hit: filter re-queries swap only the option
under the block, so the theme set at compile time keeps applying — nothing in
`chart-data` needs to know the theme exists.
