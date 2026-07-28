# Planning — each needs a design call before implementation

Findings that can't go straight to an agent: each has an open decision about
contract, schema, or intended behaviour. Roughly ordered by priority.

Finding IDs are stable — carried over from the auth-testing run. Don't renumber.

**Verification status:** F14 is code-verified open as of 2026-07-27. The rest are
behavioural findings from the 2026-07-24 test run and have **not** been re-tested
since — confirm before planning.

**F3 + F4 are closed** — fixed by `5484bc1d` (build-time `_var: user.<field>`
paths baked `null`/`''` into the routine; now runtime `_get`) and verified live on
2026-07-27 against the auth-testing rig: both hook bindings complete clean,
contacts carry the real email, `profile.contactId` links on both paths, and a
pre-existing contact is matched rather than duplicated. Evidence in
[`merge-on-signup-wiring/design.md`](../../user-account-better-auth/_completed/merge-on-signup-wiring/design.md#verification).
No data cleanup is needed: the corrupted rows are gone from the test DB and a
scan for the F3 signature returns zero.

---

## F26 — Custom Members-table column renders a header but no data → designed

The demo's Department column (`apps/demo/modules/user-admin/vars.yaml`,
`components.table_columns`) shows a header with empty cells: the members list row
carries no `department` and no `profile` bag, and nothing connects a custom column
to a projection. The same gap is worse on the export, where `download_columns` has
no escape hatch at all.

**Designed → [`../table-row-contract/design.md`](../table-row-contract/design.md).**
The design gives every members read one shared row shape carrying the `profile`,
`user_attributes` and `member_attributes` bags under the same names as the
`fields.*` vars, so a column's `field:` is the same string as the form block id
that collects it. It also closes the raw `user` / `contact` join payloads that
every row currently ships, and fixes the export's missing `request_stages`
injection.

---

## F13 — Onboarding profile fields should be configurable (required / optional / hidden)

Today onboarding's `fields.profile` (first/last name, etc.) are required, and
`profile.profile_created` gates entry to the app — so every consumer must collect
the same fields to get past onboarding.

Add config (a module var, likely alongside the existing profile-field config) so a
deployment can mark each onboarding field **required**, **optional**, or
**hidden** — including hiding the whole step for apps that don't want to collect a
name up front.

**Default stays required** (fine for this deployment); this is about giving
consumers the escape hatch, not changing the default.

**Open design question:** how is `profile_created` satisfied when all fields are
optional or hidden — mark complete on first visit, or require an explicit
continue? Resolve this in the design, don't defer to implementation.

Pairs with **F6** (`02-polish/`): once name is dropped from signup, onboarding is
the single place it's captured, so its configurability matters more.

---

## F2 — No resend-verification affordance for a locked-out unverified user

A user who signed up, lost or missed the verification email, and later returns to
**log in** hits `EMAIL_NOT_VERIFIED`. The login page's intended `noaccess` alert
copy is "Check your inbox for the verification link, then sign in again" — a
**dead end** if the email is gone: `SendVerificationEmail` resend buttons live
only on `signup.yaml` and `verify-email.yaml`, which a returning user has no
obvious route back to.

The checklist explicitly calls for "EMAIL_NOT_VERIFIED (**with resend
affordance**)".

**Options:** add a resend button (→ `SendVerificationEmail` for the entered
email) to the login page's unverified state, or route the user to `verify-email`
with the email prefilled.

Independent of **F1** — stands even once the alert renders correctly.

---

## F29 — Orphaned-role editing: label-less tag in the selector, uninformative `ROLE_NOT_FOUND` on save

With a role on the member that isn't in the `auth.roles` catalog (e.g. `old`), the
**display** side is fine — the Attributes card renders it as a flagged "no longer
configured" chip, matching design intent. The **edit** side has two problems.

**(a) Selector renders a bare tag with no label.** The roles multiselect builds
its options from the catalog only, so a selected orphaned value has no matching
option and renders as a tag with no text. Fix: inject the member's orphaned role
ids into the selector options (labelled e.g. `old (no longer configured)`) so they
render and remain visible and removable — matching the card's treatment.

**(b) Saving with the orphaned role still selected throws `ROLE_NOT_FOUND: old`.**
BetterAuth validates every submitted role against the catalog and rejects the
unknown one, so any roles save that keeps an orphaned role fails. Two issues: the
error is **uninformative** for the operator (raw `ROLE_NOT_FOUND: old`), and it
**conflicts with the design intent** that orphaned roles are "removable, never
silently stripped" — today an admin can't save any role change while an orphaned
role remains, they must remove it first.

**Decide:** preserve orphaned roles through the save (don't re-validate
pre-existing ones) so an unrelated edit doesn't force their removal, **or** make
removal the explicit required action with a friendly message ("Role 'old' is no
longer configured — remove it to save"). At minimum, map `ROLE_NOT_FOUND` to
human copy naming the offending role.

---

## F17 — User avatar dropped from the `/user-account/view` header; the shared page-title component doesn't render it

The implementing agent chose not to edit the shared `page_title` component
(reasonable — it's cross-module surface), so the signed-in user's avatar is no
longer rendered in the page header here, and by extension isn't shown consistently
everywhere the shared header appears.

**Decide where the avatar belongs:** extend the shared page-title/header component
to render the user avatar (so it appears uniformly across pages — the "one correct
way"), or add a sanctioned avatar slot that pages opt into.

Needs a design call on the shared header contract.

Pairs with **F14** — even once the header renders an avatar, there's no stored
`profile.picture` to show.

---

## F14 — Avatar selection is never persisted: no `profile.picture` is ever produced

The whole avatar chain the header depends on is `state.profile.picture` →
`update-profile` API → `write-profile` merges it onto the contact and re-denorms
it to `users.image` (`modules/shared/contact/write-profile.yaml:104`) → header
reads `_user.image` (`components/profile-avatar.yaml`,
`components/user-avatar.yaml`).

**But nothing ever produces `profile.picture`.** In onboarding
(`pages/onboarding.yaml`) the avatar is only a live CSS-gradient preview: the
"Change colour" button cycles a top-level `avatar_color_index` state key (seeded
in `onInit`, L27 / L82–107) that is **(a)** not under `state.profile`, so it's
excluded from the `payload.profile: _state: profile` save (L172–175), and **(b)**
never converted into a stored `picture` SVG.

A repo-wide grep for `picture` (re-verified 2026-07-27) finds only _readers_ —
no generator anywhere. Confirmed against the DB after a full onboarding submit:
the contact and user `profile` bags have every typed field but **no `picture` /
`image`**, and the header shows the fallback icon.

Net: the avatar feature is non-functional end-to-end — the colour choice is
ephemeral and no image is stored.

**Fix needs to** (1) generate the gradient + initial SVG (from initials and the
chosen `avatar_colors` entry) and (2) write it into `state.profile.picture` (or
the save payload) so `write-profile` can denorm it.

**Also:** update the stale claim in `user-avatar.yaml:12-14` that "any user …
already has a generated gradient+initial SVG stored in profile.picture" —
currently untrue.

Distinct from **F9** (`05-ui-rework/`), which is the picker's _aesthetics_; F14 is
that its output is never saved.

---

## F21 (remainder) — 2FA backup-codes modal: copy shouldn't require closing the modal

The parse error is **fixed** (`8c9c9743` — `modal_backupcodes.yaml` now uses
`_array.join` instead of the unsupported `| join` nunjucks filter). What remains
is the **interaction design**.

Copy is wired to `onClose` and "Copy" is the modal's `cancelText` — so clicking
Copy **dismisses the modal**. The backup codes are shown **once and never
re-fetched**, so the natural action costs the user their 2FA recovery codes if
anything goes wrong in the copy.

**Rework:** a copy/download control _inside_ the body that keeps the modal open,
given the one-time nature of the codes.

**Also re-confirm** `state.enroltotp.backup_codes` is populated end-to-end now
that the parse error no longer masks it.

---

## F22 — 2FA enrol modal is confusing: visual gaps, both actions shown at once, password lingers in state

`modal_enroltotp.yaml` has a two-phase body gated on `state.enroltotp.uri`
(Phase 1 password → Generate; Phase 2 QR + confirmation code), but the composition
reads as muddled. Treat as a single rework.

**(a) No spacing between the password field and the "Generate QR code" button.**
Phase-1 blocks (`enroltotp_intro_setup` / `enroltotp.password` /
`enroltotp_generate`, L51–87) are stacked with no `layout.gap` on the modal
content and no margins, so the password input sits flush against the button. Add
a content gap. (Same class as F27(a) in `02-polish/`, but belongs with this
rework.)

**(b) Both the body "Generate QR code" button AND the footer "Confirm & enable"
button show in Phase 1.** "Confirm & enable" is the Modal's static `okText`
(L18), so it's present in both phases; in Phase 1 it's premature — clicking it
fires `onOk` → `TwoFactorVerify` with an empty confirmation code → error. The
confirm/enable action should appear **only in Phase 2** (once `enroltotp.uri` is
set). Suggested: move it out of the static footer into a phase-2-gated body
button (mirroring the phase-1 Generate button), and/or drive the footer
conditionally — so exactly one primary action is offered per phase.

**(c) The account password persists in state across close/reopen.** `onOpen`
resets `enroltotp: {}` (L21–25) but the observed behaviour is that
`enroltotp.password` still carries the previously-typed password on reopen. Two
problems: the reset isn't taking effect (investigate whether `onOpen` re-fires
and whether the `PasswordInput` value is cleared by the parent `SetState`), and
there's **no `onClose` reset** — so the account password sits in client state
after the modal is dismissed, a hygiene/security concern for a credential field.
Clear `enroltotp` (at least `.password`) on close, and confirm the open-time reset
actually clears the input.

---

## F10 — Mixed-deployment login UX: password form + magic-link button together is confusing

In the mixed config (`emailAndPassword` + `magicLink` both on), the login page
shows the full password form _and_ a magic-link button below the "or" divider —
the shipped composition, per parent Decision 1 (password primary, magic-link
demoted). In testing this read as cluttered and ambiguous: two sign-in mechanisms
competing for attention, unclear which to use.

**Proposed alternative (method-first, progressive disclosure):** show only the
**email input** + two method buttons ("Email me a link" and "Use password");
clicking **Use password** reveals the password field (+ submit + "Forgot?") and
hides the other method buttons; a "back" affordance returns to the method choice.
This keeps the passwordless-primary and password-only renders clean too — one
method means no chooser.

**This reworks parent Decision 1's "email hoisted, magic-link as an
alternative-method button" layout**, so it's a design change to reconcile with the
parent design, not a CSS tweak. Needs a design/product call; check it doesn't
regress the OAuth/passkey button placement (they're peers below the divider
today).

Lowest priority in this folder — it's an enhancement, not a defect.
