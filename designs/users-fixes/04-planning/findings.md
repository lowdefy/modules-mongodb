# Planning — each needs a design call before implementation

Findings that can't go straight to an agent: each has an open decision about
contract, schema, or intended behaviour. Roughly ordered by priority.

Finding IDs are stable — carried over from the auth-testing run. Don't renumber.

**Verification status:** F14 and F28 are code-verified open as of 2026-07-27. The
rest are behavioural findings from the 2026-07-24 test run and have **not** been
re-tested since — confirm before planning.

**F3 + F4 are closed** — fixed by `5484bc1d` (build-time `_var: user.<field>`
paths baked `null`/`''` into the routine; now runtime `_get`) and verified live on
2026-07-27 against the auth-testing rig: both hook bindings complete clean,
contacts carry the real email, `profile.contactId` links on both paths, and a
pre-existing contact is matched rather than duplicated. Evidence in
[`merge-on-signup-wiring/design.md`](../../user-account-better-auth/_completed/merge-on-signup-wiring/design.md#verification).
No data cleanup is needed: the corrupted rows are gone from the test DB and a
scan for the F3 signature returns zero.

---

## F28 — Activity timeline is always empty: user-admin/user-account write a flat display block the timeline can't read

> **RESOLVED 2026-07-27 — and the original diagnosis below was inverted.** The
> symptom was real; the attributed cause was backwards. The read side
> (`GetEventsTimeline`) is **correct** and matches the documented contract; the
> **write side** in `user-admin` / `user-account` was the bug. The original
> heading ("`GetEventsTimeline` still reads the retired app_name-keyed schema")
> and the fix it proposed are both wrong — acting on them would have hidden every
> `contacts` / `companies` / `activities` / `deals` / workflow-engine event, a
> strictly larger regression against a documented contract. Everything from
> "Root cause" down is preserved for the record; read the correction first.
>
> **Why the original inverted it.** Three compounding errors:
>
> 1. **A false claim in source, taken as fact.** `user-account/api/update-profile.yaml`
>    carried the comment "flat `event_display` — `app_name` keying is retired", and
>    `user-account/module.lowdefy.yaml` said "(Per-app keying is retired with
>    `app_name`.)" — which propagated into generated
>    `docs/user-account/reference/vars.md`. Both were wrong.
>    [`designs/app-operator`](../../app-operator/design.md) retired the `app_name`
>    **module var** (replaced by `_build.app: slug`); it explicitly **kept**
>    per-app display keying. Its §"Keep `display_key` as a manifest var" retains
>    it on purpose (the ops-app cross-read case), and design.md:45 says outright:
>    "`user-account` and `user-admin` are **not** in this list (BetterAuth
>    rebuild)… `events` is not either: it scopes display via `display_key`, not
>    `app_name`." The BetterAuth rebuild ran concurrently, misread "the var is
>    retired" as "the keying is retired", and baked that misreading into source.
> 2. **A biased data sample.** The test DB held only 9 events, **all** of them
>    written by user-admin/user-account — i.e. exclusively the broken writers.
>    Zero `contacts`/`activities` events existed to compare against, so "every
>    event is flat" looked like a completed migration rather than a localised bug.
> 3. **`docs/` was not consulted.** Per CLAUDE.md, `docs/` is the source of truth
>    for consumer-observable behaviour, and
>    [`docs/shared/event-display.md`](../../../docs/shared/event-display.md)
>    documents the app-keyed `$my-app.title` read in detail. A stale-looking
>    design note was trusted over current docs.
>
> **Evidence for the corrected diagnosis.** Built artifacts under
> `apps/demo/.lowdefy/server/build/api/` showed two shapes coexisting —
> `contacts/update-contact` → `"display":{"demo":{"title":…}}` (app-keyed) vs
> `user-admin/update-profile` → `"display":{"title":…}` (flat). Census: **9
> app-keyed writers** (contacts ×2, companies ×2, activities ×3, deals ×2), plus
> the workflow engine (`WorkflowAPI/schema.js` `slug` prop) and
> `activities/components/task-modal.yaml`'s pass-throughs — against **12 flat
> writers, all in user-admin (×11) and user-account (×1)**. `GetEventsTimeline`'s
> 28 tests pass and include a deliberate
> `describe("events without display_key display block are excluded")`, so the
> guard the original called stale is intentional and test-covered.
>
> **Fix applied.** All 12 flat endpoints now wrap the rendered block under
> `_build.app: slug` via `_build.object.fromEntries`, verified app-keyed in the
> build output. The flat `event_display` **var** contract (type → template) is
> retained deliberately — it is simpler than the app-keyed var map used by
> `contacts`/`companies`, and redundant now that `display_key` defaults to the
> slug; only the _written block_ is keyed. The two false claims were deleted and
> `pnpm docs:gen` re-run. `GetEventsTimeline`, the `events` manifest, and the
> `display_key` action reads (lines 265/277/279/290/296) were **left untouched** —
> all correct. The 9 pre-existing flat rows in the test DB are stale data the
> developer can clear at their discretion; no migration is warranted.
>
> **Standing lesson:** when a source comment asserts a schema decision, verify it
> against `docs/` and the owning design before building on it — and never treat a
> single app's event rows as a census of the collection's shape.

**High priority — this is the events module's flagship read** and affects every
timeline consumer, not just user-admin.

The Activity tile (`user-admin/components/view/tile_activity.yaml`) fetches via
the events module's `events-timeline` component → `GetEventsTimeline` plugin
request. Events **are** written and match the target (DB-verified: 4 `log-events`
rows with `user_ids: ["381b…"]`, plus flat top-level `title` / `description`), yet
the tile shows "No activity."

Root cause in
`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js`
(verified 2026-07-27):

> **Identifier note.** [`designs/app-operator`](../../app-operator/design.md) renamed the
> `EventsTimeline` connection property and the engine locals described below from `app_name` to
> **`display_key`**, and edited this same file. The finding itself still stands — only the
> identifier changed, not the schema mismatch — but re-verify the line numbers before acting on it.

- the `$match` requires a **top-level field named `<app_name>`** —
  `{ [app_name]: { $ne: null } }` (line 67, `app_name` = the `display_key` var =
  the app name, `demo`); and
- the display projection reads `$<app_name>.title` / `.description` / `.info`
  (lines 203–205).

Both assume the **old per-app-keyed display block** (`event.demo.title`). But
events were migrated to **flat `event_display`** ("app_name keying is retired",
per `update-profile.yaml`): actual docs have keys `_id, title, description,
contact_ids, user_ids, date, created, type, metadata, files` — **no `demo`
field**. So the app_name guard excludes **every** event → empty timeline, and the
projection would null the real top-level `title` even if a row slipped through.

**Write side is correct (flat); the read side and manifest are stale.**

**Fix:** migrate `GetEventsTimeline` to the flat schema — drop or replace the
`{ [app_name]: { $ne: null } }` guard (a flat `{ title: { $ne: null } }` presence
check, if any guard is even needed) and read `title` / `description` / `info`
from the top level. Rebuild the plugin `dist`.

**Also:** update the `events` manifest `display_key` doc
(`modules/events/module.lowdefy.yaml:25`), which still says "Events store per-app
display titles keyed by app name" — and **reassess whether `display_key` is still
needed at all** under the flat model. Note there are further `app_name` reads at
lines 265, 277, 279, 290, 296 (links/message extraction) that need the same
treatment.

NB a prior changelog "fix" tightened the timeline to _filter out_ events missing
the `display_key` field — under the flat schema that guard is exactly what now
hides everything.

---

## F26 — Custom Members-table column renders a header but no data; the slot contract has a design gap

The demo injects a Department column via `apps/demo/modules/user-admin/vars.yaml`
→ `components.table_columns: [{ headerName: Department, field: department, width:
140 }]` ("worked example of the `table_columns` slot"). The column header shows,
but every cell is empty — even though the profile carries `department`
(DB-verified: `contact.profile.department` / `users.profile.department`).

Root cause: `get_all_members`
(`modules/user-admin/requests/stages/members_base.yaml`) flattens only
name/picture/email/roles_arr/status/created/updated/signed_up — it does **not**
surface `department`, nor a top-level `profile` bag, so a column bound to
`field: department` finds nothing. Nothing connects the custom column to a
projection: the demo's `request_stages` sets only `write: []`, and the base stage
can't hardcode a consumer's custom field.

**This is a design gap in the slot contract, not just a demo omission.** Adding a
`table_columns` entry silently gives an empty column unless the consumer _also_
remembers to project the field via `request_stages.get_all_users` — opt-in
correctness that drifts, which is exactly what happened here.

**Prefer "one correct way":** have `members_base` carry the `profile` bag (or the
configured `fields.profile` set) onto the row so any `field: profile.<x>` column
just works.

**Secondary — field-path inconsistency:** the active slot uses `field: department`
while the orphan `apps/demo/modules/user-admin/components/table_columns.yaml` uses
`field: profile.department` (apparently unused). Reconcile to one shape once the
row contract is decided.

Per the repo rule that every capability ships a build-verified worked example,
the `table_columns` example should be one whose data resolves end-to-end.

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
