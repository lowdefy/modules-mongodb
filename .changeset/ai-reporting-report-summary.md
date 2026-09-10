---
"@lowdefy/modules-mongodb-ai-reporting": minor
"@lowdefy/modules-mongodb-plugins": minor
---

ai-reporting: an on-demand AI summary of a report, as currently filtered

The report page's header gains an **AI summary** button that opens a drawer. Generate
asks the model for a short reading of the report's data and shows it as markdown with a
"Generated {time} · {scope}" line. The summary always describes the report **as filtered**:
the new `summarize-report` endpoint re-runs every data section's pipeline through the
catalog gate under the viewer's roles, with a server-built `$match` from the viewer's
active filter values honouring each section's own `filterBy`, and the prose opens by
naming that scope in the filters' own labels. Changing a filter (or Reset) marks a shown
summary stale rather than re-generating it; Refresh re-runs under the new selection.
Sections the viewer cannot query are left out and named in a "Not included" line.
Nothing is persisted.

The module gains an `ai-text` connection (type `AiText`, on the same `AI_GATEWAY_API_KEY`
secret as `ai`; remap it alongside `ai` when an app supplies its own gateway). The plugin
package gains the `SummarizeReportData` request on `AiText` — the one-shot call, which
throws on failure rather than returning null, since it answers a click — and two
`_analytics` methods, `summaryQueries` (per-section filter triples derived server-side
from the stored spec) and `buildSummaryInput` (capped per-section rows and the scope
line). `MAX_SUMMARY_ROWS_PER_SECTION` joins the constants.

Every saved report gets the feature on next open: no spec grammar, agent vocabulary or
stored-report migration changed.
