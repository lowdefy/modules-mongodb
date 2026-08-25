# Task 13: The rail — search, recency grouping, rename and delete

## Context

The rail is `AgentConversations` with `items` mapped from `list-conversations`: titles only, no
recency, no rename, no delete. The block already carries more than the page uses, and all of it
is reachable from config with **no block change**:

- **A per-item `menu`** — `properties.menu` is an array of `{ key, label, icon, danger }`, and the
  block fires `onMenuClick` with `{ action, conversationKey, conversation }`. That is rename and
  soft delete, with `danger: true` on the delete item.
- **Recency grouping** is a `group` string on each item plus the `groupable` property
  (`{ collapsible, label, defaultExpandedKeys }`). **Group order follows first appearance in
  `items`** — verified in `@ant-design/x`'s `useGroupable`, which is a plain reduce with no
  alphabetical sort — so ordering the items by recency yields Today → Previous 7 days → Older with
  no sort hook.
- **There is no search property**, but `items` is config-driven, so a `Search` block above the rail
  filtering the array **is** the feature.

**A rail item is one line, and that bounds what the rail can say.** The item schema is exactly
`key` / `label` / `icon` / `disabled` / `timestamp` / `group`; the block passes `items` straight
through to `@ant-design/x`'s `Conversations`, whose `Item` renders the icon, the `label` and the
menu trigger and nothing else — no description, no secondary line — and `label` is typed `string`,
so a node cannot be smuggled in. Two consequences:

- **No snippet.** The wireframes asked `list-conversations` for a snippet "for search" rather than
  for display, so the question was never whether it renders (it cannot) but whether it should
  widen what search matches. It should not: the title is AI-derived from the conversation's own
  opening turn, so a first-message snippet is near-duplicate search surface, and a match on text
  the user cannot see is a result they cannot explain — searching "refunds" and being handed a
  conversation titled "Q3 review" reads as a bug. Search matches **titles**.
- **No per-item date.** `timestamp` is declared in the block's item schema but **nothing reads
  it**, and upstream's `ConversationItemType` does not carry it. Recency arrives as the three group
  headings and nothing else — which is enough: a user scanning for last Tuesday's conversation is
  served as well by "Previous 7 days" as by a date on every row.

Task 8 raised `list-conversations` to the 200 most recent, excluded soft-deleted ones, and added
`delete-conversation`. `set-conversation-title` already exists and is what rename calls.

## Interfaces

- **Consumes:** `list-conversations` returning up to 200 documents each carrying `_id`, `title`,
  `updated`; `delete-conversation` (payload `{ conversationId }`); `set-conversation-title`
  (payload `{ conversationId, title }`); the collapse globals from task 12.
- **Produces:** `_state: conversation_search` (the search term) and the rename modal's state.

## Task

All in `modules/reporting/pages/chat.yaml`, inside `conversations_panel`.

**A `Search` block above the rail**, `id: conversation_search`, filtering the mapped `items`
client-side on a case-insensitive substring match of the title. It searches the window
`list-conversations` returned, which is the 200 most recent — so the copy must say so rather than
letting an out-of-window miss read as no match. When the filter yields nothing, show a
`Paragraph`: no conversation in the 200 most recent matches that term. Name the number; that
honesty is the whole reason the cap was raised.

**Recency grouping.** Extend the existing `_array.map` over `_state: conversations` to add a
`group` per item, derived from `updated.timestamp`: `Today`, `Previous 7 days`, `Older`. The
documents already arrive sorted `updated.timestamp: -1`, so the groups appear in that order for
free — do not sort client-side. Keep the existing `label` fallback (`New conversation` when the
stored title is missing or empty) and its comment about operators inside a `_function` callback
taking the `__` prefix.

Set `groupable:` on the block. Do **not** set `timestamp` on the items — nothing reads it, and
setting a field no consumer reads invites a later reader to think the rail shows dates.

**The per-item menu.** `menu:` with two entries — rename, and delete with `danger: true`. Handle
`onMenuClick`, branching on `_event: action` with `skip:`:

- **rename** — open a `Modal` seeded with `_event: conversation.label` as the initial value of a
  `TextInput`; its `onOk` calls `set-conversation-title` with the conversation key and the new
  title, then refetches `list-conversations` and `SetState`s `conversations` from the response.
  Reuse the exact refetch pair the page already has in `onMessageComplete` /
  `onTitleGenerated` rather than writing a third variant; if that means extracting the two actions
  into a shared `_ref`'d action file, do that.
- **delete** — a confirm `Modal` naming the conversation, whose `onOk` calls
  `delete-conversation` with the key, then refetches the list the same way. When the deleted
  conversation is the active one, also reset the page to a fresh conversation — the same
  `SetState` the rail's `onNew` does (`conversationId: { _uuid: true }`, `messages: []`, and every
  results array cleared). Otherwise the transcript stays on a conversation that no longer lists.

**Clear the search term** on `onNew` and after a delete, so the rail is not left filtered to
nothing.

**Consult the block schemas via the `lowdefy-docs` MCP tools** for `Search`, `Modal`, `TextInput`
and `AgentConversations` rather than guessing property names.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds.
- Against a running app with the seeded conversation set (task 16): the rail shows three group
  headings in the order Today → Previous 7 days → Older; typing in the search box filters by
  title; a term matching nothing shows the copy naming the 200-conversation window.
- The kebab menu on a row offers Rename and Delete, delete rendered as dangerous.
- Renaming updates the row's label after the refetch, and the new title survives a reload.
- Deleting a non-active conversation removes it from the rail and leaves the transcript alone;
  deleting the **active** conversation removes it and drops the page into a fresh, empty
  conversation.
- The rail still switches conversations correctly, including two rapid selections in a row — the
  `set_results` race guard is intact.

## Files

- `modules/reporting/pages/chat.yaml` — modify — search, grouping, the item menu, rename and
  delete
- `modules/reporting/pages/chat/actions/*.yaml` — create, if the shared refetch is extracted

## Notes

Extract blocks into `_ref`'d component files once nesting exceeds ~3–4 levels — two modals plus
the rail inside one column will get there. Component files are snake_case; the page file is
kebab-case.

There is no restore for a deleted conversation and none is wanted. Do not add an undo affordance.
