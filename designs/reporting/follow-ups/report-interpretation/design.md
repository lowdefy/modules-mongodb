# Report interpretation section (DRAFT)

> **Status: draft.** A starting sketch and open questions, not a settled plan.
> Staying in sync with the report's active filters is the core requirement.

A report shows the numbers; it does not say what they mean. The idea: an
optional "interpretation" section — an AI-generated reading of the report ("sales
are up 12% quarter-on-quarter, driven by the West region; the East is flat and
worth a look") — that the user can **refresh on demand** so it reflects the
latest data rather than a stale snapshot.

Crucially, the interpretation must reflect the report's **currently-applied
filters**. If the viewer has filtered to one region and one quarter, the
interpretation must describe *that slice* — not the whole dataset. An
interpretation that silently reads the unfiltered data while the tables and
charts beside it show a filtered view would be actively misleading.

The reporting module already has an AI gateway connection (`ai` connection, the
`model` var) driving the chat assistant, so the model access this needs already
exists.

## Goal

A report section type — call it `interpretation` — that:

1. Takes the report's **already-resolved** section data — the exact rows the
   KPIs, charts, and tables are currently rendering — as its input.
2. Sends that data to the model with a "summarize/interpret" prompt, **told which
   filters are active** so the prose can name its own scope.
3. Renders the model's prose in the report, with a **Refresh** control that
   re-resolves against the current filter state and re-interprets.

## Why filters come for free — and where they don't

The report's filters (`filterBy` sections) are applied at *resolve* time: the
server builds the `$match` from the active filter values and every bound
section's rows already reflect it. So an interpretation built as a **consumer of
resolved rows** (point 1) automatically sees the filtered data — it never
queries anything itself, it reads what the sections read. That is the whole
reason to feed it resolved rows rather than have it re-query.

What does *not* come for free:

- **Scope awareness in the prose.** Seeing filtered rows is not the same as
  *saying* the numbers are filtered. The active filter selections (region =
  West, quarter = Q3) must be passed into the prompt so the model can open with
  "For the West region in Q3…" instead of stating a filtered figure as if it
  were the total. Without this, correct data reads as a wrong claim.
- **Staying in sync on filter change.** When the viewer changes a filter, the
  tables and charts re-query — but a previously-generated interpretation would
  now describe the *old* slice. It must be invalidated: either marked stale
  ("filters changed — refresh") or re-run as part of the same re-query the other
  bound sections do. A stale interpretation next to fresh charts is the failure
  mode this whole section has to avoid.

## What this can reuse

- **Resolved data is already in hand.** The interpretation runs *after*
  `resolve-report` has produced section rows — it reads those, so it adds no new
  query path and no new engine surface. It is a consumer of resolution.
- **Filter binding already exists.** An interpretation section is just another
  section that `filterBy`s the same filter(s) as the charts and tables, so it
  re-resolves through the same filter-state → re-query path the module already
  runs for a filtered chart/table. No new filter mechanism.
- **AI connection + `model` var** already exist for the assistant; the
  interpretation call goes through the same gateway.
- **Presentation contract.** An `interpretation` section slots into the existing
  section list the same way `kpi` / `chart` / `table` do.

## Open questions

- **How is the active-filter context framed for the model?** The resolved filter
  values are ids/values; the model wants readable labels ("West", not an id) and
  the field's meaning. The catalog and the query-sourced filter options already
  hold labels — the prompt should draw on them so scope is stated in human terms.
- **Re-run vs. mark-stale on filter change.** Auto-re-running on every filter
  change means a model call per change (latency + cost); mark-stale needs an
  explicit refresh. Which is the default, and is it configurable per section?
- **Which sections does it interpret?** The whole report, or a declared subset
  (e.g. "interpret the revenue chart and the pipeline KPI")? Interpreting
  everything risks vague prose; a subset needs a way to name sections.
- **Refresh cost and caching.** Cache the last interpretation with the
  filter-state + data snapshot it was made from, and show its as-of scope and
  time?
- **Determinism / trust.** Label it clearly as generated commentary over the
  data, grounded with "only state what the data supports", and ideally cite which
  sections (and which active filters) it drew on.
- **Does it save?** Persisted with the report, or always regenerated on
  open/refresh? If saved, it must record the filter scope it was generated under
  so a reader is not misled.

## Deliberately not in scope (yet)

Redacting sensitive fields before sending data to the model is a *separate*
concern from filters and is **not** part of this design — raised here only so it
is not confused with the filter-scope requirement above. If external-model data
egress needs controlling, that is its own design.

## Not yet decided

The re-run-vs-stale behaviour on filter change is the first thing to settle — it
determines how the section binds into the existing re-query flow. Everything else
is straightforward once that is fixed.
