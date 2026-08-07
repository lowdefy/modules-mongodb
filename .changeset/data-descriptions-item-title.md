---
"@lowdefy/modules-mongodb-plugins": minor
---

`DataDescriptions` now titles array-item cards from an `itemTitle` Nunjucks template rendered against each item (its fields are the template context, plus `_index` — the item's 0-based position), producing the title as HTML — so a title can reference multiple fields and emit markup. The list's own `title` is also rendered as HTML. Falls back to `Item N` when `itemTitle` is absent or renders empty.

**Breaking:** the previous `itemKey` property (a single dot-notation key) is removed. Replace `itemKey: name` with `itemTitle: "{{ name }}"`.
