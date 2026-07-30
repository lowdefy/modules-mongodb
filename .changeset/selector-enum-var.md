---
"@lowdefy/modules-mongodb-workflows": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Five selectors in the form-components library — `selector`, `multiple_selector`, `button_selector`, `radio_selector`, `checkbox_selector` — now take an `enum` var as an alternative to `options`. An enum map (`slug → { title, color, icon }`) is converted to options for you: the title becomes the label, the slug is the stored value, the colour tints the selected value and the icon shows on a `multiple_selector` tag. `options` wins when both are set, and an operator-valued `enum` (`_global: enums.x`, `_module.var: y`) still resolves. `tree_multiple_selector` stays `options`-only: a flat enum map cannot express the `primaryKey`/`parentKey` hierarchy it exists for, and for flat choices `multiple_selector` renders enum colours and icons that the tree drops.

On read-only surfaces, an enum-driven selector now shows the entry's title. The `DataDescriptions` block reads the field's `enum` map off the form config and renders the matching entry's `title`, colour and icon instead of formatting the stored slug — so a `status` of `in-progress` with title "In progress" no longer displays as "In Progress". Overview action cards carry the `enum` map through, so they resolve too. Nothing else changes: an `options`-driven selector, an unknown value, and a field with no `enum` all keep their existing display.

**Breaking:** the `enum_selector` component is removed — it was a `Selector`-only special case of what `selector` + `enum` now does. Replace `component: enum_selector` with `component: selector` and keep the same `enum:` map. Two behaviour differences to expect: the label is no longer hardcoded to `align: right / span: 12` (declare `label_inline` / `label_span` if you relied on it), and the enum's colour now actually tints the selected value, which the old component's option shape never did.
