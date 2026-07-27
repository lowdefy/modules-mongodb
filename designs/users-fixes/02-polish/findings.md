# Polish — small fixes, one agent pass

Straightforward changes with no open design question. Each has a decided
direction; none needs a planning step.

All **code-verified open** as of 2026-07-27.

Finding IDs are stable — carried over from the auth-testing run. Don't renumber.

---

## F6 — Signup captures first/last name, but the design routes name capture to onboarding

`modules/user-account/pages/signup.yaml` renders `profile.first_name` (L42) +
`profile.last_name` (L55) and passes `name` (first + last) to `SignUp` (L128/130),
so BetterAuth writes `users.name`.

But user-account Decision 7 says the merge-on-signup contact create is **bare**
("no name copied from the signup/OAuth payload… so first login routes through
onboarding"), and onboarding (Decision 5) owns canonical profile capture.

Net today: the typed name lands only on `users.name`, never reaches the
**contact** (the profile source of truth), and onboarding asks for first/last
name **again** — double entry, and `users.name` gets overwritten by the
onboarding re-denorm anyway.

**Direction (user, 2026-07-24): remove first/last name from the signup page.**
Confirmed at retest that the signup-captured name does **not** prefill
onboarding (fields came up blank), so keeping it on signup buys nothing but
double entry. Signup becomes pure email + password; onboarding owns name capture.

Pairs with **F13** (`04-planning/`) — once name is dropped here, onboarding is
the single place it's captured, so onboarding's field configurability matters more.

---

## F20 — Change-password modal's "sign out other sessions" toggle renders with no visible label

`modules/user-account/components/view/modal_changepw.yaml:55` —
`changepw.revoke_other_sessions` (a `CheckboxSwitch`) sets
`properties.title: "Sign out my other sessions"` **and** `label.disabled: true`.

For `CheckboxSwitch` the caption shown _next to the toggle_ is
`properties.description` (schema: "Text to display next to the checkbox");
`properties.title` renders in the field-label area, which `label.disabled: true`
then hides — so the control shows a bare switch with no text.

**Fix:** move the copy to `properties.description: "Sign out my other sessions"`
and drop the `label.disabled` / `title` combo.

**Sweep scope (verified 2026-07-27):** four files use `CheckboxSwitch` — check
the other three for the same blank-caption trap:

- `modules/workflows/components/comment-input.yaml`
- `modules/workflows/components/fields/checkbox_switch.yaml`
- `modules/user-account/pages/two-factor.yaml`

---

## F27 — Profile edit form: no spacing between fields, and honorific is inconsistent between the two consumers

Two issues on the shared profile edit form (`modal_profile.yaml`, used by both
`user-account` and `user-admin` via `_module.var: fields.profile` + a shared
honorific `_ref` gated on `fields.show_honorific`).

**(a) No gap between honorific / first name / last name (and the profile fields).**
The form stacks the inputs flush with no `layout.gap` on the container, so
honorific, given_name, family_name and the `fields.profile` blocks run together.
Since the fields are shared, this affects **both** the account workspace and the
admin `view` profile modals. Add a content gap.

**(b) Honorific shows in `user-admin` but not `user-account`.**
Verified 2026-07-27: `show_honorific: true` is set on
`apps/demo/modules/user-admin/vars.yaml:10` and
`apps/demo/modules/contacts/vars.yaml:6`, but **not** on the `user-account`
entry — so it defaults off. A user can set their title when an admin edits them,
but not when editing their own profile. The forms _are_ shared; only the gate var
diverges.

Decide and apply consistently: surface honorific in both, or neither. Given two
of three consumers already opt in, consider whether `show_honorific` should
**default on** so entries stay aligned without per-entry config — that's the
"one correct way" posture and removes a var each consumer must remember.

Same gap class as **F22**(a) (`04-planning/`), but F22's belongs with that
modal's rework.

---

## F15 (remainder) — repo-wide audit of `_if test:` sites passing raw values

The two **confirmed-blocking** sites were fixed in `8c9c9743` (`_boolean` wrap on
`api/update-profile.yaml` and `components/view/tile_security.yaml`). That commit
deliberately scoped itself to those two and left the repo-wide audit open.

On the experimental build (`0.0.0-experimental-20260723141834`) the `_if`
operator strictly requires `test` to be a boolean and throws otherwise
(`Operator "_if" param "test" must be type "boolean"`), so any remaining site
passing a possibly-`null`/`undefined` value straight into `test:` is a latent
throw.

**Scope (measured 2026-07-27):** ~10 sites pass a raw value, not the 376 raw
`test:` matches — most are already `_eq` / `_ne` / `_build.*`. Raw-value sites
seen include:

- `modules/layout/module.lowdefy.yaml:132` — `_media: darkMode`
- `modules/contacts/requests/search_contacts.yaml:63` — `_var: company_only_contacts`
- `modules/user-admin/components/view/tile_security.yaml:35,109` — `_module.var: suspension` / `impersonation`
- `modules/user-admin/pages/all.yaml:33` — `_module.var: download`

Classify each site as **write-blocking** (inside a write routine — aborts the
operation, nothing lands) vs **render-noise** (throws on render, logged as a
client `ConfigError` but non-blocking). Wrap in `_boolean` per the precedent set
by `8c9c9743` — minimal, reads as intent, coerces null/absent cleanly.

**Depends on the F15 platform call in `03-upstream/`.** If Lowdefy restores
truthy coercion, this audit is moot; if not, it's required. Cheap enough to do
either way — `_boolean` is correct under both engines.
