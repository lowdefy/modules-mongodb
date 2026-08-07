# F33 — Onboarding save doesn't refresh the session before routing, so the guard bounces back to onboarding

**Status:** `needs-design` · **Area:** user-account / session-freshness

After completing onboarding and hitting **Save & continue**, the page reloads but the user
**stays on onboarding**. Manually navigating to home afterwards works. Observed as a recurring
issue — a prior fix did not resolve it.

## Root cause (as understood)

`onboarding.yaml`'s submit sequence is:

1. `Validate`
2. `CallAPI update-profile` — writes `profile.profile_created: true` to the DB
3. `UpdateSession` (`refresh_session`)
4. `Link { home: true }`

The app router guard (`apps/demo/pages/router.yaml`) redirects to onboarding whenever
`_user.profile.profile_created !== true`. The symptom is consistent with `UpdateSession` not
having propagated the freshly-written `profile_created: true` into the caller's `_user` by
the time the `Link` fires — so the router still reads the **stale** session
(`profile_created` absent/false) and bounces straight back to onboarding. A later manual
navigation succeeds because by then the refreshed session has landed.

Same class as the already-shipped `update-session-store-refresh` work (campaign finding F19,
excluded as resolved) — but **that fix does not cover this onboarding case**, which is why it
recurs.

## The open question

The fix approach is undecided (the obvious one already shipped and didn't hold here):

- Does `UpdateSession` resolve only after the new session is readable, or does the following
  action need to **await** propagation before navigating?
- Should the onboarding submit **not** rely on `_user` freshness at all — e.g. navigate only
  once the refreshed session confirms `profile_created`, or have the router tolerate the
  just-saved state some other way?

Decide the contract for "write session-affecting state → navigate on it" so onboarding (and
any other flow with the same shape) routes correctly on the first navigation.
