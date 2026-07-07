---
"@lowdefy/modules-mongodb-workflows": patch
---

Add `on_change` event support to workflow form field components

The `button_selector`, `number`, `radio_selector`, `checkbox_selector`,
`checkbox_switch`, `text_input`, `text_area`, `enum_selector`, `date_selector`,
`date_range_selector`, and `tiptap_input` field components now accept an
`on_change` var (mirroring `selector` / `yes_no_selector`) that wires to the
block's `events.onChange`. Previously these fields silently dropped any authored
field-level change handler, so form logic like "clear dependent field when this
one changes" only worked on a handful of field types.
