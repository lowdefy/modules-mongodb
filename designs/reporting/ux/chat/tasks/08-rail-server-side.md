# Task 8: The rail's server side — a 200-conversation window and a soft delete

## Context

The conversations rail is titles only: no search, no recency grouping, no rename, no delete.
Rename already has an endpoint (`set-conversation-title`). The other two need server work.

**`list-conversations.yaml`** finds `{ owner.user_id: _user.id }` sorted
`updated.timestamp: -1`, `limit: 30`, with an **exclusion** projection
(`data_parts: 0, messages: 0`). Two things follow:

- `updated` **already comes back** — the projection excludes only the two heavy fields, so the
  design's requirement that the endpoint return `updated` for the sort and the group assignment
  is already met. Do not add an inclusion projection; that would drop fields the rail needs.
- The `limit: 30` is the problem. Filtering `items` client-side searches whatever the endpoint
  returned, so at two hundred conversations, searching for one from last month returns nothing
  with no sign that the search was scoped rather than unsuccessful — the worst shape of empty
  result — and "Older" shows the tail of a fortnight rather than the archive the label implies.

**Decision: raise the cap to 200 and keep the filtering client-side.** The endpoint already
projects `messages` and `data_parts` away, so 200 title-and-timestamp documents is a small
payload and the cap keeps doing the job its header comment gives it. Server-side search —
passing the term through and `$match`ing before the sort — is the other answer, and it is
machinery bought on a guess: it needs a debounced round trip per keystroke and a second code
path for the unsearched list, to serve a conversation count nobody has yet. If a real complaint
appears it is an additive change behind the same `Search` block. What the design owes in the
meantime is honesty in the copy, which is the page's job (task 13).

**There is no delete of any kind** for a conversation. `delete-report.yaml` is the template,
including the two things that make it correct: `deleted.timestamp: { $exists: false }` in the
filter so a repeat delete reports 0 modified rather than overwriting the original stamp's
who/when, and `disableNoMatchError: true` so a caller who may not do this matches nothing
instead of receiving the filter, the file path and a stack trace in an error body.

Task 7 initialised `deleted: null` on both conversation writers.

## Interfaces

- **Consumes:** `deleted` initialised on insert (task 7).
- **Produces:**
  - `list-conversations` — own-only, soft-deleted excluded, the 200 most recent, each document
    carrying `_id`, `title`, `owner`, `created`, `updated`, `deleted`.
  - `delete-conversation` — payload `{ conversationId }`, returns
    `{ ok: true, deletedCount }`.

## Task

**`modules/reporting/api/list-conversations.yaml`:**

- add `deleted.timestamp: { $exists: false }` to the `query`, with a one-line comment pointing at
  `docs/shared/soft-delete.md` as the idiom;
- raise `limit: 30` to `limit: 200`;
- update the header comment: the cap is 200 because the rail's search filters the returned window
  client-side, so the window is what search can reach — a smaller one makes an out-of-window miss
  indistinguishable from no match. Keep its existing explanation of why `messages` and
  `data_parts` are excluded and why a list snapshot must not be used to restore a transcript.
- **do not touch the projection.**

**Create `modules/reporting/api/delete-conversation.yaml`**, on `delete-report.yaml`'s shape:

- header comment: owner-scoped soft delete from the chat page's rail; soft, not hard, because
  nothing in this module hard-deletes (`docs/shared/soft-delete.md`); the stamp comes from this
  module's own `defaults/change_stamp.yaml` rather than the events module's exported component,
  because reporting declares no dependencies — the shape is identical either way;
- `id: delete-conversation`, `type: Api`;
- the signed-in guard, `:reject: You must be signed in to delete a conversation.`;
- one `MongoDBUpdateOne` step on `_module.connectionId: conversations-store`, filter
  `{ _id: { _payload: conversationId }, owner.user_id: { _user: id }, deleted.timestamp: { $exists: false } }`,
  `disableNoMatchError: true`, `update: { $set: { deleted: { _ref: defaults/change_stamp.yaml } } }`.
  Carry across both of `delete-report`'s comments — the already-deleted exclusion, and why
  authorization living in the filter plus `disableNoMatchError` is the right shape;
- `:return:` `ok: true` and `deletedCount` from the step's `modifiedCount`.

**`modules/reporting/module.lowdefy.yaml`:** add `- _ref: api/delete-conversation.yaml` to
`api:`, beside the other conversation endpoints. No `exports.api` entry — none of the
conversation endpoints has one; they exist for the chat page and the agent hooks.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds and `delete-conversation` appears in the generated
  `.lowdefy/server/build/` API artefacts.
- Against a running app: deleting a conversation removes it from the rail on the next
  `list-conversations` call and leaves the document in place with a `deleted` stamp carrying the
  caller's name and id.
- Deleting the same conversation twice returns `deletedCount: 0` the second time, and the first
  stamp is unchanged.
- Calling `delete-conversation` with another user's `conversationId` returns
  `{ ok: true, deletedCount: 0 }` and no error body.
- `list-conversations` returns at most 200 documents, soft-deleted ones absent, each still
  carrying `updated`.

## Files

- `modules/reporting/api/list-conversations.yaml` — modify — soft-delete filter, cap 200
- `modules/reporting/api/delete-conversation.yaml` — create
- `modules/reporting/module.lowdefy.yaml` — modify — the `api:` `_ref`

## Notes

Conversations stay **own-only**. Nothing here gives a conversation an audience, and the owner
scope is not a UI filter — the `owner.user_id` match in the endpoint is the authorization.

There is no restore path for a conversation and none is wanted: the reports side has
`restore-report` because a report is a durable artefact somebody may have linked to; a deleted
conversation is not.
