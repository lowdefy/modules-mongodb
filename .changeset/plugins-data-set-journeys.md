---
"@lowdefy/modules-mongodb-plugins": minor
---

Pages that use the plugin connections now run in Lowdefy data-set journeys.

- `EventsTimeline`, `WorkflowAPI` and `ReportingData` declare `meta.dataSet: redirect`, so a journey points them at its own database.
- `AiText` declares `meta.dataSet: external` and keeps calling the AI Gateway.
- These connections share one MongoDB client per URI but open the connection's `databaseName` on every request. Before, the first database opened on a URI was reused for every later request on it, whatever `databaseName` it named.
