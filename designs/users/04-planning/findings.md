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
[`merge-on-signup-wiring/design.md`](../../users/_completed/user-account-better-auth/_completed/merge-on-signup-wiring/design.md#verification).
No data cleanup is needed: the corrupted rows are gone from the test DB and a
scan for the F3 signature returns zero.

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

---

## F30 — The change stamp is injected into MQL expression context unwrapped

All three profile write seams stamp their update with

```yaml
updated:
  _ref:
    module: events
    component: change_stamp
```

inside an **aggregation-pipeline** `$set` — `modules/shared/contact/write-profile.yaml`,
`modules/contacts/api/create-contact.yaml` (both `created` and `updated`) and
`modules/contacts/api/update-contact.yaml`. The stamp's default
(`modules/events/module.lowdefy.yaml:43-52`) resolves `user.name` from
`_user: profile.name`.

In expression context a string beginning with `$` is a **field path**, not a literal. So a user
whose `profile.name` starts with `$` has that resolved against the document being written: a user
named `$email` stamps `updated.user.name` with the target contact's email address instead of their
own name. The audit trail records the wrong value, silently.

This is the same defect class as the
[avatar-generation design's D6](../_completed/avatar-generation/design.md), which wraps every payload-derived
value in these exact stages in `$literal`. It was **deliberately left out of that change**: D6
scopes its rule to values originating in the payload, and `profile.name` reaches the stamp
indirectly — derived from a payload on some earlier write, stored, then read back through `_user`.
Same lines, same fix, different provenance.

**The fix is one wrapper per site**, e.g.

```yaml
updated:
  $literal:
    _ref:
      module: events
      component: change_stamp
```

**The open decision** is scope, which is why this is here rather than done: `change_stamp` is a
consumer-overridable module var, so wrapping it declares that a consumer may never put a live MQL
expression in their stamp template. That is almost certainly the right contract — the var's own
description says it "Contains runtime operators (`_user`, `_date`) that evaluate per-request",
meaning Lowdefy operators, not MQL — but it is a contract change to state explicitly in
`docs/shared/change-stamps.md`, and it should be applied uniformly across every change-stamped
write in the repo rather than only the three seams above.
