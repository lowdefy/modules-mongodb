---
"@lowdefy/modules-mongodb-plugins": patch
---

DataDescriptions renders nested array fields (controlled_list inside controlled_list) at any depth. Previously data below the first list level was silently dropped in form-config mode.
