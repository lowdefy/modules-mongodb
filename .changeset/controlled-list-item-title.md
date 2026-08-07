---
"@lowdefy/modules-mongodb-workflows": minor
---

`controlled_list` form components now accept `itemTitle` — a Nunjucks template rendered against each list item on the read-only view/review/overview surfaces to title the item's collapsible card. The item's fields are the template context (plus `_index`, the 0-based position), so a title can reference multiple fields and emit HTML. HTML in the list's own `title` is rendered too.

**Breaking:** the previous `itemKey` property is removed. Replace `itemKey: name` with `itemTitle: "{{ name }}"`.
