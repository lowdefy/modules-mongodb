# Phase 4 — Cross-cutting invariants

> **Depends on:** Phases 1, 2, 3. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

- [ ] **Freshness across modules**: admin edits a target's profile → the target's **next request** shows the fresh header/avatar (re-denorm on the target's `users` row; no target-side `UpdateSession` needed)
- [ ] **Contact uniqueness**: a signup and an invite racing on the same email yield **one** `user-contacts` row (partial-unique `lowercase_email` reconcile) — not two
- [ ] **Co-location (negative)**: temporarily point one module connection at a different DB → contact data goes **blank everywhere** (the silent `$lookup` failure); then revert
- [ ] **Endpoint gate**: a caller without the instance's gate role hitting a `user-admin/**` routine is rejected by the app's own `auth.api.roles`; a caller who holds the gate role but not `admin` in the administered organization is rejected by the step's per-organization floor
- [ ] **Change stamps**: every contact write carries `created`/`updated` stamps (Verify in Compass)
- [ ] **Redirect safety (`callbackUrl`)**: a crafted off-site `?callbackUrl=https://evil.example` carried into login, magic-link, or verify-email is **not** honoured — after auth the user lands on the app home or an in-app path, never redirected off-origin. Probe each entry that forwards a `callbackUrl` (login, magic-link-send, verify-email, accept).

### Required-field validation — `Validate` scoping _(landed 2026-07-31)_

One defect class across eight forms, so test them as a single pass. Every one of these
passed a container id (`params: modal_changepw`) to `Validate`, which is an **exact-id**
matcher with no cascade to descendants — it matched only the Modal container, which has no
validation of its own, so the action **reported success while validating nothing**. All
eight now match the namespace their inputs actually write to.

Submit each form with a required field **empty** and confirm a **red field-level error**
on the field, and that the request never reaches the server.

**Read this before running these, or a pass will look like a fail:** these `Validate`
actions carry no `messages` config, so a validation failure **also** raises a summary
toast — "2 fields are invalid" or similar. That is the engine's validation summary, **not**
the server-error toast these items are checking against. Red field + summary toast = pass.
Server error message = fail.

Six are live defects today — a blank first or last name currently saves:

- [ ] `modal_enroltotp` **phase `scan`** — empty confirmation code (F22b: this used to reach `TwoFactorVerify` with an empty code)
- [ ] `modal_enroltotp` **phase `password`** — empty password (new guard; previously an empty password round-tripped to BetterAuth and came back as "check your password", blaming the user for a blank field)
- [ ] `modal_changepw` — empty current/new password
- [ ] `modal_disable2fa` — empty password
- [ ] `user-account` → **Profile** modal — clear **one of the two name fields** (`form_core.yaml` marks both `profile.given_name` and `profile.family_name` required)
- [ ] `user-admin` → `view` → **Profile** modal — same two fields, admin-side. A live defect: an admin can currently save a member with a blank name
- [ ] `user-admin` → **invite form** — clear a name field. This is also the **multi-pattern-regex proof**: its params span `^profile\.`, `^roles$` and `^member_attributes\.`, and the error must come from the `profile.` half

Two are **dead guards** — they have no input that can fail a required check, so **a passing
form proves nothing**. For each, temporarily mark one field `required: true` and confirm the
regex catches it, then revert:

- [ ] `user-admin` → **Global attributes** modal (`modal_global`) — inputs are `user_attributes.*` only. Note `^global\.` (what the container id suggests) matches **zero** blocks
- [ ] `user-admin` → **Access/Attributes** modal (`modal_access`) — inputs are bare `roles` + `member_attributes.*`. Note `^access\.` matches **zero** blocks. Its `roles` `required: true` is **inert** and cannot be the test: `required` on an array input synthesises `pass: { _not: { _type: 'none' } }`, and an array input is seeded to `[]`, which is not `none`
