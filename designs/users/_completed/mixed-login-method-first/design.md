# Method-first login for mixed deployments

A follow-up to the [magic-link sign-in](../user-account-better-auth/_completed/magic-link/design.md)
sub-design, promoting finding [F10](../../auth-testing/findings/_completed/F10-mixed-login-ux.md).
That design shipped a **mixed** login page (password + magic-link, and often OAuth/passkey)
where the password form is always primary and every alternative method sits below an "or"
divider as a peer button. Manual testing found the result cluttered and ambiguous — two
sign-in mechanisms competing for attention with no clear default. This design replaces the
mixed composition with **method-first progressive disclosure**: lead with the email field and
a short list of method buttons, and reveal the password field only when the user picks it.

## Relationship to the parent design

This **supersedes the "Composition when both methods are on (mixed deployment)" paragraph of
the parent magic-link [Decision 1](../user-account-better-auth/_completed/magic-link/design.md)**
— specifically its rule that the password "Sign in" is the always-visible primary and
magic-link/OAuth/passkey are always-visible demoted peers. Everything else in Decision 1 is
retained and is in fact the backbone of this design:

- **Config-driven, not a mode.** The render is still a pure function of `_build.authConfig`;
  there is no new "method-first" flag. The chooser simply _is_ the mixed render.
- **The single hoisted `email` field** shared by the password submit and the magic-link send
  stays exactly as-is (it is what lets the chooser offer magic-link without a second email
  field).
- **The password-only and passwordless renders are unchanged** — "one method means no
  chooser". Method-first is only the composition for a deployment that offers password _and_ at
  least one alternative.

The parent design is `_completed/` history and is left intact but for a one-line pointer to
this design on its Decision 1.

## Decision — method-first progressive disclosure

Within the existing `signin` view, a new reveal sub-state switches between two layouts:

**Method chooser** (the default landing):

```
email
[ Use password ]          ← reveals the password form
[ Email me a link ]       ← magic-link send (shared component)
──────── or ────────      ← one divider, only when an OAuth/passkey group exists below
[ Continue with Google ]
[ Sign in with a passkey ]
```

**Revealed password form** (after choosing "Use password"):

```
email
Password           Forgot password?
[ •••••••• ]
[ Sign in ]
← Other options           ← returns to the chooser
```

Revealing the password form hides the magic-link button, the divider, OAuth and passkey; the
"Other options" link returns to the chooser. The common password path costs one extra click —
the accepted trade-off for a page that leads with a clear, uncluttered choice rather than two
competing forms.

The email field is common to both layouts and never moves, so switching between them re-renders
only the method area — the address the user has already typed is preserved for either method.

### Why a reveal, not a second page or an accordion of every method

- **Password gets the reveal, the alternatives do not.** Password is the only method whose
  affordance is a _form_ (a secret field + submit); every alternative is a single button that
  acts immediately. So the disclosure is asymmetric by nature: one button that expands into the
  password form, versus buttons that just fire. Hiding the alternatives behind their own
  sub-reveal would add clicks for no gain.
- **Password keeps a soft primacy.** "Use password" is the solid-primary button at the top of
  the method list, mirroring the parent's password-primary stance without forcing the form open
  on every visit.

## Config-driven trigger

The chooser exists only when password **and** at least one alternative are enabled. Two
build-time predicates over `_build.authConfig` drive everything; no new mode flag:

- `hasAlternatives` = `magicLink.enabled OR passkey.enabled OR providers.length > 0`
  (on signup, which never offers passkey: `magicLink.enabled OR providers.length > 0`)
- `passwordOnly` = `emailAndPassword.enabled AND NOT hasAlternatives`

| Config                                | Render                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- |
| **Mixed** — password + ≥1 alternative | method chooser + reveal (this design)                                     |
| **Password-only**                     | password form shown directly; reveal seeded open, no chooser/back buttons |
| **Passwordless** — password off       | magic-link primary, unchanged; reveal never set                           |
| **OAuth/passkey-only** — no password  | unchanged                                                                 |

The reveal is a plain page-state boolean (`login_show_password` / `signup_show_password`),
seeded in `onInit` to `true` for the password-only case (so the form shows immediately with no
chooser) and `false` otherwise. It is internal page state, **not** a module var — nothing about
the module's public interface changes, so the manifest and generated `vars.md` are untouched.

## Composition mechanics

Both pages already switch renders on an outer view state (`login_view` /`signup_view`); the
reveal is a sub-state _within_ the signin/form view. Concretely, per page:

- **Password blocks** (label row, password input, submit) gate on `view == signin/form AND
show_password`.
- **Two new buttons**, built only when `emailAndPassword.enabled AND hasAlternatives`: a
  solid-primary "Use password" (chooser only, sets the reveal true) and a link "Other options"
  (revealed only, sets it false).
- **Magic-link, OAuth, passkey** each gain `AND NOT show_password` so they collapse when the
  password form is open. This clause is harmless in the passwordless/password-only cases (the
  reveal is never toggled there).
- **One consolidated "or" divider** replaces the parent's two divider blocks (the magic-link-
  owned `login_alt_divider` and the OAuth-owned `login_oauth_divider`). It renders only when
  there is an email-credential group above _and_ an OAuth/passkey group below, which also
  removes a latent double-divider in the password + OAuth (no magic-link) config.

The `noaccess` wall (including the [F2](../../auth-testing/findings/_completed/F2-login-resend-verification.md)
"Resend verification email" affordance), the `link-sent` "check your email" result, and the
`nav` footer are outside the chooser and are untouched.

## Signup parity

Signup is only built when `emailAndPassword.enabled` (parent Decision 4) and never offers
passkey, so its `hasAlternatives` is `magicLink OR OAuth`. The one structural change beyond
mirroring login: signup's `email` input, currently owned by the password branch, is **hoisted**
into the always-present zone (as login already does) so the chooser's magic-link send has an
email field to read. Registration `Validate` still covers the hoisted email.

## Files changed

- `modules/user-account/pages/login.yaml` — reveal state + seed; gate the password blocks; add
  the "Use password" / "Other options" buttons; add `AND NOT login_show_password` to
  magic-link/OAuth/passkey; consolidate the two dividers into one `login_method_divider`.
- `modules/user-account/pages/signup.yaml` — hoist `email`; the same reveal/chooser treatment
  over `signup_view: form`; regate the divider on `providers.length > 0`.
- `modules/user-account/components/magic-link-send.yaml` — unchanged (placement-agnostic; reads
  the hoisted `email`, applies the caller's `on_sent` and `visible`).
- `docs/user-account/` — the login composition docs describe the chooser + reveal and the
  config trigger table.
- Demo consumer — the demo app is already a mixed deployment, so `ldf:b` build-verifies the
  chooser branch; no new demo page required.

## Out of scope

- **[F41](../../auth-testing/findings/_completed/F41-magic-link-empty-email-no-validation-github-redirect.md)**
  — the magic-link send has no email validation (empty send → GitHub 404). Method-first makes
  the magic-link button more prominent but does not fix F41; a `Validate` scoped to `email`
  before the send belongs there. Recommended to fold in, but tracked separately.
- **[F32](../auth-page-polish/F32-auth-page-visual-polish.md)** — auth-page shell polish
  (Enter-to-submit, card width, logo).
- Moving focus into the password field on reveal — a nice-to-have; a Lowdefy `Button` onClick
  cannot cleanly focus another input, so it is not attempted here.

## Related

- [magic-link sign-in](../user-account-better-auth/_completed/magic-link/design.md) —
  the parent; Decision 1 is revised here for the mixed case only.
- [user-account-better-auth](../user-account-better-auth/design.md) — the grandparent
  redesign (Decision 2, method-driven login off `_build.authConfig`).
