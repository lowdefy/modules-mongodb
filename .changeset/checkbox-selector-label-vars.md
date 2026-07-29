---
"@lowdefy/modules-mongodb-workflows": minor
---

The `checkbox_selector` form component takes `label_inline` and `label_span` vars, like the other field components. Previously its label was hardcoded to `span: 12 / align: right`, so a checkbox group could not sit inline with its siblings or use a different label width.

This changes the default rendering: with neither var set, the label no longer gets `span: 12 / align: right`, matching `yes_no_selector` and the rest of the library. An action that relied on the old look should declare `label_inline: true` and `label_span: 12` explicitly. `colon: false` is still hardcoded.
