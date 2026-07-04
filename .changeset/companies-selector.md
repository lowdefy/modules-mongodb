---
"@lowdefy/modules-mongodb-companies": patch
---

Company selector now consumes `request_stages.selector`. The stages are injected into the company-selector aggregation after the base active-company `$match` and before the label projection, so consumer stages can filter or derive on raw document fields — e.g. excluding app-specific soft-delete markers from pickers. Previously the var was documented in the manifest but never applied.
