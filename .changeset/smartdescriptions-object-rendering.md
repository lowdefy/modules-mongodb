---
"@lowdefy/modules-mongodb-plugins": minor
---

SmartDescriptions: render plain objects and arrays of objects instead of crashing (React error #31).

- New generic `object` field type in the registry (priority 99, after the specific object shapes): renders unknown objects as label/value rows, each value recursing through its own detected field type via a `renderNested` callback now injected into all registry renderers. Reference-style objects (`name` / `label` / `title`) display their label field only.
- `processFields` now skips fields with `visible: false`, matching Lowdefy block semantics.
- Empty state keeps rendering the Descriptions header (title / extra) with a muted "No data to display" item, instead of dropping the title.
- Auto-discovery (data mode) behavior change: single unrecognized objects now render as one row of nested label/value rows instead of flattening into dotted-key rows.
