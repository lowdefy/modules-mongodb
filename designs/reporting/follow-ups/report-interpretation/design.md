# Report interpretation section (DRAFT)

> **Status: draft.** A starting sketch and open questions, not a settled plan.
> The sensitive-data-filtering requirement is a hard constraint, not a nice-to-have.

A report shows the numbers; it does not say what they mean. The idea: an
optional "interpretation" section — an AI-generated reading of the report ("sales
are up 12% quarter-on-quarter, driven by the West region; the East is flat and
worth a look") — that the user can **refresh on demand** so it reflects the
latest data rather than a stale snapshot. Before any data goes to the model, it
is filtered so sensitive fields never leave the trust boundary.

The reporting module already has an AI gateway connection (`ai` connection, the
`model` var) driving the chat assistant, so the model access this needs already
exists.

## Goal

A report section type — call it `interpretation` — that:

1. Takes the report's _already-resolved_ section data (the same rows the UI
   renders) as its input.
2. Sends a redacted view of that data to the model with a "summarize/interpret"
   prompt.
3. Renders the model's prose in the report, with a **Refresh** control that
   re-resolves and re-interprets against current data.

## What this can reuse

- **Resolved data is already in hand.** The interpretation runs _after_
  `resolve-report` has produced section rows — it reads those, so it does not add
  a new query path or a new engine surface. It is a consumer of resolution, not a
  new producer.
- **AI connection + `model` var** already exist for the assistant; the
  interpretation call goes through the same gateway.
- **Presentation contract.** An `interpretation` section slots into the existing
  section list the same way `kpi` / `chart` / `table` do.

## The hard part: sensitive-data filtering

"Filter sensitive as well" is the load-bearing requirement, and it is not
obvious. Sending report rows to an external model is a data-egress event, so:

- **What counts as sensitive, and who declares it?** Candidate: the catalog
  already carries per-field metadata and is the authorization boundary — extend
  it with a `sensitive: true` (or a redaction hint) so the filter is declarative
  and lives with the field definition, not hardcoded per report.
- **Filter what, exactly?** Likely the model should see _aggregates and shapes_,
  not raw PII-bearing rows — e.g. a table's summary stats, not every customer
  name/email. A KPI or a chart's derived series may be safe where the underlying
  table is not.
- **Where does redaction run?** Server-side, before the gateway call, never
  client-side — the browser must not be trusted to strip fields.
- **Per-viewer gate still applies.** The interpretation must only see what the
  refreshing viewer is authorized to see, i.e. run through the same role gate as
  resolution — an interpretation must never leak a section the viewer couldn't
  open.

## Open questions

- **Refresh cost and caching.** Each refresh is a model call over live data.
  Cache the last interpretation with the data snapshot it was made from? Show its
  as-of time?
- **Determinism / trust.** An interpretation is model output over numbers — how
  is it labelled so a reader treats it as generated commentary, not fact? Does it
  cite which sections it drew on?
- **Prompt + grounding.** How is the data framed to the model so it interprets
  rather than hallucinates — structured rows with column meaning from the
  catalog, explicit "only state what the data supports"?
- **Does it save?** Is the interpretation persisted with the report, or always
  regenerated on open/refresh?

## Not yet decided

The sensitivity model (catalog flag vs. per-report declaration vs. aggregate-only
rule) is the first thing to settle — it gates whether this feature is safe to
build at all. Everything else is straightforward once the redaction contract is
fixed.
