---
"@lowdefy/modules-mongodb-ai-assistant": minor
---

ai-assistant: deleting a chat no longer destroys it

Delete chat removed the thread from the collection outright. It was the only hard delete left in
the repo — every other module that deletes its own documents marks them with a `deleted` change
stamp and filters them out of reads. A chat is the user's own record of what they asked and what
they were told, and the confirm added alongside this is a prompt, not a safeguard: it cannot
help the person who meant to click it and then wanted the thread back.

Deleting now sets the `deleted` stamp, which also records who deleted the thread and when, and
every read filters on it — the thread list, the resume-on-open lookup, the message replay, and
the rename and generated-title writes.

Decisions:

- The stamp is written from the module's own `defaults/change_stamp.yaml` rather than the events
  module's exported component, because this module declares no dependencies. Same choice, and
  the same shape, as ai-reporting — so a host app reads it with one predicate across every
  module.
- No restore control, and none planned here. The point is that the conversation survives a
  stray click; recovering one is an operator action against the collection. Adding a deleted-
  chats view would be a second feature, and pretending to offer recovery in the confirm would
  be worse than saying nothing.
- The confirm's copy changed with it. It used to say the chat was "deleted for good" and could
  not be undone, which is no longer true — it now says the chat is removed from the user's
  chats and cannot be opened again, which is what the user actually experiences.
- The read predicate is deliberately absent from `save-thread`'s filter. That filter drives an
  upsert, and `$exists` is not an equality clause, so a no-match would mint a second row under
  the same conversationId rather than skip the write. A save already in flight when the delete
  lands therefore rewrites the deleted row's messages but leaves the stamp intact, so the
  thread stays gone from every read. `deleted: null` is initialised on insert instead, so live
  threads have one shape.
- `disableNoMatchError` is set, and is load-bearing rather than tidy-up. `MongoDBDeleteOne`
  never complained about matching nothing, but `MongoDBUpdateOne` throws "No matching record to
  update." on a zero match unless the flag is set or the write is an upsert — so switching to
  an update would otherwise have turned two harmless cases into errors: deleting a thread that
  was minted but never sent in (no row exists until the first message is saved), and a repeat
  delete. Both now report zero modified, and a repeat can no longer overwrite the original
  stamp's who and when.

Minor rather than patch: existing rows are untouched and reads treat a missing `deleted` field
as live, so nothing needs migrating — but a consumer that counted on the collection shrinking,
or that reads the collection itself rather than through the module's endpoints, now sees
deleted threads and has to apply the same predicate.
