---
"@lowdefy/modules-mongodb-user-account": minor
---

**Joining an organization is now logged.** The accept-invitation page saves an `org-member-joined` event once the accept has gone through, through a new `log-member-joined` endpoint. The event lands in the organization the person joined, even when they stay active in another one, and names the person joining (`metadata.actor_user_id`, `subject_user_id`, `subject_email`, `subject_name`, `member_id`), the invitation (`invitation_id`) and who sent it (`inviter_user_id`, `inviter_name`); `user_ids` holds the joiner and the inviter. Its title renders from the `event_display` template for `org-member-joined`, which receives `user`, `inviter` and `organization`.

An accept retried after an interrupted first attempt (the invitation is already accepted) now enters the app instead of showing an error, and logs the join too. The event's id comes from the invitation, so it is saved once however often the page logs it. A failed log never blocks the accept.

Under `policy: tenant` the event is written through a new shared `user-events-system` connection that stamps the invitation's organization explicitly and change-logs into `log-changes-system`.
