# F41 — Magic-link send has no email validation; empty-email submit shows check-your-email, then redirects to a GitHub 404

**Status:** `root-caused` · **Area:** user-account / magic-link (+ redirect safety)

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

## Root cause — part 2 (the GitHub 404 mis-redirect, CONFIRMED)

Not a redirect-safety / `callbackUrl` defect. It is a **dispatcher-precedence bug** in the
`Login` action (`@lowdefy/client` `dist/auth/createAuthMethods.js`), triggered by the empty
email. `login()` selects its auth route in this order:

1. **Single-provider auto-fill** (`createAuthMethods.js:273`):
   ```js
   if (
     type.isNone(providerId) &&
     type.isNone(email) &&
     type.isNone(phoneNumber) &&
     providers.length === 1
   ) {
     providerId = providers[0].id;
   }
   ```
2. **Provider/social branch** (`:276`) → `signInSocial(...)`
3. **magicLink branch** (`:302`) → `signInMagicLink(...)`

With the field empty, `_state: email` is `null`/`undefined`, and `type.isNone` is true only for
`null`/`undefined` (`@lowdefy/helpers` `type.js:77`). The component passes no `providerId` and
no `phoneNumber`, and the demo configures **exactly one** provider — `github` / type `GitHub`
(`apps/demo/lowdefy.yaml:65-67`). All four conditions hold, so the auto-fill sets
`providerId = 'github'` and the **provider branch fires before the magicLink branch is ever
reached**. GitHub is a social type, so `signInSocial({ provider: 'github', ... })` does a
top-level navigation to GitHub's OAuth authorize URL; the dummy `clientId` can't resolve an
OAuth app, so GitHub returns a **404**. `magicLink: true` is never consulted — its branch is
unreachable whenever email is empty and a single provider is configured.

The action even has its own empty-email guard at `:307`
(`throw 'Login with magicLink requires an "email" param.'`), but the auto-fill shadows it, so
it is dead code in this configuration. The observed "check-your-email flips, _then_ redirects"
ordering matches: `signInSocial` returns its redirect data and the browser navigation is async,
so `show_link_sent` flips the view before the browser leaves for GitHub.

## Resolution — the two parts are one fix in this repo

The finding's worry (b) — that the redirect is an independent defect that could fire on a real
off-origin `callbackUrl` — is **ruled out**. The `callbackUrl` machinery
(`resolveCallbackURL` / `isAppRelativePath`, `createAuthMethods.js:25-84`) correctly rejects
protocol-relative / off-origin values; the GitHub navigation does not come from `callbackUrl`
at all, it is `signInSocial` navigating to GitHub's own endpoint. So:

- **Consumer fix (this repo, resolves both symptoms):** add the `Validate` on the email input
  (part 1's leading fix). Blocking the empty-email dispatch means `Login` is never called with
  a blank email, the single-provider auto-fill never triggers, and the GitHub redirect cannot
  occur. This is the whole story for the "email not required" symptom **and** the 404.
- **Upstream bug (`@lowdefy/client`, out of scope here):** an explicit `magicLink: true` should
  take precedence over the single-provider auto-fill (exclude `magicLink === true` from the
  `:273` condition, or move the magicLink branch ahead of it), so a blank-email magic-link send
  hits its own `:307` guard instead of silently becoming a social login. Worth reporting
  upstream; the consumer-side `Validate` is the fix we ship.
