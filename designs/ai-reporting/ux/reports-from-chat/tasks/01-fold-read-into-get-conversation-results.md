# Task 1: Fold the saved-reports read into `get-conversation-results`

## Context

The "Saved from this chat" section needs the caller's reports for the open conversation. Rather
than a standalone endpoint, this read **folds into `get-conversation-results`** — the endpoint the
panel already calls (once, from `onSelect`) to load a conversation's transcript and result parts.
It gains one more step (a `MongoDBFind` on `reports-store`) and returns the reports as a new
`saved_reports` field alongside `messages` / `charts` / `tables` / `downloads`. The section then
tracks a conversation's results wherever they load, with no second `CallAPI` for any caller to
remember. ([Why fold rather than a separate endpoint.](../design.md#fold-the-read-into-get-conversation-results-not-a-second-endpoint))

The field is already there: `conversation_id` is set only for the conversation's owner — by
`create-report` from the save sheet, and (task 4) by the agent-path backfill in the owner's turn-end
hook — so an owner scope is both the authorization and the natural set.

## Interfaces

- **Modifies:** `modules/ai-reporting/api/get-conversation-results.yaml`.
  - **Payload (unchanged):** `{ conversationId }` — the endpoint's existing camelCase key (a
    framework boundary). The new step matches it against the report field `conversation_id`.
  - **Return (added field):** `saved_reports` — an array of `{ _id, title, visibility, created }`,
    sorted `created.timestamp: -1`. Empty when the caller is unauthenticated or the conversation
    has no reports.

## Task

**Edit `modules/ai-reporting/api/get-conversation-results.yaml`:**

1. **Unauthenticated guard** — the early `:return` already yields `messages/charts/tables/downloads`
   as `[]`; add `saved_reports: []` to it so the shape stays consistent when there is no user.
2. **Add a find step** (`id: load_reports`), after the existing `load` step, `MongoDBFind` on
   `connectionId: { _module.connectionId: reports-store }`:
   - `query`: `conversation_id: { _payload: conversationId }`, `owner.user_id: { _user: id }`, and
     `deleted.timestamp: { $exists: false }` (the reports-store "mine" scope — see
     `list-reports.yaml`).
   - `options`:
     - `sort`: `created.timestamp: -1` (most recently **saved** first — `created`, not `updated`, is
       the save time the row shows).
     - `projection`: `title: 1`, `visibility: 1`, `created: 1` (`_id` is returned by default; do
       **not** project `spec` — the section needs none of it).
3. **Return the field** — extend the final `:return` so `saved_reports` is returned alongside the
   existing `messages/charts/tables/downloads`. The existing return builds the four fields via
   `_mql.expr` over `data_parts`; add `saved_reports: { _step: load_reports }` at the same level
   (outside the `_mql.expr`, or threaded through it — keep it a plain passthrough of the find
   result).

Update the file's header comment to note it now also returns the conversation's saved reports
(`saved_reports`), read owner-scoped from `reports-store` — the chat → report link the panel's
"Saved from this chat" section renders.

**No manifest change** — `get-conversation-results` is already `_ref`'d and exported; no new
endpoint, no new `exports.api` entry.

## Acceptance criteria

- `get-conversation-results.yaml` has the `load_reports` find (owner + not-deleted +
  `conversation_id` match, `{ title, visibility, created }` projection, `created.timestamp: -1`
  sort) and returns `saved_reports`; the unauthenticated guard returns `saved_reports: []`.
- The existing `messages/charts/tables/downloads` return is unchanged.
- `pnpm ldf:b` from `apps/demo` builds clean.
- In `apps/demo/.lowdefy/server/build/api/reporting/**`, the resolved `get-conversation-results`
  carries the second find with all three scope predicates and a projection that excludes `spec`.

## Files

- `modules/ai-reporting/api/get-conversation-results.yaml` — modify — add the `reports-store` find and
  the `saved_reports` return field (+ guard).

## Notes

- A `MongoDBFind`, not an aggregation: no computed fields are needed (contrast `list-reports`).
- Do not cap results with a `limit`. A single conversation produces few reports; a cap would add a
  silent truncation with nothing to gain.
- Do not coerce `conversation_id` — it is a stored string, queried as a string (the same shape
  `create-report` wrote and the endpoint's `load` step keys `_id` on).
- The two reads are independent steps (no cross-store `$lookup`); keep them separate steps so each
  stays a plain, readable query.
