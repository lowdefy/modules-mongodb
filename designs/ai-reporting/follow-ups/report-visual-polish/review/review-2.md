# Review 2

Scope: the material added in the review-1 resolution round (Box pairing, the
rewritten colour rule, width threading, the snapshot boundary), plus a fresh
read of the whole design. Three load-bearing claims from that round were
re-verified and hold: child spans re-base inside a container area (each area is
its own flex row and `--lf-span` is declared `inherits: false` exactly so span
cannot leak into nested columns — `@lowdefy/layout/dist/grid.css:26,36`), the
runtime fragment machinery recurses (review 1, finding 1), and filter sections
have no `default` key today (`validateReportSpec.js:280` — allowed keys are
`type, label, control, field, options, match, optionsQuery`), so the "first
resolve runs unfiltered" superset assumption is right about the present. Two
claims did not survive.

### 1. The expand modal has no assembly call to pass a width to

> **Resolved.** The design now states the truth: chat assembles once, at turn
> end, at the panel's ~420px, and the modal renders the persisted option — so
> it inherits the panel's rotation, conservative and never overlapping,
> strictly no worse than today. Expand-time re-assembly is named as the
> follow-up if it grates, not acquired here.

The width-threading list (under "Chart internals") says "the chat result card
and the expand modal pass their own widths". The modal cannot: it renders the
**persisted part option** straight from state
(`expand_chart_modal.yaml:25-33` — `option: { _state: expanded_chart.option }`),
and its own header comment says what expand buys is _width_ over the 420px
panel, at the height the original assembly returned. A chat chart is assembled
exactly once, at turn end (`emit-data-parts` runs the pipeline and emits the
part); the card and the modal then render that one option at two very
different widths. There is no second assembly to thread a width through.

So width-aware assembly for chat must pick **one** width, and the design must
say which and own the consequence. Assembling at the panel's ~420px gives the
card correct rotation but shows the modal — three times wider — labels rotated
as if space were scarce: the exact defect this design fixes on reports,
re-created on the expand surface. The honest cheap position: assemble at the
panel width, accept conservative rotation in the modal (rotated labels are
never _overlapping_, just unnecessary), and name expand-time re-assembly as a
follow-up if it grates. The expensive alternative — re-assembling on expand via
a new endpoint call — is real scope this design shouldn't quietly acquire.
Either way, the third bullet as written asserts a call site that does not
exist.

### 2. Pies are outside the colour-identity rule, and "slot 1" would paint them monochrome

> **Resolved.** As proposed: pie slice names join the union (slices are
> entity names; `option.color` written in slice order from each slice's union
> slot); pies are exempt from the single-series slot-1 rule, which now names
> bar/line explicitly; the capped "Other" slice takes a reserved neutral;
> acceptance item 5 extended to slice names. Deck note 3 — stale since the
> review-1 rewrite — brought in line at the same time.

The rewritten colour rule speaks entirely in **series names**. A pie has one
series and no per-slice colour — its slice colours come from `option.color` in
slice order (findings §3: pie's assembled option carries `tooltip, series,
color` and nothing per-slice). Two consequences the rule as written gets
wrong:

- "Single-series charts take a fixed slot (slot 1)" applied to a pie yields a
  monochrome pie — every slice the first palette colour. Pies must be exempt
  from the single-series rule; they consume the palette per _category_.
- Pie slice names are entity names — the statuses and types that appear as
  series in a stacked chart of the same report. A report with a `Done /
Cancelled / Pending` pie beside a stacked bar keyed on the same statuses is
  precisely the cross-section identity case the rule exists for, and the rule
  currently doesn't see it, because slice identities live in `x` values, not
  series names.

Proposed fix: pie slice names join the union on the same terms as multi-series
names (assign `option.color` in slice order from each slice's union slot), and
the capped "Other" slice (from the 6 + Other rule) always takes a reserved
muted/neutral colour rather than a categorical slot — an "Other" that wears a
vivid identity hue reads as an entity it isn't. Acceptance item 5 ("a series
name that appears in more than one section has the same hue in both") should
then say "series or slice name".
