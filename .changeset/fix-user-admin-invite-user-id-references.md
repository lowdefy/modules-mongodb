---
"@lowdefy/modules-mongodb-user-admin": patch
---

Fix `invite-user` API resolving `_id`, `email`, and `profile.name` from the upsert response.

`MongoDBUpdateOne` does not return the document, so `_step: invite.value.*` was always `undefined` — the resulting event was logged with an empty title/contact reference, and the API returned `userId: null`. Added a `get-user` `MongoDBFindOne` step after the upsert that reads the user back by `lowercase_email`, and repointed the event display, `contact_ids` reference, and returned `userId` to it.
