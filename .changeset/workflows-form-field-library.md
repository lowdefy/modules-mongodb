---
"@lowdefy/modules-mongodb-workflows": minor
---

Extend the form-field library. Add a `phone` field (wraps `PhoneNumberInput` —
the form-side counterpart to the `phoneNumber` view field type), add
`disabled`/`extra` vars to `text_input`, and `disabled`/`theme` vars to
`button_selector`. Also migrate `location` off the deprecated
`layout.contentGutter` (→ `layout.gap`), which newer Lowdefy builds reject.
Together these let consuming apps author read-only text, themed toggles, and
phone inputs as first-class library components instead of raw blocks.
