# Task 1: `@lowdefy/api` engine bump — `allowPasswordless` + `pageId` forwarding

> **External repo.** The files below live in the `@lowdefy/api` package source, **not** in
> `modules-mongodb` (they are absent from this tree and from `node_modules`). This task is
> executed against the `@lowdefy/api` source repo by whoever owns it, then published and the
> dependency bumped/reinstalled into `apps/demo`. Tasks 3 and 4 cannot be verified end-to-end
> until this bump is installed.

## Context

`user-account`'s passwordless 2FA fixes (Decisions 1 and 2) both depend on two small,
independent engine changes that the design ships as **one bump**. Neither is a hard blocker —
until the bump lands, passkey is the only passwordless enrol route; both TOTP routes wait on it.

BetterAuth's four password-gated 2FA endpoints (`enable`, `disable`, `get-totp-uri`,
`generate-backup-codes`) each call `shouldRequirePassword(ctx, userId, allowPasswordless)`
(`better-auth/dist/utils/password.mjs:26-30`). It short-circuits `if (!allowPasswordless) return
true` (`:27`); only **with** the flag set does it return `false` for a credential-less user and
`true` for one holding a `credential` account with a password (per-user, not global). The
installed engine instantiates the twoFactor plugin **without** the flag, so the short-circuit
fires and every caller is asked for a password — the coalesced `''` that Decision 1 sends is
rejected `INVALID_PASSWORD`.

Separately, the forced-enrol page needs to run a `get_accounts` request, but the `required`
enrolment gate refuses an unenrolled caller at every Lowdefy endpoint. The engine already
exempts the enrol **page** from the gate (`authorizeOutcome` carries `pageId === enrolPageId →
allow`, and `callRequest.js` stamps the invoking `pageId` onto `context`), but
`authorizeRequest.js` calls `authorize(requestConfig)` **without** forwarding `{ pageId }`, so
the exemption never fires for a request.

## Task

Two independent changes, landed together in one engine bump:

**1. Instantiate the twoFactor plugin with `allowPasswordless: true`.**
`getBetterAuthConfig.js:385` currently pushes `twoFactor({ issuer, schema })` with no
`allowPasswordless`. Add `allowPasswordless: true` to those options so `shouldRequirePassword`
restores its per-user waiver (`false` for a credential-less caller, `true` otherwise).

**2. Forward the invoking `pageId` into request authorization.**
`authorizeRequest.js` calls `authorize(requestConfig)`; change it to pass
`{ pageId: context.pageId }` into the authorize call so a request invoked from the enrol page
inherits the page's existing `pageId === enrolPageId` exemption. This is naturally bounded:
`getRequestConfig` resolves requests by `pages/{pageId}/requests/{requestId}.json`, so the
exemption reaches only requests actually registered on the enrol page — a spoofed `pageId`
cannot reach requests that don't live there.

Security note (part 2): the enrolment floor runs **after** authentication and roles, so it is
not a data boundary — exempting an enrol-page request only lets an already-authenticated,
already-role-authorized caller run a self-scoped read of their own account one step before
enrolling. Do not weaken the ordering.

## Acceptance Criteria

- `shouldRequirePassword` returns `false` for a credential-less caller once the flag is set
  (and `true` for a caller holding a password credential). Add a test covering this.
- A non-enrol page's request is **not** exempted from the `required` gate, and an enrol-page
  request **is** exempted. Add a test covering both directions.
- Engine builds and existing auth tests pass; publish and bump/reinstall `@lowdefy/api` in
  `apps/demo`.

## Files

- `@lowdefy/api` `.../getBetterAuthConfig.js` (~`:385`) — modify — add `allowPasswordless: true`
  to the `twoFactor({ ... })` options.
- `@lowdefy/api` `.../authorizeRequest.js` — modify — forward `{ pageId: context.pageId }` into
  the `authorize(...)` call.
- Engine test files — add the two tests above.
- `apps/demo` — bump/reinstall the `@lowdefy/api` dependency to the published build.

## Notes

- Verified absent from all six installed builds (latest Aug 7). The lifecycle design records the
  platform as already setting `allowPasswordless` (line 273), but the shipped engine has lost or
  never carried it — carry it explicitly here rather than assuming it live.
- These two changes are genuinely independent (different files, different tests) but ship as one
  bump; Task 3 depends only on change 1, Task 4 only on change 2.
