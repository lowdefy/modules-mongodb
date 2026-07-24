# Merge-on-signup identity wiring

The merge-on-signup hook (parent [Decision 7](../design.md)) links or creates a `user-contacts` row for every new user by their verified email, and links the resulting `contactId` back onto the auth `user`. In testing it did neither correctly: it created contacts with an **empty email** and never set `profile.contactId` on password signups. The cause is a build-time/runtime operator confusion in the shared `create-or-link-contact` fragment — it reads the verified user's fields with a build-time `_var` path that navigates into an unresolved runtime `_payload` node, so the real email and id never reach the routine. This sub-design records the root cause and the fix, which is entirely module-side.

## Proposed change

1. In `modules/shared/contact/create-or-link-contact.yaml`, replace every field access of the shape `_var: user.<field>` with `_get: { from: { _var: user }, key: <field> }`, so the field is read at **runtime** against the resolved user object instead of at **build time** against the operator node.
2. Leave the fragment's var contract unchanged — a single `user` object (plus `connection_id`, `binding_point`). **Both callers stay as-is**; the fix is contained to the fragment body.
3. No platform change: `_var`'s "missing path → default null" is established platform behaviour and is accepted as-is. The fix adapts the module to that behaviour.

## Problem

### Symptoms (F3 / F4)

From the auth-testing run ([`scripts/auth-testing/FINDINGS.md`](../../../scripts/auth-testing/FINDINGS.md), F3/F4):

- **F3** — after signup, the `user-contacts` row is created with `lowercase_email: ''` and `email: null` instead of the verified address, on **both** binding paths (`email.verified` for password, `user.create.before` for magic-link/OAuth). Because every upsert keys on the same empty `lowercase_email: ''`, a second signup **matches the first user's bare contact** — two users end up sharing one contact, and a later onboarding save writes one identity's profile onto the other's record. Real cross-identity data corruption, not a cosmetic bug.
- **F4** — on the `email.verified` (password) path, `UpdateUserProfile` throws `requires a "userId" property`, so the `profile.contactId` link-back never runs and (halt-on-first-error) the routine aborts. `_user.profile.profile_created` then never resolves, so onboarding routing misbehaves. The `user.create.before` path does not hit this — it sets `contactId` inline via `:return` (though to the wrong bare contact, per F3).

### Root cause: build-time `_var` reading a runtime `_payload` node

The shared fragment reads the verified user's fields like this:

```yaml
filter:
  lowercase_email:
    _string.toLowerCase:
      _string.trim:
        _var: user.email
# …and _var: user.id for UpdateUserProfile.userId, _var: user.profile for the :return
```

`_var` is a **build-time** ref-var operator; `_payload` is a **runtime** operator. The caller passes the user as one opaque runtime node:

```yaml
# modules/user-account/api/link-contact-on-signup.yaml
vars:
  user:
    _payload: user
```

At build time `_var: user.email` resolves `get(vars.user, 'email')` where `vars.user` is the unresolved `{_payload: 'user'}` node. There is no `email` key on that node, so `_var` returns its default (`null`). The `_string.trim` / `_string.toLowerCase` wrappers then constant-fold on the static `null`, and the build bakes literal values into the routine. Confirmed in the built artifact (`apps/demo/.lowdefy/server/build/api/user-account/link-contact-on-signup.json`):

```json
"filter":       { "lowercase_email": "" },
"$setOnInsert": { "email": null, "lowercase_email": "" },
"…UpdateUserProfile…": { "properties": { "userId": null, … } }
```

The runtime `Login`/verify flow never supplies the email or id — they were already frozen to `null`/`""` at build. Every symptom follows:

- `email: null`, `lowercase_email: ''` on **every** signup → F3 (and the shared empty key is what collides two users onto one contact).
- `userId: null` → `UpdateUserProfile` throws → F4, on the `email.verified` branch that uses `_var: user.id`.
- The `user.create.before` `:return` uses `_var: user` (the **whole** node, no sub-path) — that substitutes `{_payload: user}` intact, so it resolves at runtime and sets `contactId`. It only "works" because it doesn't sub-navigate; it still links to the empty-email contact.

### Why user-admin's invite was unaffected

The same fragment is `_ref`'d by `modules/user-admin/api/invite.yaml`, which passes the user as a build-time **object literal** with a runtime **leaf**:

```yaml
vars:
  user:
    email:
      _payload: email
```

Here `_var: user.email` navigates `get(vars.user, 'email')` → the `{_payload: 'email'}` node, which survives the build as a runtime operator and resolves correctly at request time. The invite build artifact keeps the `_string.toLowerCase`/`_string.trim` chain over `{_payload: email}` intact — proof that a runtime-shaped value reaches the upsert. The two callers diverged in how they shaped `user`, and only user-account's shape triggered the build-null.

## The fix

Read each field at runtime with `_get`, keeping the `user` var whole:

```yaml
# before                          # after
_var: user.email        →         _get: { from: { _var: user }, key: email }
_var: user.id           →         _get: { from: { _var: user }, key: id }
_var: user.profile      →         _get: { from: { _var: user }, key: profile }
_var: user              →         _var: user        # unchanged — whole record for the :return base
```

`_var: user` substitutes the whole node (`{_payload: user}` for user-account, `{email: {_payload: email}}` for user-admin) into `_get.from` with no sub-navigation, so it survives the build. `_get` is a runtime operator: it resolves `from` (→ the real user object) and _then_ reads `key`. The field lands at request time, against real data.

**Callers do not change.** The fix works for both existing shapes:

| Caller       | `user` var (unchanged)           | `_get { from: {_var: user}, key: email }` at runtime  |
| ------------ | -------------------------------- | ----------------------------------------------------- |
| user-account | `{ _payload: user }`             | resolves `_payload: user` → user object → `.email` ✅ |
| user-admin   | `{ email: { _payload: email } }` | resolves the object → `.email` ✅                     |

Fields the fragment reads and where:

- `email` — upsert `filter.lowercase_email`, `$setOnInsert.email` + `$setOnInsert.lowercase_email`, and `read_contact` query (all via the `toLowerCase`/`trim` chain over the `_get`).
- `id` — `UpdateUserProfile.userId` in the `email.verified` branch.
- `profile` — the `_if_none` base of the `user.create.before` `:return` merge (this access was silently build-nulled too, so the OAuth user's existing profile bag was being dropped on the inline return; the fix restores it).

This also closes the latent `_var: user.profile` build-null in the `:return` branch — same bug family, not yet observed only because fresh `user.create.before` records carry no prior profile.

## Key decisions

### 1. `_get` runtime navigation over individual leaf vars

The alternative fix is to explode the fragment's var contract into one runtime leaf per field — `user_email: {_payload: user.email}`, `user_id: {_payload: user.id}`, `user_profile: {_payload: user.profile}`, plus `user_record: {_payload: user}` for the whole-record `:return` base — and have the fragment read `_var: user_email` etc. (whole-node substitution, so no build-null).

Rejected in favour of `_get` because:

- **Zero caller churn.** The leaf approach requires rewriting **both** callers' `vars` blocks (and user-admin's is currently correct); `_get` fixes the bug entirely inside the fragment.
- **One coherent contract.** A shared fragment that may gain a third caller is easier to wire correctly when it asks for one `user` object than when it asks for four parallel leaves that must all be remembered. This is the "one correct way" preference — a single object a caller either has or doesn't.
- The cost is per-access verbosity in the fragment body (a 3-line `_get` vs a 1-line `_var`), paid once, internally.

### 2. No platform guard — adapt to `_var`'s established behaviour

`_var` returning its default (`null`) when a path is missing — including when the path descends into an unresolved operator node — is established platform behaviour and will not change. This sub-design does not ask for a build-time guard that would reject such navigation; the module is responsible for not writing a build-time path into a runtime node. `_get` is that responsibility discharged.

### 3. Contract stays consistent with user-admin

Parent Decision 7 and [user-admin-better-auth task 02](../../user-admin-better-auth/tasks/02-shared-contact-fragments.md) specify `create-or-link-contact` as **one shared spec** across both modules. The `_var: user.<field>` → `_get` change is internal to the fragment body and leaves the `user` / `connection_id` / `binding_point` var contract intact, so both designs stay on one fragment with no divergence. The whichever-ships-first authoring rule (Decision 8) is unaffected.

## Impact & follow-ups

- **Data cleanup (test only).** The corrupted demo rows — the shared bare contact `aa320f44…` carrying two identities, and password users with no `profile.contactId` — are test-run artifacts. Wipe and re-seed after the fix; no migration is warranted for real data (the module has not shipped).
- **F6 is separate.** Signup name capture vs onboarding (FINDINGS F6) is a product call unrelated to this wiring bug; not addressed here.

## Verification

Not settleable from source alone — needs a real verify/magic-link flow against MongoDB (a `/r:dev-test` step, not a build check). After the fix, confirm in the DB:

1. Password signup + verify → the `user-contacts` row carries the real `email` / `lowercase_email` (never `''`/`null`), and the `users` doc has `profile.contactId` set (F4 cleared).
2. A second signup on a **different** email creates its **own** contact (no collision on `''`) (F3 cleared).
3. Magic-link signup → `user.create.before` sets `profile.contactId` to a contact bearing the correct email.
4. Build stays green (`pnpm ldf:b`) and the built `link-contact-on-signup.json` now shows `_get`/`_payload` nodes surviving to runtime rather than baked `null`/`""`.

## Related

- Parent: [user-account on BetterAuth](../design.md) — Decision 7 (merge-on-signup), Decision 8 (shared fragments).
- [user-admin-better-auth](../../user-admin-better-auth/design.md) — the invite flow that `_ref`s the same fragment (and whose var shape was unaffected).
- [`scripts/auth-testing/FINDINGS.md`](../../../scripts/auth-testing/FINDINGS.md) — F3, F4.
