# Review 2 — Data Access Model and Component Location

Builds on findings in review-sam-1. The design's data access assumptions for user-account are incorrect, with cascading impact on sections 3, 5, 6, and decisions 6.

## Incorrect Data Access Assumption

### 1. `_user:` context includes global_attributes, app_attributes, and roles

> **Resolved.** Fixed both references. Line 39 now acknowledges `_user:` fields are available. Section 3 data access note rewritten to describe `_user:` as the source for user-account attributes.

The design states (line 39): "No access to `global_attributes` or `app_attributes` from `_user` context" and (line 406): "The `_user` context only provides `profile` and `email` from the auth session."

This is wrong. `apps/demo/lowdefy.yaml:70-75` configures `userFields`:

```yaml
userFields:
  id: user.id
  profile: user.profile
  app_attributes: user.app_attributes
  global_attributes: user.global_attributes
  roles: user.roles
```

All three — `_user: global_attributes`, `_user: app_attributes`, `_user: roles` — are available in every page's runtime context without any request.

This was flagged by review-sam-1 items 2 and 3. The impact ripples through multiple design sections.

### 2. User-account attributes data source table is wrong

> **Resolved.** Updated user-account row to `_user: global_attributes` and `_user: app_attributes`. Removed "Requires request" claim.

Section 3 data source table (line 400-404) says user-account attributes "Requires request (see below)." Since `_user: global_attributes` and `_user: app_attributes` are available directly, the attributes section on user-account should use:

```yaml
data:
  _object.assign:
    - _user: global_attributes
    - _user: app_attributes
```

No request needed for attributes. The table should read:

| Module       | Global Attributes                           | App Attributes                                      |
| ------------ | ------------------------------------------- | --------------------------------------------------- |
| user-account | `_user: global_attributes`                  | `_user: app_attributes`                             |
| contacts     | `_request: get_contact.0.global_attributes` | `_get` from `_request: get_contact.0` with app path |
| user-admin   | `_state: user.global_attributes`            | `_get` from `_state: user` with app path            |

### 3. Contacts app_attributes `_get` path may be unnecessary

> **Resolved.** Contacts `_get` kept — `get_contact` returns raw document with nested `apps.{app_name}.app_attributes`. User-admin simplified to `_state: user.app_attributes` — `get_user` already flattens via `$project`. The auth adapter flattening only applies to the session user (`_user:` context), not to request results for other users.

The design (lines 413-422) uses a dynamic `_get` with `_string.concat` to resolve `apps.{app_name}.app_attributes` from the contact document. But review-sam-1 item 3 notes the multiapp auth adapter already maps `app_attributes` to the document root.

Check whether `get_contact` returns the raw document (with `apps.{app_name}.app_attributes` nested) or a projected document (with `app_attributes` at root). If the adapter flattens it, the `_get` path is unnecessary — just use `_request: get_contact.0.app_attributes`.

If the raw document is returned, the `_get` is correct for contacts and user-admin (since those read other users' documents, not the session user).

### 4. `get_my_profile` justification narrows to sign_up only

> **Resolved.** Kept request unconditional. Rewrote section 3 data access note, section 5 user-account request description, and decision 6 to cite `sign_up.timestamp` as the sole justification — attributes come from `_user:` directly.

Decision 6 (line 873) justifies the unconditional request for both signed-up date AND attributes. Since attributes are available via `_user:`, the only remaining justification is `sign_up.timestamp` (not in `userFields`).

This changes the cost/benefit: a MongoDB `findOne` on every profile page load solely for a signed-up date that most users rarely look at. Two options:

- **Keep the request unconditional** — the cost is genuinely negligible, and the signed-up date is a nice touch. But the design text and decision 6 must be rewritten to reflect the actual (narrower) justification.
- **Make the request conditional on `view_extra` needing it** — only fetch when the signed-up date is configured. Saves the query for consumers who don't show it.

Either way, update section 3 (line 406-408), section 5 (line 522), and decision 6 (line 873) to stop citing attributes as a reason for the request.

## Component Location

### 5. Identity header belongs in `modules/shared/`, not a layout module

> **Resolved.** Moved to `modules/shared/layout/identity-header.yaml`. All `_ref` usages changed from `module: layout, component: identity-header` to `path: modules/shared/layout/identity-header.yaml`. File changes table updated from "Module: layout" to "Shared: modules/shared/layout". Decision 1 updated.

The design places the identity header at `layout/components/identity-header.yaml` (line 159) and references it as `_ref: module: layout, component: identity-header`. Review-sam-1 item 1 flags this.

The codebase has no standalone `layout` module. Shared layout components live at `modules/shared/layout/` (containing `card.yaml`, `floating-actions.yaml`, `auth-page.yaml`). The existing module `layout-header-menu` is a page wrapper, not a component library.

**Fix:** Place at `modules/shared/layout/identity-header.yaml`. Reference as `_ref: modules/shared/layout/identity-header.yaml` (file ref, not module ref). Update the `_ref` syntax in all usage examples (lines 219-311) and the file changes table (line 812).

## Roles Path Ambiguity

### 6. Access tile roles path needs clarification

> **Rejected.** The `get_user` request has a `$project` stage that flattens `apps.{app_name}.roles` to `roles` at the top level. The view page reuses the same request, so `_state: user.roles` resolves correctly — same as the existing edit page.

The access tile (line 663) uses `_state: user.roles` for role visibility checks. But roles are stored at `apps.{app_name}.roles` in the raw document (`modules/user-admin/api/update-user.yaml` writes to `_string.concat: ["apps.", {_module.var: app_name}, ".roles"]`).

The existing edit form (`modules/user-admin/components/form_access_edit.yaml:16-21`) uses `user.roles` as the form field ID, which works because Lowdefy form state maps the ID path. But the **view** page loads the raw document into state — `_state: user.roles` would be undefined; the data lives at `_state: user.apps.{app_name}.roles`.

Either:

- The view page projection must flatten roles to `user.roles` (like the edit page does), in which case document that projection
- Or the access tile must use `_get` with the dynamic app path, matching the app_attributes pattern

**Fix:** Add a note on how the view page fetch projects/flattens the user document for state, or update the access tile bindings to use the nested path.
