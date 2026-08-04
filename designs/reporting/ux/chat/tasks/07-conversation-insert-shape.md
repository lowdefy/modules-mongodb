# Task 7: The two conversation writers insert the full live shape between them

## Context

A live defect the conversations rail already shows, and which recency grouping would make
permanent.

Two endpoints upsert the conversation document, both keyed on
`{ _id: payload.conversationId, owner.user_id: _user.id }` with `upsert: true`:

- **`save-conversation.yaml`** — the onFinish hook. `$set`s `messages`, `owner`
  (`_ref: defaults/owner.yaml`) and `updated` (`_ref: defaults/change_stamp.yaml`);
  `$setOnInsert`s `created` and a `_mql.expr`-derived `title` from the first user message.
- **`set-conversation-title.yaml`** — the block's `onTitleGenerated` handler. `$set`s `title`;
  `$setOnInsert`s `owner` and `created` **only**.

That second endpoint frequently creates the document — its own comment records that the AI title
arrives during streaming, before the onFinish save. A document with no `updated` sorts **last**
on `list-conversations`' `updated.timestamp: -1` sort. So the conversation the user is actively
talking to sits at the bottom of their own rail until the first save lands, will group under
"Older" once recency grouping ships (task 13), and stays there permanently if that hook ever
fails.

Neither writer initialises `data_parts` or `deleted`, so a conversation's shape depends on which
writer got there first and in what order — the discipline `generate-report` already applies on
the reports side ("initialised so live documents have a consistent shape").

**The invariant is the union, not a shared list.** Stating it as one shared shape both writers
insert is not a stylistic difference, it is a hard MongoDB error: the same path in `$set` and
`$setOnInsert` throws code 40, `Updating the path 'owner' would create a conflict at 'owner'`, on
**every** call rather than only on inserts — probed against a real server
(`mongodb-memory-server`, driver 6.21), and nested overlaps conflict too
(`$set: { "owner.name": … }` against `$setOnInsert: { owner: … }`). `save-conversation` already
`$set`s `messages`, `owner` and `updated`, so the shared-list phrasing would have stopped it
persisting anything at all, silently, inside the `console.warn`-only hook.

`$setOnInsert` correctly does not fire on a match, so whichever writer creates the document, the
other never disturbs what the first initialised — the end state is the same either way.

## Interfaces

- **Produces:** a conversation document whose live shape is complete from whichever writer
  created it: `_id`, `owner`, `created`, `updated`, `title`, `messages`, `data_parts`, `deleted`.

## Task

Each writer `$setOnInsert`s **only the fields it does not `$set`**:

| Writer                   | `$set`                         | `$setOnInsert`                                                                   |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------------- |
| `save-conversation`      | `messages`, `owner`, `updated` | `created`, derived `title`, `data_parts: []`, `deleted: null`                    |
| `set-conversation-title` | `title`                        | `owner`, `created`, `updated`, `messages: []`, `data_parts: []`, `deleted: null` |

**`modules/reporting/api/save-conversation.yaml`** — add `data_parts: []` and `deleted: null` to
the existing `$setOnInsert`. Leave `created` and the derived `title` exactly as they are.

**`modules/reporting/api/set-conversation-title.yaml`** — add `updated`
(`_ref: defaults/change_stamp.yaml`), `messages: []`, `data_parts: []` and `deleted: null` to its
`$setOnInsert`, beside the existing `owner` and `created`.

Comment the reasoning **once**, in `set-conversation-title.yaml` since it is the writer whose
omission is the bug, and cross-reference it from `save-conversation.yaml` in a line: between the
two writers the `$set` / `$setOnInsert` sets cover the full live shape, each inserting only what
it does not set, because the same path in both operators is MongoDB code 40 on every call — not
only on inserts. Say what the missing `updated` did: the document sorted last on the rail's
descending sort, so the conversation the user was talking to sat at the bottom of it.

`deleted` is initialised `null` and read with the predicate `deleted.timestamp: { $exists: false }`,
per `docs/shared/soft-delete.md` — task 8 is what reads it.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds.
- Against a running app: start a new chat and send one message. Before the turn finishes, the
  conversation appears at the **top** of the rail, not the bottom — the AI title arrives first
  and now carries an `updated` stamp.
- The document created by either writer carries all eight fields; re-running the other writer
  does not overwrite them.
- Neither writer names the same path in `$set` and `$setOnInsert` — grep both files and check by
  eye; the failure is a code-40 throw on every call, swallowed by the hook.

## Files

- `modules/reporting/api/save-conversation.yaml` — modify — `data_parts: []`, `deleted: null` on
  insert
- `modules/reporting/api/set-conversation-title.yaml` — modify — `updated`, `messages: []`,
  `data_parts: []`, `deleted: null` on insert

## Notes

`owner` stays derived from `_user`, never the payload, in both writers. Both endpoints are
`type: Api` and HTTP-callable by any authenticated user, and the write is an upsert — a
payload-supplied user id would let a caller insert attacker-authored conversations into another
user's sidebar. That comment already exists in `save-conversation.yaml`; do not weaken it.

`conversationId` and `messages` stay camelCase in the payload reads: they are the agent
framework's own `onFinish` payload keys. The document fields this module names are snake_case.
