---
"@lowdefy/modules-mongodb-workflows": minor
---

`checkbox_selector` now validates `required: true` the way `multiple_selector` does. Its value is an array, and Lowdefy's built-in `required` treats an empty array as present — so a required checkbox group would let submit through with nothing ticked. It now appends the same required-non-empty rule the other array-valued fields use (`_array.length > 0`, message "This field is required.").

The component also gains a `validate` var, which it was missing entirely. Caller-supplied rules are concatenated ahead of the generated required rule, matching `multiple_selector`, `tree_multiple_selector`, `controlled_list`, `date_range_selector`, and `file_upload`.
