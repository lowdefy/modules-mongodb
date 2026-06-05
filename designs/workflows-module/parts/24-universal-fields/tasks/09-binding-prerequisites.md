# Task 9: Binding prerequisites — selector id var, assignee `$lookup`, manifest dependency

## Context

Three small enablers the universal-fields component (task 10) needs, none of which belong inside the component itself:

1. **`user-multi-selector` can't bind to `fields.assignees` yet.** Part 24a shipped `modules/user-account/components/user-multi-selector.yaml` with a hardcoded `id: user-multi-selector`. Lowdefy auto-binds input blocks to the state path named by their `id`, and Part 24a's design explicitly states "Part 24 binds `_state.fields.assignees`" — so the component needs a parameterizable id. The workflows module's own field components show the house pattern (`components/fields/text_input.yaml`: `id: { _var: key }`).
2. **Display mode needs assignee user docs, not ids.** The design renders "one `_ref: { module: user-account, component: user-avatar }` per assignee (picture + name)", but `action.assignees` is an array of user ids and `user-avatar` consumes a doc (`_var: user.profile.picture` / `user.profile.name`). The shared `modules/workflows/requests/get_action.yaml` (used by the form templates AND the simple pages) is the single read path, so it grows a `$lookup` into `user-contacts` — established cross-module precedent: `modules/activities/requests/stages/lookup_contacts.yaml` (`$lookup: { from: user-contacts }`); the collection name is fixed (not var-configurable) in `modules/user-account/connections/user-contacts-collection.yaml`.
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

2. **`modules/workflows/requests/get_action.yaml`** — append a `$lookup` + projection so the response carries `assignee_docs`:

   ```yaml
   - $lookup:
       from: user-contacts
       localField: assignees
       foreignField: _id
       as: assignee_docs
       pipeline:
         - $project:
             profile.name: 1
             profile.picture: 1
   ```

   (Exact stage syntax per the aggregations guide — `.claude/guides/aggregations.md`; keep the projection to `_id` + the two profile fields the avatar consumes.)

3. **`modules/workflows/module.lowdefy.yaml`** — add to `dependencies:`:

   ```yaml
   - id: user-account
     description: >
       Supplies the user-multi-selector and user-avatar components the
       universal-fields surface composes (Part 24 / Part 24a).
   ```

## Acceptance Criteria

- `apps/demo` (which wires both modules) builds; existing `user-multi-selector` consumers render unchanged (default id preserved).
- `get_action` returns `assignee_docs: [{ _id, profile: { name, picture } }]` for an action with assignees, and `[]` for none (verify against a seeded demo db or in the request's test if one exists).
- A scratch `_ref: { module: user-account, component: user-multi-selector, vars: { id: fields.assignees } }` in the demo app binds its value to `_state.fields.assignees` (manual build check; remove the scratch).

## Notes

- The selector id var and `$lookup` are small **deviations layered on completed parts** (24a's component, 16/17's shared request). Per repo policy, don't reopen those design folders — if useful, add a one-line deviation note in `_completed/24a-user-account-selector-avatar/design.md` pointing here.
- Don't rename or restructure `get_action`'s existing `$match` — the lookup is purely additive; every existing `_request: get_action.*` path must keep resolving.
- The `user-contacts` collection name is hardcoded by the same reasoning as the activities precedent: the connection fixes it, and a var-indirection for a name that can't vary is speculative surface.
- **Type-safety (settled — review-3 #4):** user-contacts `_id` is a **string** — `_uuid: true` on the invite upsert (`user-admin/api/invite-user.yaml`) and `_user: id` on `user-account/api/create-profile.yaml` — so selector values round-trip the client as strings and the `$lookup` on `_id` matches without coercion. No ObjectId handling needed.
