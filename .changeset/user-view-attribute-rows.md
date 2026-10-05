---
"@lowdefy/modules-mongodb-user-admin": patch
---

The user view page shows member attribute rows whose visibility depends on other attributes or on the member's roles. An app's `fields.member_attributes` conditions read page state (`_state: member_attributes.*`, `_state: roles`) that only the edit dialog used to fill, so on the view page those rows stayed hidden, or showed when they should not. The page now copies the member's stored roles, member attributes and organisation tier into that state when it loads and whenever the edit dialog closes, so the Attributes card follows the same conditions as the edit dialog.
