# Two-factor lifecycle — Upstream Asks

**Superseded — no outstanding asks.** The three asks this file once carried (the `ResetUserTwoFactor`
step, `auth.twoFactor.required` + the enrolment fact, and magic-link/OAuth challenge interception) have
all been absorbed and decided in the platform designs. They are no longer asks; they are owned engine
decisions the module consumes.

Where they landed:

| Former ask                                                                                           | Now owned by                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ResetUserTwoFactor` step (+ `RevokeUserPasskeys`)                                                   | [two-factor-lifecycle](../../../../lowdefy-design/designs/auth-upgrade/features/two-factor-lifecycle/design.md) Decisions 1, 3 |
| `auth.twoFactor.required`, `_user.twoFactorEnrolled`, `authPages.twoFactorEnrol`, the enrolment gate | same, Decisions 4–8, 11                                                                                                        |
| Magic-link/OAuth challenge interception                                                              | [auth-hardening](../../../../lowdefy-design/designs/auth-upgrade/_completed/auth-hardening/design.md) (baseline)               |

The module surfaces that consume these — and the contract each provides — are listed in
[design.md](design.md)'s "What this consumes from upstream" table. Nothing here is outstanding against
the platform; the module work in `design.md` can build against the delivered engine.
