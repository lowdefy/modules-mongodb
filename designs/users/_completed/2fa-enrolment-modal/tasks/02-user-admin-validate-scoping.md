# Task 2: `Validate` scoping fixes in `user-admin` — four sites

## Context

Same defect as Task 1's `Validate` half, in a different module. `Validate`'s `params` go
through `getBlockMatcher`, which turns a bare string into an **exact-id** matcher; each
block tests it against its **own** id, so `params: <modalId>` matches only the Modal
container, which has no validation of its own and therefore validates nothing while
reporting success.

Four `user-admin` sites have it. **The correct namespace is not derivable from the
container id for three of them**, which is the whole reason the mapping is tabulated
below rather than left as a rule to apply at code time: `^global\.` and `^access\.` are
what a container-id reading suggests, and both match **zero blocks**. Shipping those
would swap a silent no-op for a different silent no-op.

The namespaces come from `user-admin`'s manifest, which mandates the `profile.`,
`user_attributes.` and `member_attributes.` prefixes for its consumer-supplied field vars
(`modules/user-admin/module.lowdefy.yaml:88-105`). That is also why these take the regex
form rather than an explicit id list: their input sets are partly consumer-supplied, so
no list authored here could enumerate them.

Two of the four are **live** defects — `modal_profile` and `invite_form` both compose
`modules/shared/profile/form_core.yaml`, which marks `profile.given_name` and
`profile.family_name` `required: true`, so an admin can currently save a member with a
blank first or last name. The other two (`modal_global`, `modal_access`) are dead guards
today that will break silently the first time someone marks a field required — the worse
failure, because the config looks protected.

## Task

Swap each site's container-id `params` for the namespace its inputs actually write to.
Read the ids off each file; do not infer them from the container id.

| File                                                    | Line | Actual input ids                                   | New `params`                                               |
| ------------------------------------------------------- | ---- | -------------------------------------------------- | ---------------------------------------------------------- |
| `modules/user-admin/components/view/modal_profile.yaml` | ~26  | `profile.*`, plus a disabled `email` display field | `regex: '^profile\.'`                                      |
| `modules/user-admin/components/view/modal_global.yaml`  | ~22  | `user_attributes.*` only                           | `regex: '^user_attributes\.'`                              |
| `modules/user-admin/components/view/modal_access.yaml`  | ~27  | `roles` + `member_attributes.*`                    | `regex: ['^roles$', '^member_attributes\.']`               |
| `modules/user-admin/components/invite_form.yaml`        | ~147 | `profile.*`, `roles`, `member_attributes.*`        | `regex: ['^profile\.', '^roles$', '^member_attributes\.']` |

`getBlockMatcher` accepts `regex` as an **array** of patterns and ORs across them
(`engine/dist/getBlockMatcher.js:38-58`), so a form spanning several namespaces still
needs only **one** `Validate`.

Two exclusions, both deliberate:

- **`user-admin/modal_profile`'s `email`** is left out: it is a bare `email` id,
  `disabled: true` display, never required, so matching it buys nothing.
- **`^roles$` buys nothing today** — `required: true` on an array input is inert. The
  synthesised rule is `pass: { _not: { _type: 'none' } }`, `_type: 'none'` is
  `null`/`undefined` only, and an array input's value is seeded with
  `enforceType('array', null)` → `[]`, which is not `none`. Include the pattern anyway:
  `roles` is a live input the form writes to, and the single rule is "validate the
  namespace the form writes to". Dropping it would be the special case.

Change **only** the `Validate` `params`. Do not touch the `required: true` flags on the
`roles` selectors (`modal_access.yaml:54-56`, `invite_form.yaml:48-50`) — deleting those
belongs to `designs/users-fixes/role-editing` D6, which owns both files.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- All four `Validate` actions carry a `regex` params object matching the table exactly;
  no bare container-id string remains in `user-admin`.
- Neither `roles` `MultipleSelector` has had its `required: true` altered.
- Manual (needs the dev server; hand off with Task 5): `invite_form` with a name field
  cleared shows a red field-level error, not a server-error toast — this is also the
  multi-pattern-regex proof, since its params span three patterns and the error must come
  from the `profile.` half. `modal_global` and `modal_access` have **no** input that can
  fail a required check, so for each, mark one field required temporarily and confirm the
  regex catches it. A passing form proves nothing there.

## Files

- `modules/user-admin/components/view/modal_profile.yaml` — modify — `Validate` params.
- `modules/user-admin/components/view/modal_global.yaml` — modify — `Validate` params.
- `modules/user-admin/components/view/modal_access.yaml` — modify — `Validate` params.
- `modules/user-admin/components/invite_form.yaml` — modify — `Validate` params.

## Notes

- **Cross-design ordering.** `designs/users-fixes/role-editing` also edits
  `modal_access.yaml` and `invite_form.yaml` (dropping the inert `required: true` and
  fixing the role picker). **role-editing lands first on those two files**, and this
  swap applies on top of it. The edits do not touch the same lines, so if role-editing
  has not landed, apply this anyway and expect no conflict — but do not pre-empt any of
  role-editing's changes here.
- role-editing's Non-goals list these eight `Validate` sites as "owed a follow-up design
  covering all eight". That non-goal is amended to point at this design; all eight are
  fixed across Task 1, Task 2 and Task 3.
- Do not "fix" these by omitting `params` or passing `blockIds: true` — both match every
  block on the page.
