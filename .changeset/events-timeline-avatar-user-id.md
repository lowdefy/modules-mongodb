---
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-events": patch
---

**Fix: the events timeline showed no avatar for authors whose contact id is not their user id.**

`GetEventsTimeline` resolved each event author's picture by joining the contacts collection on `_id` against `created.user.id`. Contacts minted by the contact modules (`shared/contact/ensure-contact.yaml`, used by invites and the sign-in hook) get their own `_id` and link to the auth user through `user_id`, because a person holds one contact per organization. Those authors matched no contact and fell back to initials.

The join now matches `created.user.id` against the contact's `user_id`. The tenant wall still applies inside the lookup, so under `policy: tenant` only the caller's organization's contact is read. A contact whose `_id` equals its `user_id` resolves as before; a contact with no `user_id` no longer matches, and its events show the initials fallback.
