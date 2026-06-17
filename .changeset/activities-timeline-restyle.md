---
"@lowdefy/modules-mongodb-activities": patch
---

Activities: restyle the `activities-timeline` rows for scannability.

Rows are restructured into a column layout: the activity title leads, with a smaller type-label pill on its right (the pill previously sat left of the title). The activity description renders as muted two-line-clamped text under the title (Tiptap HTML stripped, empty `<p></p>` docs hidden). The stage pill is replaced by plain stage-coloured text bottom-left, and the date bottom-right now shows the activity's scheduled date (`attributes.date`) instead of `updated.timestamp`. Rows get horizontal padding, rounded corners, and a hover background (theme-token based, works in light and dark).
