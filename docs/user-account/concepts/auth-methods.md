---
title: Auth methods
module: user-account
type: concept
concepts:
  [
    auth-methods,
    providers,
    build-authConfig,
    error-handling,
    two-factor,
    magic-link,
    passwordless,
  ]
---

# Auth methods

The login and signup pages are **method-driven**: they render whichever sign-in
methods the deployment enables, and nothing else. This page explains where "which
methods" comes from, what the module configures, and how errors and the 2FA
challenge are handled.

## Enablement is read, not configured

**Which** methods exist is the app's `auth:` config's decision, read at build time
through `_build.authConfig`:

| `_build.authConfig` field      | Enables                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `emailAndPassword.enabled`     | Password form (login + signup) and change-password / reset flows |
| `magicLink.enabled`            | Magic-link send (email → "send me a link"); passwordless when password is off |
| `passkey.enabled`              | Passkey button (login) and passkey management (workspace)        |
| `twoFactor.enabled`            | 2FA enrolment in the Security tile                               |
| `providers` (`[{ id, type }]`) | One OAuth button per configured provider                         |

There are **no `methods` / `two_factor` / `passkeys` module vars**. Restating an
`auth:` fact as a module var is exactly the drift `_build.authConfig` exists to
prevent — a mirror var and the real config inevitably fall out of sync. Turn a
method on or off in `auth:` and the pages follow with no module change.

## What the module owns: OAuth display metadata

The auth config's provider projection carries only `{ id, type }` — no label,
icon, or ordering. That display metadata is genuinely the module's to own, so it
lives in the `providers` var, keyed by provider id:

```yaml
providers:
  - id: google
    label: Google
    icon: AiOutlineGoogle
    order: 1
  - id: github
    label: GitHub
    icon: AiOutlineGithub
    order: 2
```

The page cross-references the two sources: it renders a button for **each provider
`_build.authConfig` reports enabled**, drawing label / icon / order from this var.
A provider enabled in `auth:` but absent from `providers` falls back to rendering
its id; a `providers` entry for a provider the config does not enable renders
nothing. Enablement is the config's call; appearance is the var's.

> Contrast with roles: role display labels live in the platform role catalog
> (`auth.roles[].label`, projected via `_build.authConfig.roles`), which is why
> `user-admin`'s old `roles` var was retired. Providers go the other way — the
> projection omits their display metadata, so it stays a module var.

## Magic-link: send a link, never navigate inline

When `magicLink.enabled` is true the login page adds an email → "send me a link"
affordance. It reads the one canonical `id: email` input (the same field the
password submit uses when both methods are on). Pressing send dispatches a single
sign-in call in magic-link mode and — because that send returns `{ status: true }`
with **no session** — it cannot navigate. Instead the page flips to a
**`link-sent`** render: a "Check your email" result naming the address, a **Resend
link** button, and a "Use a different email" link back to the form. Resend is
guarded by a **short cooldown** (the button disables for ~30s after each send) so a
user can't tap through the send rate limit.

Placement follows the primary method:

- **Password on (mixed deployment):** the send is an alternative-method button
  below the "or" divider, alongside the OAuth / passkey buttons (placed first,
  closest to the email).
- **Password off (passwordless deployment):** the send is the primary action
  directly under the email — see [Passwordless-primary](#passwordless-primary-sign-up-collapses-into-sign-in).

### Where the emailed link lands

The send carries the two verify-callback targets the module owns:

- a **new** user — an unknown-but-admittable email, created at verify time — lands
  on the module's **`onboarding`** page as a first-time user;
- a returning user lands on the inbound `?callbackUrl=` (or the app home).

The error callback is left to the engine default — `authPages.error`, i.e. the
login page — so an **expired or already-used link** returns to login with
`?error=INVALID_TOKEN` (see the error table below).

## Passwordless-primary: sign-up collapses into sign-in

When `emailAndPassword.enabled` is **false** and `magicLink.enabled` is **true**,
the deployment is _passwordless_: the login page renders **email-only** — no
password field, no "Forgot?" link — with the magic-link send as the primary action
under the email. There is a single email → link action for everyone: a known user
signs in, an unknown-but-admittable email is created at verify time and routed to
onboarding. So **sign-up collapses into sign-in**, with these consumer-observable
consequences:

- **There is no `/signup` route.** The signup page is assembled only when
  `emailAndPassword.enabled` is true, so a passwordless build ships no `/signup`.
- **The app must repoint the `signUp` auth-page role at login.** The module
  declares a static `authPages.signUp: signup`. This one role cannot be gated
  module-side: an `auth:` block can't read `_build.authConfig` — it would be
  reading the very auth-config projection that `authPages` is itself part of, a
  self-reference — so the role stays a fixed page id the build always emits.
  A passwordless deployment **must** therefore set `auth.authPages.signUp: login`
  in its own app config (app config wins per role). Omit it and the `signUp` role
  points at a page that was never built and **404s at runtime** — the build does
  not catch this.

A **mixed** deployment (password _and_ magic-link) is the other case: `/signup`
**is** built, and it offers the magic-link send as an alternative-method button
below its "or" divider, exactly as `/login` does.

> Passwordless is the migration path for a formerly-passwordless (v0.x
> email-link) deployment. See
> [Migrating from the v0.x surface](../how-to/migration.md).

## Error handling splits by method

Sign-in errors arrive by two routes, and the page handles both through **one
error-code → message table**:

- **Password** sign-in returns errors inline on the `Login` call — the page maps
  the code to a friendly message in place.
- **OAuth and magic-link** can't return inline (the user has left for the
  provider or clicked an emailed link), so membership / verification failures
  arrive as a **redirect to `auth.authPages.error`**, which points at the login
  page. The page reads the code off the query string (`_url_query: error`) and
  maps it through the same table.

Mapped codes:

| Code                        | Meaning                                                          | Disposition                                                              |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `MEMBERSHIP_REQUIRED`       | The hard wall — the account exists but has no access to this app | **Terminal** — form-hiding "no access" wall                              |
| `EMAIL_NOT_VERIFIED`        | Sign-in blocked pending email verification                       | **Terminal** — form-hiding wall                                          |
| `INVALID_EMAIL_OR_PASSWORD` | Bad email or password                                            | Inline toast (password path only)                                        |
| `INVALID_TOKEN`             | Magic link expired or already used                               | **Retryable** — stays on the login form, warning notice, send reachable  |

`INVALID_TOKEN` is the one **retryable** redirect code: unlike the terminal codes
(which replace the form with a "no access" wall), it leaves the login form — and
so the email input and magic-link send — in place, and raises a dedicated warning
notice ("this link has expired or was already used — request a new one") so the
user can send a fresh link without leaving the page.

The table keeps a **catch-all `default` branch**, so any unmapped code (a provider
error, a rate limit / 429) degrades to a generic "an error occurred" message
rather than rendering blank. The named codes are the mapped set, not an exhaustive
list.

There is **no dedicated error page** — the login page serves the
`authPages.error` role and renders the failure as a login-page state.

## Two-factor routing is internal

When a 2FA-enrolled user signs in, the `Login` result signals two-factor-required
and the page routes to the module's own `two-factor` page (TOTP code or backup
code, with an optional trust-device option). `authPages` has no 2FA role — this
routing never leaves the module.
