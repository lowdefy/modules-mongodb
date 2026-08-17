# F56 — `POST /api/auth/two-factor/enable` is very slow

**Status:** `needs-root-cause` · **Area:** user-account / 2FA enrolment (performance)

Enrolling TOTP is sluggish: the request to `http://localhost:3003/api/auth/two-factor/enable`
(the BetterAuth `enable` endpoint behind the `TwoFactorEnable` action — Manage modal
`modal_enroltotp.yaml` and forced-enrol page `two-factor-enrol.yaml`) takes a long time to return
the `totpURI` + backup codes, leaving the enrol dialog visibly hanging after the user submits.

Observed on the dev rig (localhost:3003). Not yet timed or root-caused — filed as an observation.

## Not yet investigated

Recorded, not diagnosed. Candidate causes to check when this is picked up (unverified):

- **Password / backup-code hashing cost.** BetterAuth's `enable` mints a secret, encrypts it, and
  generates a batch of backup codes; if any of that runs the configured password hasher (scrypt) it
  is deliberately expensive, and a batch of codes multiplies it. This would be inherent per-call cost,
  not a module bug.
- **A slow / unindexed Mongo write** on the account or two-factor row during enable.
- **Dev-server JIT / cold-compile** overhead specific to localhost (cf.
  [F12](_completed/F12-dev-server-jit-hang.md)) rather than the endpoint itself — time a warm second
  call to separate the two.

Next step is to time the endpoint (cold vs warm, and against `verify` / `generate-backup-codes`) to
tell inherent crypto cost apart from a fixable hot spot before deciding whether anything is actionable.
