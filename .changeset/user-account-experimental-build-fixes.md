---
"@lowdefy/modules-mongodb-user-account": patch
---

**Fix profile updates and the 2FA backup-code copy under the stricter experimental Lowdefy build.** Two operator behaviours that the experimental engine tightened were breaking the account workspace:

- `_if` now rejects a non-boolean `test`, so `update-profile`'s `test: _payload: set_profile_created` threw on every non-onboarding profile save (aborting the write) and the Security tile's `test: _request: get_account.0.two_factor_enabled` threw on render for users without 2FA. Both `test:` values are now wrapped in `_boolean` so a `null`/absent value coerces cleanly.
- The backup-codes modal's Copy control used a runtime `_nunjucks` `| join` filter, which is unavailable in the runtime nunjucks env and threw `failed to parse` — silently dismissing the one-time-codes modal without copying. Copy now uses `_array.join`.
