# Implementation Tasks — Passwordless two-factor management

## Overview

Makes `user-account`'s 2FA management surfaces work for magic-link / OAuth-only members
(no password credential). Derives from `designs/users/passwordless-2fa-management/design.md`:
Decision 3 (enrol-page done-flag) ships as pure in-module config; Decisions 1 (tile + both
modals) and 2 (forced-enrol page) apply a single "password field iff `has_credential`" rule
and ride one `@lowdefy/api` engine bump.

## Global Constraints

- **The rule (one correct way):** on any 2FA management surface, the password field is
  **shown, required, and validated iff the caller holds a password credential**; the
  `password` param is **always sent as a string** (empty when the caller holds none), letting
  `allowPasswordless` waive it server-side.
- **One signal, every surface:** "holds a password credential" is read only from
  `get_accounts.0.has_credential` (the `$facet` flag in `modules/user-account/requests/get_accounts.yaml`).
  No bespoke per-surface channel; no new `_user.hasCredential` session fact.
- **Coalesce idiom:** a null/hidden password field sends `''` via
  `{ _if_none: [ { _state: <ns>.password }, '' ] }` — preserving the "reset leaves to null"
  convention while satisfying each action's string type-check.
- **Two ship-waves:** Decision 3 (Task 2) is pure in-module and ships now. Decisions 1 and 2
  (Tasks 3, 4) send `password: ''` and depend on the engine bump (Task 1) being installed —
  without it the server rejects `''` with `INVALID_PASSWORD` for every caller.
- Repo YAML conventions apply throughout (snake_case block/request/action ids, kebab-case
  page ids); see `CLAUDE.md` "Lowdefy Project Rules".

## Tasks

| #   | File                              | Summary                                                                                                            | Depends On |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-engine-bump.md`               | `@lowdefy/api`: `allowPasswordless: true` on twoFactor plugin + forward `pageId` into request auth (external repo) | —          |
| 2   | `02-enrol-page-done-flag.md`      | Enrol page: replace `_user.two_factor_enrolled` on all 17 blocks with local `enrol.done` (Decision 3)              | —          |
| 3   | `03-decision1-tile-modals.md`     | Tile unhide + both modals apply the `has_credential` rule; fix `get_accounts` comment (Decision 1)                 | 1          |
| 4   | `04-enrol-page-has-credential.md` | Enrol page: add self-scoped `get_accounts`, gate password field + intro, coalesce param (Decision 2)               | 1, 2       |
| 5   | `05-docs-auth-methods.md`         | Correct two now-stale paragraphs in `docs/user-account/concepts/auth-methods.md`                                   | 2, 4       |
| 6   | `06-verify.md`                    | `pnpm ldf:b` build check; then manual passwordless smoke test (needs engine bump + server)                         | 2, 3, 4    |

## Ordering Rationale

- **Task 1 (engine bump) is the foundation for Decisions 1 and 2.** It lives in the external
  `@lowdefy/api` source repo (not this tree — the engine files referenced by the design are
  neither in the repo nor in `node_modules`). It must land and be published/installed into
  `apps/demo` before Tasks 3 and 4 can be verified end-to-end. It carries two independent
  changes that the design ships as one bump.
- **Task 2 (Decision 3) is independent of everything** — pure in-module config, no engine
  dependency, ships now. It runs first among the in-repo work.
- **Task 3 (Decision 1) depends only on Task 1.** Different files from the enrol page (tile +
  two modals + `get_accounts` comment), so it is independent of Tasks 2 and 4.
- **Task 4 (Decision 2) depends on Task 1 and Task 2.** It edits the same file as Task 2
  (`two-factor-enrol.yaml`) and AND-s `has_credential` into two visibility gates that Task 2
  restructures, so it must follow Task 2; and its new `get_accounts` request only survives the
  `required` gate once Task 1's `pageId` forwarding is live.
- **Tasks 3 and 4 should land in the same commit/PR wave as the engine bump** (Decision 1's
  tile unhide exposes modals that reject passwordless callers until the modal fixes and the
  waiver are both present — the design's blast-radius coupling).
- **Task 5 (docs)** corrects two concept-doc paragraphs falsified by Decisions 3 and 2, so it
  follows Tasks 2 and 4.
- **Task 6 (verify) is last** — the build check gates the in-repo config; the passwordless
  smoke test is a human/`/r:dev-test` step that additionally needs the engine bump installed.

## Scope

**Source:** `designs/users/passwordless-2fa-management/design.md`
**Context read:** `design.md`, `F47-security-tile-hides-2fa-for-passwordless-users.md`,
`F48-forced-enrol-page-broken-for-passwordless.md`; the five changed source files; `docs/user-account/concepts/auth-methods.md`; `modules/layout` auth-page wiring (`accept.yaml`).
**Review files skipped:** `review/review-1.md`, `review/review-2.md`.

## Note on docs scope

The design's "Files changed" section does not list any `docs/` file, but two paragraphs in
`docs/user-account/concepts/auth-methods.md` are provably falsified by the decisions it ships
(the enrol page's "never issues a server-side request" claim → false under Decision 2; the
`_user.two_factor_enrolled` "reads this same field to decide when done" claim → false under
Decision 3). Task 5 corrects exactly those two paragraphs. This is derived docs impact from
correct decisions, not new scope — flagged here so the omission in the design is visible.
