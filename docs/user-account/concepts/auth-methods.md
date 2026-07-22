---
title: Auth methods
module: user-account
type: concept
concepts:
  [auth-methods, providers, build-authConfig, error-handling, two-factor]
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
| `magicLink.enabled`            | Magic-link tab                                                   |
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

Friendly-message codes:

| Code                        | Meaning                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| `MEMBERSHIP_REQUIRED`       | The hard wall — the account exists but has no access to this app |
| `EMAIL_NOT_VERIFIED`        | Sign-in blocked pending email verification                       |
| `INVALID_EMAIL_OR_PASSWORD` | Bad email or password                                            |

The table keeps a **catch-all `default` branch**, so any unmapped code (an
expired / consumed link, a provider error, a rate limit) degrades to a generic
"an error occurred" message rather than rendering blank. The three named codes
are the friendly set, not an exhaustive list.

There is **no dedicated error page** — the login page serves the
`authPages.error` role and renders the failure as a login-page state.

## Two-factor routing is internal

When a 2FA-enrolled user signs in, the `Login` result signals two-factor-required
and the page routes to the module's own `two-factor` page (TOTP code or backup
code, with an optional trust-device option). `authPages` has no 2FA role — this
routing never leaves the module.
