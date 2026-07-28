---
"@lowdefy/modules-mongodb-plugins": minor
---

Replace the reporting module's closed, structured-spec query engine with an **open query engine** over an app-supplied collections catalog.

The agent now authors near-arbitrary read-only MongoDB aggregation pipelines — `$lookup`, `$unwind`, array work, window functions, faceting — instead of filling in a fixed dimensions/measures spec that compiled to `{$match, $group, $project, $sort, $limit}`. Joins are composed directly from catalog `relationships` rather than being pushed outside the engine onto a pre-built MongoDB view (views remain available where a fixed grain or field hiding is wanted).

Safety comes from two layers rather than a narrow compiler: every pipeline is validated against three independent default-deny grammars (stages, aggregation expressions, `$match` query documents) plus resource caps and then **reconstructed** — only nodes the validator explicitly approved reach the driver — and the connection points at a read-only MongoDB principal. The collections catalog is both the agent's data dictionary and the authorization boundary, bound at the connection so a request cannot substitute a wider one.

**Breaking for plugin consumers:** the `AnalyticsQuery` request is removed. Use the `ReportingData` connection's `AnalyticsPipeline` request. New exports alongside it: the `DownloadCsv` action and the `_analytics` server operator.
