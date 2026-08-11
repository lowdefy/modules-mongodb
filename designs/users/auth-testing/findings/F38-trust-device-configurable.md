# F38 — Trust-device (30-day) should be configurable / disable-able by the deployment

**Status:** `enhancement` · **Area:** user-account / 2FA

The 2FA challenge offers a "Trust this device for 30 days" switch (pre-checked), and it works —
a trusted device skips the challenge on subsequent logins for the window. Some deployments will
want to **require a second factor on every login** and therefore need to disable trust-device
(or tune the window) rather than having a fixed 30-day skip baked in.

## The ask

Expose trust-device as an **auth or module var** so a deployment can:

- **Disable** it entirely (challenge on every login — no "trust this device" affordance), and/or
- **Tune the window** (the currently-fixed 30 days).

Right now the affordance is unconditional and the duration is fixed, so a security-sensitive
deployment cannot opt out.

## Open question

- Where does the var belong — the app's `auth.twoFactor` config (alongside `enabled` /
  `required`) or a `user-account` module var? Likely `auth.twoFactor` since the window is a
  BetterAuth twoFactor-plugin concern; confirm the plugin exposes a configurable
  trusted-device duration and a way to suppress the option.
- When disabled, the challenge page should not render the switch at all (not just default it
  off).
