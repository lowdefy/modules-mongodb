# F10 — Mixed-deployment login UX: password form + magic-link button together is confusing

**Status:** `promoted` · **Area:** user-account / login · **Owned by:**
[mixed-login-method-first](../../../_completed/mixed-login-method-first/design.md) (method-first chosen)

In the mixed config (`emailAndPassword` + `magicLink` both on), the login page shows the
full password form _and_ a magic-link button below the "or" divider — the shipped
composition, with password primary and magic-link demoted to an alternative-method button.
In testing this reads as cluttered and ambiguous: two sign-in mechanisms competing for
attention, unclear which to use.

## Proposed alternative — method-first, progressive disclosure

Show only the **email input** plus two method buttons ("Email me a link" and "Use
password"). Clicking **Use password** reveals the password field (+ submit + "Forgot?") and
hides the other method buttons; a "back" affordance returns to the method choice. This keeps
the passwordless-primary and password-only renders clean too — one method means no chooser.

## The open decision

This reworks the current "email hoisted, magic-link as an alternative-method button" layout,
so it is a design/product call, not a CSS tweak. It must be reconciled with the parent
login design's Decision 1 (password primary, magic-link demoted), and checked so it does not
regress the OAuth/passkey button placement (they are peers below the divider today).

Lowest priority — an enhancement, not a defect.
