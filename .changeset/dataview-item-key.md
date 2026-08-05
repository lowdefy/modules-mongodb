---
"@lowdefy/modules-mongodb-plugins": patch
---

DataDescriptions array fields accept an optional `itemKey` — a dot-notation key relative to each array item — that titles each item's collapsible card from the item's own data (e.g. `itemKey: name` shows `devices[i].name`). Cards fall back to `Item N` when `itemKey` is absent or the value is missing or empty.
