# Task 1: Sibling fixes in `user-account` — state hygiene and `Validate` scoping

## Context

Two defect classes established by the 2FA enrolment modal design (D3 and D6) exist in
three `user-account` modals other than the enrolment modal. They are independent of the
enrolment rework and touch none of its files, so this task can run on its own.

**D3 — resets set explicit leaf nulls, never `{}`.** `SetState` writes each param key
then calls `RootSlots.reset()` with no state argument. In `Block.reset`, an input whose
state field is now **undefined** and which was **invisible in the previous eval cycle**
has its remembered in-memory value deliberately restored; `evaluate` only overrides
`this.value` from state when the state value is _defined_. So `SetState: { ns: {} }`
leaves the leaves undefined and the input repopulates itself, while
`SetState: { ns.field: null }` leaves it defined and the input clears. A boolean input
resets to `false`, its boolean zero, not `null`.

**D6 — a container-scoped `Validate` validates nothing.** `Validate`'s `params` go
through `getBlockMatcher`, which turns a bare string into an **exact-id** matcher. Every
block tests the matcher against its **own** id — there is no cascade to descendants. So
`params: modal_changepw` matches exactly one block, the Modal container, which has
`required` defaulted to `false` and no `validate:` entries. Its test list is empty, it
returns zero errors, and the action reports success while validating nothing. The fix is
to match the namespace the form's inputs actually write to, which works because this
repo's input block ids **are** their state paths.

Both rules are already recorded in `CLAUDE.md` under **Lowdefy Project Rules**.

## Task

### 1. `modules/user-account/components/view/modal_changepw.yaml`

- **Add an `onClose` event** (the file has no reset at all today, so both password
  fields persist in client state indefinitely after the modal closes):

  ```yaml
  events:
    onClose:
      - id: reset_changepw
        type: SetState
        params:
          changepw.current_password: null
          changepw.new_password: null
          changepw.revoke_other_sessions: false
  ```

  `changepw.revoke_other_sessions` is a `CheckboxSwitch` (`modal_changepw.yaml:55-66`),
  so it resets to `false`, **not** `null`. Nulling it would flow into the next open's
  `ChangePassword` payload (`modal_changepw.yaml:31-33`), and this modal has no `onOpen`
  reset to correct it downstream.

- **Fix the `Validate`** at `modal_changepw.yaml:18-20` — swap `params: modal_changepw`
  for `params: { regex: '^changepw\.' }`.

### 2. `modules/user-account/components/view/modal_disable2fa.yaml`

- **Rewrite the existing `onOpen`** (`modal_disable2fa.yaml:14-18`) from
  `SetState: { disable2fa: {} }` to the leaf form:

  ```yaml
  onOpen:
    - id: reset_disable2fa
      type: SetState
      params:
        disable2fa.password: null
  ```

  It happens to work today because the input is always visible, but it is the exact
  shape the `CLAUDE.md` rule forbids and this change already opens the file.

- **Add an `onClose`** with the same params under a distinct action id
  (e.g. `clear_disable2fa`), so the account password does not sit in state until the
  next open.

- **Fix the `Validate`** at `modal_disable2fa.yaml:21-23` — `params: modal_disable2fa`
  becomes `params: { regex: '^disable2fa\.' }`.

### 3. `modules/user-account/components/view/modal_profile.yaml`

- **Fix the `Validate`** at `modal_profile.yaml:30-32` — `params: modal_profile` becomes
  `params: { regex: '^profile\.' }`.

  This is a **live** defect, not a dead guard: the form composes
  `modules/shared/profile/form_core.yaml` (`modal_profile.yaml:55`), which marks both
  `profile.given_name` and `profile.family_name` `required: true`
  (`form_core.yaml:32-34,44-46`). The form currently accepts a blank first or last name
  and saves it. The consumer-supplied `fields.profile` inputs are mandated into the
  `profile.` prefix by the manifest, which is why the regex tracks them and an explicit
  id list could not.

  No state-hygiene change here — this file is not one of D3's two sites.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- `modal_changepw.yaml` has an `onClose` naming all three leaves, with
  `revoke_other_sessions: false` and the two passwords `null`.
- `modal_disable2fa.yaml` has both `onOpen` and `onClose` writing
  `disable2fa.password: null`; no `{}` reset remains in either file.
- All three `Validate` actions carry a `regex` params object; no bare container-id string
  remains in these three files.
- Manual (needs the dev server and a credentialed user, so hand off with Task 5): submit
  `modal_changepw`, `modal_disable2fa` and `modal_profile` with a required field empty
  and confirm a **red field-level error**, not a server-error toast. For
  `modal_profile`, clear one of the two name fields.

## Files

- `modules/user-account/components/view/modal_changepw.yaml` — modify — new `onClose`
  leaf-null clear; `Validate` params → `regex: '^changepw\.'`.
- `modules/user-account/components/view/modal_disable2fa.yaml` — modify — `onOpen` `{}`
  → leaf null; new `onClose` clear; `Validate` params → `regex: '^disable2fa\.'`.
- `modules/user-account/components/view/modal_profile.yaml` — modify — `Validate` params
  → `regex: '^profile\.'`.

## Notes

- Both these modals' inputs are **always visible**, so D3's invisible-input restore quirk
  never bites them; the real gaps are the missing `onClose` and the `{}` shape. Fix them
  anyway — shipping the rule while leaving a counter-example in a file this change opens
  is the inconsistency the design rejects.
- `getBlockMatcher` also accepts `regex` as an **array** of patterns, and `blockIds` and
  `regex` may be given together in one params object (the matcher ORs across both). Not
  needed for these three, but Task 2 uses it.
- Do **not** "fix" these by omitting `params` entirely or passing `blockIds: true` — both
  match _every_ block on the page, which would mark required fields elsewhere on the
  account page.
