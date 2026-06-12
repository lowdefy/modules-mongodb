---
"@lowdefy/modules-mongodb-activities": patch
---

Activities: show the activity type as a coloured icon badge in the timeline instead of a text label pill.

The `activities-timeline` rows now lead with a circular, type-coloured icon badge (matching the pipeline wireframe) rather than the text type-label chip. Each badge SVG lives in its own file under `icons/` and is wired to a type via a new `path` field on the activity-type enum (`_ref: icons/phone.yaml`, etc.). The `path` field is optional; built-in types ship their glyph, and any type that omits it (e.g. consumer-defined types in the `activity_types` var) renders a default glyph. The type label is preserved as the badge's hover `title` for accessibility.
