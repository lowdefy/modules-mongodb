---
"@lowdefy/modules-mongodb-plugins": minor
---

The reporting analytics engine can now query nested and time-series data without weakening its read-only, single-collection compile boundary:

- Dimensions and measures accept an optional author-declared dotted `field` path into embedded sub-documents (defaults to the id; validated against a strict path pattern — no `$`, no leading digit, no empty segments — and never AI-supplied).
- Date dimensions accept `bucket` (`year`/`month`/`week`/`day`), compiled to a `$dateTrunc` inside the existing `$group` — time series without a pre-bucketed string field and with no new pipeline stage.

The AI-facing query spec is unchanged (it still references dimension/measure ids only) and the emitted stage set stays exactly `{$match, $group, $project, $sort, $limit}`. Arrays, object-arrays and cross-collection joins are handled outside the engine by pointing a dataset's `source.collection` at a read-only MongoDB view (see the new "reporting over complex data" guide).
