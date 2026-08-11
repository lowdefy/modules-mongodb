# F45 — 2FA tile mutations leave `_user` session stale (no `UpdateSession`)

**Status:** `investigate` · **Area:** user-account / security tile + session-freshness

A grouped finding for the small **session-freshness** defects on the account Security tile:
a 2FA mutation writes the database correctly, but the in-session `_user` object is **not
refreshed**, so tiles/headers/guards read stale factor state until a manual page reload. The
suspected common fix is an `UpdateSession` on each mutation chain (same family as
[F33](./F33-onboarding-updatesession-stale-redirect.md); a redirect variant is
[F44](./F44-modal-totp-enrol-redirects-home-codes-lost.md)).

New related small items get appended here rather than spawning one finding each.

## Items

### 1. Disable 2FA — `_user.two_factor_enabled` stays `true` until reload

**Repro (2026-08-11):** Disable 2FA from the Security tile (`TwoFactorDisable`).

- **Write-side PASS:** the `user-two-factors` row is removed from the DB.
- **Stale-session BUG:** the dev-server `_user` object still read `two_factor_enabled: true`
  immediately after the disable; it only flipped to `false` after a manual page refresh. The
  disable chain does not refresh the session, so anything reading `_user.two_factor_enabled`
  (tile state, guards) is stale for the rest of the session until a reload.

**Likely fix:** add `UpdateSession` to the disable action chain so `_user` reflects the removed
factor without a reload.

## The open question

Is the fix a per-chain `UpdateSession` on each 2FA mutation, or does the tile need a single
shared post-mutation refresh step that every chain (enable, disable, replace, regenerate)
routes through? Decide once so all four chains stay consistent rather than each remembering to
call `UpdateSession`. This is the "one correct way" call the grouping exists to force.
