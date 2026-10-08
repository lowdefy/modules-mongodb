---
"@lowdefy/modules-mongodb-user-admin": patch
---

Inviting an address that already has a login but is not a member now sends the invitation. It was refused because the invite tried to copy the captured profile onto that user's row, which the engine allows only for a member. The contact is still written and linked to the user, and the user's row picks the profile up at their first profile save.
