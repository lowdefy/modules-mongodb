# Task 4: Extract reusable `access_filter` aggregation stage

## Context

Both read APIs (`get-entity-workflows`, `get-workflow-overview`) filter actions per the same access rule. Per CLAUDE.md's "Extract request pipeline stages" rule, reusable MongoDB pipeline stages live under `api/stages/` (or `requests/stages/`) and get `_ref`'d into the parent pipeline.

The filter rule is committed in [`design.md` § `api/get-entity-workflows.yaml`](../design.md):

> Filter actions per access rule: `access.{vars.app_name}` must intersect `[view, edit, review]` (per the verb-implication table in [action-authoring/spec.md § Per-app verb maps](../../../../workflows-module-concept/action-authoring/spec.md) — `edit` and `review` both imply `view`) AND `access.roles` must intersect with `_user.roles` resolved via `user_schema.roles_path` (empty or missing `access.roles` = no gate).

User roles resolve via the module's `user_schema.roles_path` var (default `roles`). The routine reads `_user: { _module.var: user_schema.roles_path }`.

Concretely the stage is a `$match` with `$expr` `$and` of two predicates:

1. **Verb filter:** `$size: { $setIntersection: ['$access.<app_name>', ['view', 'edit', 'review']] } > 0`.
2. **Role gate:** `$or` between "`access.roles` is empty/missing" and "`access.roles` intersects user roles".

The `<app_name>` path segment is resolved at build time via `_string.concat` (same pattern shipped in [`modules/contacts/api/update-contact.yaml:15-19`](../../../../../modules/contacts/api/update-contact.yaml)).

The aggregation expression `$getField` is needed to read a dynamic field name from a doc inside `$expr` — `$access.<app_name>` works fine when `<app_name>` is inlined at build time as a literal string in the path.

## Task

Create `modules/workflows/api/stages/access_filter.yaml`:

```yaml
$match:
  $expr:
    $and:
      # Verb filter: access.{app_name} must intersect [view, edit, review].
      # access.{app_name} is read via $getField since the field name is
      # dynamic (resolved from the module var at build time).
      - $gt:
          - $size:
              $ifNull:
                - $setIntersection:
                    - $ifNull:
                        - $getField:
                            field:
                              _module.var: app_name
                            input: $access
                        - []
                    - [view, edit, review]
                - []
          - 0
      # Role gate: access.roles is empty/missing OR intersects user roles.
      - $or:
          # Empty or missing access.roles ⇒ no gate.
          - $eq:
              - $size:
                  $ifNull:
                    - $access.roles
                    - []
              - 0
          # Otherwise must intersect user roles.
          - $gt:
              - $size:
                  $setIntersection:
                    - $ifNull:
                        - $access.roles
                        - []
                    - _user:
                        _module.var: user_schema.roles_path
              - 0
```

The `_user: { _module.var: user_schema.roles_path }` operator chain reads the caller's roles at runtime from the path declared by the module's `user_schema` var (default `roles`, per [`module.lowdefy.yaml`](../../../../../modules/workflows/module.lowdefy.yaml) — currently not yet declaring `user_schema`; that's part 20's manifest task to land alongside this part).

## Acceptance Criteria

- `modules/workflows/api/stages/access_filter.yaml` exists with the shape above.
- File is **not** a full request (no `id:`, `type:`, `routine:` wrapper) — it's a single pipeline stage object that gets `_ref`'d into a parent `MongoDBAggregation` pipeline.
- Build-time operators (`_module.var`) resolve at build; runtime operators (`_user`) resolve per-call.
- The verb list is hardcoded as `[view, edit, review]` — not a module var. (The verb vocabulary is module-defined per [action-authoring/spec.md § Per-app verb maps](../../../../workflows-module-concept/action-authoring/spec.md).)
- Empty or missing `access.roles` short-circuits to "pass" (the `$or` first branch matches when `$size` of `$ifNull` is 0).

## Files

- `modules/workflows/api/stages/access_filter.yaml` — **create** — reusable `$match` stage; consumed by tasks 5 and 6 via `_ref`.

## Notes

- **Where the stage lives.** CLAUDE.md says reusable stages live under `requests/stages/` for app-side requests; for module-side APIs the parallel directory is `api/stages/`. This task picks `api/stages/` because the stage is only consumed from `api/*.yaml` files in this module. If a future request inside the module also needs it, promote to `stages/` at the module root.
- **Why `$getField` for `access.<app_name>`.** MongoDB resolves `$access.{literal-name}` directly when `{literal-name}` is known at parse time. Lowdefy's `_string.concat` would produce a string like `'$access.my-team-app'` at build time, which MongoDB then parses as a field path. Either `$getField` (explicit) or build-time concat (terser) work. The task uses `$getField` because it's more transparent — the reader sees that `app_name` is the dynamic part.
- **Action shape assumption.** The stage runs against documents from `actions-collection`, which carry the action's `access` map at the doc root (per the action doc shape committed in [part 5 design](../../_completed/05-start-cancel-handlers/design.md) — "reference-key spread" puts authored fields at the root). If for some reason action docs end up with `access` nested under another key, this stage breaks and needs to be re-pathed.
- **No-op when `app_name` not in the access map.** If the action's `access.<app_name>` is missing entirely, `$getField` returns `null`; the outer `$ifNull: [..., []]` swaps in an empty array; intersection with `[view, edit, review]` is empty; size is 0; the predicate fails. Action is filtered out. This matches the concept spec ("Apps without a key for a given app deployment hide the action entirely there").
