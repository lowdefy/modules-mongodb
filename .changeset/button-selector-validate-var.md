---
"@lowdefy/modules-mongodb-workflows": minor
---

The `button_selector` form component takes a `validate` var (array, default `[]`), wired to the block's top-level `validate` config. It mirrors the existing `text_input` pattern, so a button selector can carry field-level validation rules like every other input field. With the var unset, behaviour is unchanged.
