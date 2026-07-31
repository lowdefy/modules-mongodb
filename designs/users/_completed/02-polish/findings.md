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

**Implemented (2026-07-27).** Both fields removed; the page is email + password.
`SignUp` still passes `name: ""` — BetterAuth's `/sign-up/email` body schema has
`name: z.string()` (required, empty allowed; verified in `better-auth@1.6.23`
`dist/api/routes/sign-up.mjs`), so the param cannot simply be dropped. `""` is
what BetterAuth's own magic-link plugin writes for a first sign-in with no name,
so the bare-create posture of Decision 7 holds and onboarding's re-denorm fills
`users.name`.

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

**Implemented (2026-07-27).** `modal_changepw` now sets
`properties.description` and keeps `label.disabled: true` — dropping
`label.disabled` is wrong: with no `title` the field label falls back to
rendering the **block id**, which is the same class of defect.

Sweep outcome:

- `two-factor.yaml` (`trust_device`) had that second variant — `description` set,
  no `label.disabled`, so the label area rendered `trust_device :`. Confirmed by
  screenshot, fixed the same way.
- `comment-input.yaml` already uses `description` + `label.disabled`.
- `fields/checkbox_switch.yaml` needs no change: it is a documented pass-through
  that exposes `title`, `description` and `label_disabled` to the field author,
  and the "no title → block id label" fallback is Lowdefy's behaviour for **every**
  input in the field library. Special-casing this one component would break that
  uniformity for no gain.

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

**Implemented (2026-07-27).**

**(a)** `layout: { gap: 16 }` on both `modal_profile` Modals — the same content
gap the shared `layout` `card` component already sets, so modal and card forms
space identically. `layout.gap` flows to a container's `content` area generically
(`@lowdefy/layout` `layoutParamsToArea`), and `Modal` renders its blocks through
that area. The now-redundant `marginBottom: 8` on the account modal's avatar box
was dropped (gap before margins).

**(b) Decision: surface honorific in both; `show_honorific` keeps its `false`
default.** `show_honorific: true` added to the demo's `user-account` entry, so all
three demo entries opt in — and the demo now matches the config example already
published in `docs/user-account/index.md`. The default was **not** flipped: it
would add a field to the profile forms of every existing consumer of three
modules on upgrade, and an honorific is a per-deployment content choice, not a
correctness one. "One correct way" is about mechanically enforcing a pattern, and
there is no correct universal answer here to enforce.

**Coupled fix.** `onboarding` bound its honorific selector to
`profile.honorific`, while the shared `form_core` (and the contact view template)
use `profile.title`. Invisible while `show_honorific` was off for `user-account`;
turning it on would have shipped an onboarding-captured honorific that the
profile tile and edit modal never display. Onboarding now writes `profile.title`.
The two option lists still differ (onboarding omits `Prof`) — that is the
duplication **F13** (`04-planning/`) removes, left alone here.
