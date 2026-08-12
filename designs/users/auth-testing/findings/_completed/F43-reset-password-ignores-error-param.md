# F43 — Reset-password page ignores `?error=INVALID_TOKEN` on load (no notice); expired-token submit only toasts

**Status:** `needs-design` · **Area:** user-account / password-reset

Opening a **consumed / expired** password-reset link lands on
`/user-account/reset-password?error=INVALID_TOKEN`, but the page shows the **normal reset form
with no error state at all** — no "link expired or already used" notice, no signal the link is
dead. The user only discovers the failure by filling the form and submitting, which then
raises a **transient toast**: "We couldn't reset your password. Request a new reset link and
try again."

## Root cause (confirmed)

`pages/reset-password.yaml` `onInit` **unconditionally** seeds `reset_view: form`:

```yaml
onInit:
  - id: seed_reset_view
    type: SetState
    params:
      reset_view: form
```

It never reads `_url_query: error`, so the `?error=INVALID_TOKEN` the reset callback appended
is **ignored on load**. Contrast `pages/login.yaml`, whose `onInit` reads `?error` and flips
to a notice / `noaccess` state with friendly copy — reset-password has no equivalent branch.
The only error handling is the submit `catch` (`toast_reset_error`, a `DisplayMessage`), which
fires **after** a doomed submit against the stale token.

## What passes / fails

- **PASS — no silent password set.** Submitting against the expired token fails; the password
  is not silently changed. The security-relevant invariant holds.
- **FAIL — no on-load notice.** The expected inline "link expired or already used" notice
  never appears; the page looks like a live reset form.
- **FAIL — toast, not persistent.** The only feedback (on submit) is a transient toast that
  auto-dismisses too fast — the same accessibility problem as
  [F42](_completed/F42-wrong-password-toast-should-be-inline.md).

## The open decision

Mirror the login page's pattern on reset-password:

- **Read `?error` in `onInit`** and, for `INVALID_TOKEN`, render a **persistent inline notice**
  ("This reset link has expired or was already used") instead of the bare form — ideally with
  a **"request a new reset link"** affordance (a route back to forgot-password), so the user
  isn't dead-ended.
- **Move the submit-failure feedback from a toast to a persistent inline alert** (shared
  decision with F42).

Same family as [F40](../F40-verify-email-failure-silent-login-redirect.md) — an auth page that
receives an `?error=` code but renders no error state — but a distinct page and root cause
(this one's `onInit` simply doesn't look at the query).
