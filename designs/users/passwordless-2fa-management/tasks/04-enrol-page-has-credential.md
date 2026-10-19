# Task 4: Enrol page — read `has_credential` via the page-scoped gate exemption (Decision 2)

## Context

After Task 2, `modules/user-account/pages/two-factor-enrol.yaml` drives its render off
`enrol.done` and no longer offers a password signal. This task makes the forced-enrol page apply
Decision 1's rule identically to the modals: hide the password field and its intro from a
passwordless caller, and coalesce the `TwoFactorEnable` param null→`''`.

The page's old "runs no Lowdefy request" property was a workaround for the `required` gate
refusing an unenrolled caller at every endpoint — not a design goal. **Task 1's `pageId`
forwarding closes that gap**: a request invoked from the enrol page inherits the page's existing
`pageId === enrolPageId` exemption, so the page can now run a self-scoped `get_accounts` and read
`has_credential` — the same request and the same signal the modals use, no bespoke channel.

**Prerequisites:** Task 2 (this file's `enrol.done` refactor and the gate shapes it leaves) and
Task 1 (the `pageId` forwarding, without which the `get_accounts` fetch trips `enrol_required`).

The page is composed via `_ref: { module: layout, component: auth-page }`. `auth-page` accepts a
`requests:` var (see `modules/user-account/pages/accept.yaml`, which passes
`requests: [ _ref: requests/get_invitation.yaml ]`). Reuse the existing shared request file
`modules/user-account/requests/get_accounts.yaml` — do not fork a new one.

## Task

In `modules/user-account/pages/two-factor-enrol.yaml`:

**1. Add the request.** Add a `requests:` entry to the `auth-page` vars:

```yaml
requests:
  - _ref: requests/get_accounts.yaml
```

`get_accounts` auto-fetches on page load (as it does on the view page), so
`get_accounts.0.has_credential` is available to the visibility gates below.

**2. Gate the password field and its intro on `has_credential`.** Extend the two gates Task 2
produced — currently `_and: [ { _not: { _state: enrol.done } }, { _eq: [enrol.phase, password] } ]`
— with a third conjunct `{ _request: get_accounts.0.has_credential }`, on:

- `enrol.password` (the `PasswordInput`)
- `enrol_totp_intro` (the "Confirm your account password…" copy)

A passwordless caller then sees a clean "Generate QR code" screen (title, generate button,
passkey option) with no password mention; a password caller sees the field as before.

**3. Coalesce the enable param.** In `enrol_generate.onClick` → `enrol_enable` (`TwoFactorEnable`),
change `password: { _state: enrol.password }` to
`password: { _if_none: [ { _state: enrol.password }, '' ] }`.

**4. Rewrite the header comment.** Update the block Task 2 already rewrote to additionally:

- drop the "makes NO Lowdefy request / self-sufficient on client actions" framing — the page now
  runs `get_accounts` under the page-scoped gate exemption;
- note that `has_credential` from `get_accounts` gates the password field + intro and that the
  `TwoFactorEnable` param coalesces null→`''`, exactly as the Decision 1 modals do.

Do not touch the passkey branch (`enrol_passkey_btn` / `PasskeyRegister`) — it needs no password
and already works for a passwordless caller.

## Acceptance Criteria

- The enrol page runs `get_accounts` on load and it resolves (not refused by `enrol_required`)
  when Task 1's `pageId` forwarding is installed.
- A passwordless caller (`has_credential` false) sees no password field or password intro on the
  TOTP `password` phase, and `enrol_enable` fires with `password: ''`.
- A password caller (`has_credential` true) sees the field + intro and enrols with their password
  as before.
- The done-state / `enrol.done` behaviour from Task 2 is unchanged.
- `pnpm ldf:b` builds clean (verified in Task 6).

## Files

- `modules/user-account/pages/two-factor-enrol.yaml` — modify — add `get_accounts` request; AND
  `has_credential` into the `enrol.password` + `enrol_totp_intro` gates; coalesce the
  `enrol_enable` param; extend the header comment.

## Notes

- One mechanism everywhere: read `has_credential` from `get_accounts.0.*` exactly as the modals
  do. Do **not** introduce a `_user.hasCredential` session fact (an earlier, rejected plan).
- The exemption is self-bounding: `getRequestConfig` resolves requests by
  `pages/{pageId}/requests/{requestId}.json`, so a spoofed `pageId` can only reach requests that
  live on the enrol page — no security widening beyond the intended read.
