# Task 9: Binding prerequisites — selector id var, assignee docs in the read handler, manifest dependency

> **Rev 2:** the assignee display docs are now added in the **`GetWorkflowAction` plugin handler** envelope, _not_ a `$lookup` in `requests/get_action.yaml` — that file was replaced by the handler (Part 46) and no longer exists.

## Context

Three small enablers the universal-fields component (task 10) needs, none of which belong inside the component itself:

1. **`user-multi-selector` can't bind to `fields.assignees` yet.** Part 24a shipped `modules/user-account/components/user-multi-selector.yaml` with a hardcoded `id: user-multi-selector`. Lowdefy auto-binds input blocks to the state path named by their `id`, and Part 24a's design explicitly states "Part 24 binds `_state.fields.assignees`" — so the component needs a parameterizable id. The workflows module's own field components show the house pattern (`components/fields/text_input.yaml`: `id: { _var: key }`).
2. **Display mode needs assignee user docs, not ids.** The design renders "one `_ref: { module: user-account, component: user-avatar }` per assignee (picture + name)", but `action.assignees` is an array of user ids and `user-avatar` consumes a doc (`_var: user.profile.picture` / `user.profile.name`). The detail-page read path is the **`GetWorkflowAction` plugin handler** (`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`, request id `get_workflow_action`), which returns a curated single-object envelope and already reads multiple collections via `findDocs`. It grows an `assignee_docs` lookup into `user-contacts`, consistent with Part 46's "server-side curated envelope, no client computation" design.
3. **Cross-module refs need the manifest dependency.** `_ref: { module: user-account, component: ... }` only resolves if `user-account` is declared under `dependencies:` in `modules/workflows/module.lowdefy.yaml` (currently: `layout`, `events`, `notifications`).

## Task

1. **`modules/user-account/components/user-multi-selector.yaml`** — make the block id parameterizable, defaulting to the current value so existing/external consumers are untouched:

   ```yaml
   id:
     _var:
       key: id
       default: user-multi-selector
   ```

   Also accept an optional `title` var (default `Users`) on `properties.title` so the workflows sidebar can label it `Assignees`. No other changes; the `get_users_for_selector` request and `label` var stay as-is.

2. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`** — after reading the action doc (and using the same connection-configured collection-name pattern the handler already uses for `workflowsCollection` / `actionsCollection`), look up `user-contacts` for `action.assignees` and add an `assignee_docs` field to the returned envelope:

   ```js
   // After the action read, before/with the envelope build:
   const assigneeIds = action.assignees ?? [];
   const assignee_docs = assigneeIds.length
     ? await findDocs({
         mongoDb,
         collection: connection.userContactsCollection ?? "user-contacts",
         query: { _id: { $in: assigneeIds } },
       }).then((docs) =>
         docs.map((d) => ({
           _id: d._id,
           profile: { name: d.profile?.name, picture: d.profile?.picture },
         })),
       )
     : [];
   ```

   Add `assignee_docs` to the explicit allowlist in the returned envelope object (`GetWorkflowAction.js:213-239`). Confirm the connection's user-contacts collection-name config key (mirror how `workflowsCollection` / `actionsCollection` are read; if no key exists, default to the literal `'user-contacts'` — the name is fixed by `modules/user-account/connections/user-contacts-collection.yaml`).

3. **`modules/workflows/module.lowdefy.yaml`** — add to `dependencies:`:

   ```yaml
   - id: user-account
     description: >
       Supplies the user-multi-selector and user-avatar components the
       universal-fields surface composes (Part 24 / Part 24a).
   ```

## Acceptance Criteria

- `apps/demo` (which wires both modules) builds; existing `user-multi-selector` consumers render unchanged (default id preserved).
- `get_workflow_action` returns `assignee_docs: [{ _id, profile: { name, picture } }]` for an action with assignees, and `[]` for none (cover in `GetWorkflowAction.test.js`).
- A scratch `_ref: { module: user-account, component: user-multi-selector, vars: { id: fields.assignees } }` in the demo app binds its value to `_state.fields.assignees` (manual build check; remove the scratch).

## Files

- `modules/user-account/components/user-multi-selector.yaml` — modify — `id` + `title` vars.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — modify — `assignee_docs` lookup + envelope field.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js` — modify — `assignee_docs` cases.
- `modules/workflows/module.lowdefy.yaml` — modify — `user-account` dependency.

## Notes

- The selector id var is a small **deviation layered on a completed part** (24a's component). Per repo policy, don't reopen that design folder — if useful, add a one-line deviation note in `_completed/24a-user-account-selector-avatar/design.md` pointing here.
- The `user-contacts` collection name is fixed (the connection fixes it); a var-indirection for a name that can't vary is speculative surface. Read it from the connection config if a key exists; otherwise default to the literal.
- **Type-safety (settled — review-3 #4):** user-contacts `_id` is a **string** — `_uuid: true` on the invite upsert (`user-admin/api/invite-user.yaml`) and `_user: id` on `user-account/api/create-profile.yaml` — so assignee ids round-trip as strings and the `$in` lookup on `_id` matches without coercion. No ObjectId handling needed.
- The avatar leaves (`profile.name`, `profile.picture`) match `contact-fields.md:33` (DiceBear avatar at `profile.picture`, computed `profile.name`).
