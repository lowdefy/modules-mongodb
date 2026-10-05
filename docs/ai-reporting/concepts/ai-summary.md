---
title: The AI summary
module: ai-reporting
type: concept
concepts: [ai-summary, filter-scope]
---

# The AI summary

A report shows the numbers; the AI summary says what they mean. With the `ai_summary` var on, every report page carries an **AI summary** button in its header, beside ★ and ⋯. It opens a drawer where the viewer generates, on demand, a short model-written reading of the report's data — "sales are up quarter-on-quarter, driven by the West region; the East is flat and worth a look" — as markdown, followed by a **Generated {time} · {scope}** line.

It is page chrome, not a report section. The report body stays the module's deterministic surface, the prose is visibly a different kind of content in a different place, and there is nothing to author: no spec key, no agent tool, no change to any saved report. Once on, every report a viewer can open has the button.

## It describes the report as currently filtered

The summary never describes the whole dataset while the page shows a filtered slice. Generation re-runs every data section's stored pipeline server-side under the viewer's roles, with the viewer's active filter selections applied — each filter constraining only the sections bound to it through `filterBy`, exactly as on screen. The prose opens by naming that scope, and the drawer's scope line shows it in the filters' own labels:

```
Generated 3 September 2026, 14:12 · Region: West · Quarter: Q3 2026
```

Select and multiselect values sourced from declared `options` or catalog enum `values` appear as written; a filter whose options come from an `optionsQuery` shows each selected id's label; a date range shows its dates. With no filter active the line reads **All data — no filters applied**.

The summary is resolved at the moment Generate is clicked, so it can differ from numbers the page resolved earlier if the underlying data moved in between. The header's "Data as of" line and the drawer's "Generated" time each say when their figures were computed.

## Changing a filter marks it stale

When a filter changes — or a Reset clears a group — a summary already on screen is marked stale: the drawer shows a **Filters changed** notice with **Refresh** beside it. It is not re-generated automatically. A model call per filter change would spend prose nobody is reading (every step of a multi-filter selection, every change made while the drawer is closed), so the reading refreshes only when asked. Generate is likewise explicit on first open — the model call is always a visible, deliberate act.

## What the model sees

Per data section, in spec order: its label, type, the keys of its presentation contract, and its rows — at most 200 rows per section, with the true row count so a truncated section is disclosed to the model rather than mistaken for the whole. Markdown sections travel as author-written context. Download sections are not data and are left out.

A section whose query fails for this viewer — role-gated, or broken — contributes nothing, so the summary cannot describe data the page itself withholds. The response names such sections by label and the drawer shows **Not included: …** when any were left out. Labels only: the reason is the access model, not the reader's business.

## Nothing is saved

The generated text lives in page state. It survives closing and reopening the drawer and is discarded on navigation — including the module's own re-navigations after ★, rename or publish. Persisting prose would let saved commentary drift from live data or be read under a different filter scope than it was generated under.

## Configuration

The feature is **opt-in**: it is off unless the module entry sets `ai_summary: true`. Generating a summary sends a report's rows to a model, and whether that is acceptable is the app's decision, not the module's default. Off, the header renders no button and the `summarize-report` endpoint rejects every call, so the switch holds even for a caller that skips the page.

```yaml
modules:
  - id: ai-reporting
    vars:
      ai_summary: true
```

The call goes through the module's `ai-text` connection (type `AiText`, from [`@lowdefy/modules-mongodb-plugins`](../../plugins/index.md#aitext-connection)), keyed by the same `AI_GATEWAY_API_KEY` secret as the agent's `ai` connection, and uses the module's `model` var. An app that remaps `ai` to its own gateway remaps `ai-text` the same way:

```yaml
modules:
  - id: ai-reporting
    connections:
      ai: my-gateway-connection
      ai-text: my-ai-text-connection
```

The endpoint is exported as `summarize-report` and rejects unauthenticated callers. Protect it with the rest of the module's endpoints — see [Protect the pages and endpoints](../index.md#protect-the-pages-and-endpoints).
