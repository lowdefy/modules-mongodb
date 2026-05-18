---
"@lowdefy/modules-mongodb-contacts": patch
---

Fix `contact-selector` validation reading from the wrong state path.

The `pass` rule was looking up state at `id | replace(".", "_")`, but state is bound at the dotted `id`. For nested IDs (e.g. `contact.user`), validation always saw `null` and failed/passed incorrectly. Uses the raw `id` for both `_state` lookups now.
