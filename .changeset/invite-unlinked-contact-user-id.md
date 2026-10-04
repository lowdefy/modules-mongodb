---
"@lowdefy/modules-mongodb-user-admin": patch
"@lowdefy/modules-mongodb-user-account": patch
---

Inviting a second new person no longer fails while the first has not yet accepted. A person record created for an invitee who is not yet a user stored an empty user link, and the unique index on that link allows only one such record per organisation, so every later invite of a new address failed with "Something went wrong." until the first invitee signed in. The record now leaves the link out, as a person record from the contacts module does, and is linked when the invitee first signs in as before. When creating the record fails for a reason other than two sign-ins or invites racing for the same address, the invite now fails with that error instead of a later, misleading one.
