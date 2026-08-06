---
"@lowdefy/modules-mongodb-workflows": minor
---

The `date_selector` form component takes a `disabled_dates` var (object, optional), passed straight through to the block's `disabledDates` property (`min` / `max` / `dates` / `ranges`) so a field can block ranges like past dates. It is wrapped in `_build.if`, so `disabledDates` is only emitted when the var is set and existing callers are unchanged. This also applies to `date_range_selector`.
