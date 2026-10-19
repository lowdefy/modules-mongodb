# User Account on BetterAuth — Implementation Tasks

Ordered task set for [design.md](../design.md). This is a **breaking rebuild** of the
existing `modules/user-account` module against the BetterAuth-based auth engine —
the old NextAuth passwordless module is retired in place, not ported.

Source of truth: `design.md`. Screens come from `mockups/screens/*` (already
pipeline-ready — 1440px, `data-ldf-component` shared tags, `data-layer` state
layers — so no `lowdefy-mock` authoring step is needed). The screens are simple and
all share the auth-page base, so each is **one task** that runs the `mock-to-lowdefy`
skill end to end (frame → layout → content) **and** wires it. The green-build gate
lives at the very end (a page with mock data and `TODO(request-substitute)` comments
builds fine).

## Ordering & parallelism

1. **Foundation (01–08)** runs first and mostly in sequence — the module skeleton,
   plugin, indexes, shared components, shared write fragments, and the two APIs.
   These give every downstream task a buildable target and the requests the screen
   tasks consume.
2. **Screen tasks (09–18)** — one per screen. Each builds + wires its page in a
   single task. They depend only on foundation (connections + APIs + actions), never
   on each other, so they run in parallel once foundation is done.
3. **Finish (19–20)** — docs (incl. the v0.9→this migration guide) then the single
   verify gate (`pnpm ldf:b` + render/e2e).

## Task map

| #   | Task                                 | Depends on         | Group      |
| --- | ------------------------------------ | ------------------ | ---------- |
| 01  | Scaffold module + manifest + demo    | —                  | foundation |
| 02  | QR-code block plugin                 | —                  | foundation |
| 03  | Document contact + user indexes      | —                  | foundation |
| 04  | Migrate shared components to model   | 01                 | foundation |
| 05  | `write-profile` shared fragment      | 01                 | foundation |
| 06  | `create-or-link-contact` fragment    | 01, 03             | foundation |
| 07  | `update-profile` API                 | 05                 | foundation |
| 08  | `link-contact-on-signup` hook + bind | 06                 | foundation |
| 09  | login page                           | 01                 | screens    |
| 10  | signup page                          | 01                 | screens    |
| 11  | forgot-password page                 | 01                 | screens    |
| 12  | reset-password page                  | 01                 | screens    |
| 13  | verify-email page                    | 01                 | screens    |
| 14  | two-factor page                      | 01                 | screens    |
| 15  | accept-invitation page               | 01                 | screens    |
| 16  | logout page                          | 01                 | screens    |
| 17  | onboarding page                      | 01, 04, 07         | screens    |
| 18  | account workspace (`view`) page      | 01, 02, 04, 07     | screens    |
| 19  | Docs + migration guide               | all screens + APIs | finish     |
| 20  | Verify (build + render/e2e)          | all                | finish     |

## Screen → page mapping

| Mock screen            | Module page       | URL                        | Role                         |
| ---------------------- | ----------------- | -------------------------- | ---------------------------- |
| `login.html`           | `login`           | `/{entry}/login`           | `authPages.signIn` / `error` |
| `signup.html`          | `signup`          | `/{entry}/signup`          | `authPages.signUp`           |
| `forgot-password.html` | `forgot-password` | `/{entry}/forgot-password` | `authPages.forgotPassword`   |
| `reset-password.html`  | `reset-password`  | `/{entry}/reset-password`  | `authPages.resetPassword`    |
| `verify-email.html`    | `verify-email`    | `/{entry}/verify-email`    | `authPages.verifyEmail`      |
| `two-factor.html`      | `two-factor`      | `/{entry}/two-factor`      | module-internal routing      |
| `accept.html`          | `accept`          | `/{entry}/accept`          | `authPages.acceptInvitation` |
| `logout.html`          | `logout`          | `/{entry}/logout`          | public                       |
| `onboarding.html`      | `onboarding`      | `/{entry}/onboarding`      | protected                    |
| `account.html`         | `view`            | `/{entry}/view`            | protected (workspace)        |

## Note on granularity

Each screen is a single build-and-wire task rather than a per-phase chain
(frame/layout/content/wire) because the screens are simple and share the auth-page
base. The `mock-to-lowdefy` skill still runs its three phases in order _inside_ each
screen task; only the task boundary is coarser. The `account` (`view`) page is the
one heavy screen (workspace tiles + four modals) — task 18 extracts its tiles/modals
into `components/*` but stays one task.
