# F41 — Magic-link send has no email validation; empty-email submit shows check-your-email, then redirects to a GitHub 404

**Status:** `investigate` · **Area:** user-account / magic-link (+ redirect safety)

Clicking **"Email me a sign-in link"** on the login page with the **email field empty**:

1. flips to the **"check your email"** state (as if a link were sent), then
2. **redirects to a GitHub 404 page** — an off-app, cross-site landing the user never asked
   for.

## Root cause — part 1 (validation gap, confirmed)

`components/magic-link-send.yaml` — the button's `onClick.try` runs
`begin_cooldown` (SetState) → `magic_link_send` (`Login`, `magicLink: true`,
`email: {_state: email}`) → `show_link_sent` (the check-your-email flip) → cooldown waits.
**There is no `Validate` action anywhere in the chain**, so an empty/blank `email` is never
blocked — the send dispatches with a blank address and `show_link_sent` runs regardless of the
result. Marking the `email` input `required` would not help on its own: `required` only takes
effect through a `Validate` action, and there is none here.

This is the **same defect class as the Phase-4 `Validate`-scoping pass**, but worse — those
eight forms had a _mis-scoped_ `Validate`; this form has **none at all**. The component is
shared by **both** the login and signup magic-link placements, so both are affected.

**Leading fix:** add a `Validate` scoped to the email input (`params: { regex: '^email$' }`,
matching the canonical `id: email` the page owns) as the first step of `onClick.try`, so a
blank email raises a field-level error and the send never dispatches.

## Root cause — part 2 (the GitHub 404 mis-redirect, NOT yet root-caused)

The component comment asserts a magic-link send "returns `{ status: true }` and no session, so
it cannot navigate" — yet an empty-email submit ended on a **GitHub 404**. Why the flow leaves
the app at all, and why it lands on GitHub specifically (the app has a GitHub OAuth provider
configured with dummy creds), is unexplained. Candidate leads to run down:

- Does the empty-email `Login` fall through to an OAuth/provider redirect path (GitHub being
  the configured provider), rather than the magic-link send path?
- Is the `callbackUrl` branch (`_url_query: callbackUrl` else `home: true`) resolving to
  something malformed when the send fails, producing an off-origin navigation? This is
  adjacent to the Phase-4 **redirect-safety (`callbackUrl`)** item — an auth entry point
  navigating off-origin is exactly what that check guards.

## The open question

Two things to settle: (a) confirm the validation fix above is the whole story for the
"email not required" symptom, and (b) **root-cause the GitHub 404** — establish whether it is
purely a consequence of dispatching a blank-email send (goes away once validation blocks it)
or an independent redirect-safety defect that could also fire on a real off-origin
`callbackUrl`. Until (b) is understood, treat the redirect as the more serious half.
