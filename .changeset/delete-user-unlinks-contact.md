---
"@lowdefy/modules-mongodb-user-admin": patch
---

**A person whose login identity was deleted can now be re-invited and save their profile.** user-admin's Delete login identity hard-deleted the user row but left the person's contact pointing at the deleted user id. When an admin re-invited the person, they signed in under a new user id, and onboarding stopped with "We couldn't save your profile": the contact could not be claimed, because the claim only takes a contact with no `user_id`. `delete-user` now unsets `user_id` on the person's contact, stamped with `updated`, before it deletes the login, so the re-invited person's first sign-in claims the contact by address. Under `policy: tenant` it unlinks only the contact in the organization the instance administers.

Nothing to change in config to upgrade; upgrade every module and `@lowdefy/modules-mongodb-plugins` together, as always. Contacts that an earlier delete left linked stay stuck until their `user_id` is unset. To find them, list the contacts whose `user_id` names no user:

```js
db["user-contacts"].aggregate([
  { $match: { user_id: { $exists: true } } },
  {
    $lookup: {
      from: "users",
      localField: "user_id",
      foreignField: "_id",
      as: "user",
    },
  },
  { $match: { user: { $size: 0 } } },
  { $project: { email: 1, user_id: 1 } },
]);
```

Unset `user_id` on those contacts with `$unset`, never by setting it to `null`: the `user_id` index is unique and partial on `$exists`, so a stored `null` collides with the next unlinked contact.
