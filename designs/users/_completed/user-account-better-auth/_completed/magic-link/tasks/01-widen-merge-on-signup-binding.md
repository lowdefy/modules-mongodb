# Task 1: Confirm the merge-on-signup binding is provider-agnostic verified-email

## Context

The parent module ships the **merge-on-signup hook** — an `InternalApi` endpoint
(`modules/user-account/api/link-contact-on-signup.yaml`) bound at both
`user.create.before` and `email.verified`, which links a new signup to an existing
contact by verified email (or mints a bare one) via the shared
`modules/shared/contact/create-or-link-contact.yaml` fragment. This is how "every
user has a contact by first session" holds.

The magic-link design (Decision 5) requires this binding to fire for **magic-link
user creations** too. A magic-link user is created at verify time with
`emailVerified: true` and **no `account` row** (no credential, no OAuth provider),
so any binding condition that keyed on "an OAuth account exists" or a specific
`providerId` would skip them and break the invariant. The design frames this as a
**spec clarification, not a new mechanism**: widen the `user.create.before` match
intent from "verified-provider OAuth" to "any create with a verified email."

**Current state (verify this):** the endpoint's guard is already provider-agnostic:

```yaml
- :if:
    _or:
      - _eq: [{ _payload: point }, email.verified]
      - _eq: [{ _payload: user.emailVerified }, true]
    :then: { _ref: ../shared/contact/create-or-link-contact.yaml, ... }
```

It keys on `user.emailVerified == true`, **not** on `providerId` or account
existence — so a magic-link create (`user.create.before` + `emailVerified: true`)
already links inline. **No mechanism change is needed.** What is stale is the
narration: the file's header comment describes `user.create.before` as
"verified-provider OAuth", and the fragment's insert comment likewise. That
wording now under-describes the intent and will read to a future agent as though
magic-link is excluded.

## Task

1. **Confirm** the guard in `modules/user-account/api/link-contact-on-signup.yaml`
   fires for a magic-link create: `point == user.create.before` and
   `user.emailVerified == true` → links the contact inline. If (and only if) you
   find the guard actually gates on a provider/account signal, fix it to key on
   verified email alone; per the current source it already does, so expect **no
   routine change**.
2. **Update the comments** in `link-contact-on-signup.yaml` so the
   `user.create.before` case is described as **"any create with a verified email
   (verified-provider OAuth _and_ magic-link)"** rather than "verified-provider
   OAuth". State the constraint (verified email is the match key; a magic-link
   user has no `account` row, so nothing may key on provider/account), not the
   history. Follow CLAUDE.md's comment rule — describe the current behaviour, do
   not narrate the change.
3. If `modules/shared/contact/create-or-link-contact.yaml` carries any comment
   implying OAuth-only creation for the `user.create.before` branch, align it the
   same way. Do **not** change the fragment's logic — it already matches purely on
   `lowercase_email`.

## Acceptance Criteria

- The merge-on-signup guard demonstrably covers a magic-link create (verified
  email, no account row) — confirmed by reading the guard, no provider/account
  key present.
- Comments in `link-contact-on-signup.yaml` (and, if needed, the shared fragment)
  describe the binding as provider-agnostic verified-email, covering magic-link.
- No behavioural/routine change unless the guard was found to be provider-gated
  (it is not, per current source).
- `pnpm ldf:b` from `apps/demo` still succeeds.

## Files

- `modules/user-account/api/link-contact-on-signup.yaml` — modify — update
  binding-condition comments to state provider-agnostic verified-email intent;
  routine unchanged unless the guard is found provider-gated.
- `modules/shared/contact/create-or-link-contact.yaml` — modify (only if a comment
  implies OAuth-only `user.create.before`) — align comment wording; logic
  unchanged.

## Notes

- This fragment is **shared verbatim with user-admin's invite flow** (parent
  Decision 7/8) — it is `_ref`'d by relative path from both. Any change must stay
  var-free and must not diverge the two callers. Comment-only edits are safe;
  a logic change here would need to be re-validated against user-admin's invite.
- The `_payload.point` injection is noted upstream as landing "in the next
  experimental release"; until then it resolves null and the write-back no-ops
  (the upsert still runs). That is a pre-existing accepted condition, out of scope
  here — do not try to work around it.
