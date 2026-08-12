---
"@lowdefy/modules-mongodb-workflows": minor
---

`controlled_list` form components now render the list `title` as HTML on the edit form, not only on the read-only surfaces. The core `ControlledList` escapes `properties.title`, so the component routes the title through a DOMPurify-sanitised `Html` block above the list. Plain-string titles work unchanged; an operator value (e.g. a `_nunjucks` template reading form state) resolves at render.
