# Task 5: Document the passwordless shape and magic-link behaviour

## Context

Consumer-facing docs for the module live under `docs/user-account/` (CLAUDE.md:
`docs/` is the source of truth for consumer-observable authoring behaviour). The
relevant existing pages:

- `docs/user-account/concepts/auth-methods.md` — the auth-methods concept
  (method enablement from `_build.authConfig`, the one error-code → message table,
  the `?error=` redirect handling). This is where magic-link belongs.
- `docs/user-account/index.md` — module landing page.
- `docs/user-account/how-to/migration.md` — the v0.x → BetterAuth migration guide;
  already notes magic-link emails ride `auth.email`, and that the old module was
  passwordless-email. This is the natural place to note that **magic-link is the
  migration path** for a formerly-passwordless deployment.
- `docs/user-account/reference/vars.md` — **generated**; do not hand-edit.

The magic-link design adds consumer-observable behaviour that must be documented
(Files changed: "Docs — the module's login/how-to page notes the passwordless
shape and the `magicLink.enabled` behaviour").

## Task

Document, in the appropriate `docs/user-account/` pages:

1. **Magic-link as a config-driven method** (Decisions 1, 2). When
   `auth.magicLink.enabled` is true, the login page shows an email → "send me a
   link" affordance; on send it flips to a "check your email" (`link-sent`) state
   with resend (short cooldown). Magic-link never navigates inline (the send
   returns no session). Add this to `concepts/auth-methods.md` alongside the
   existing method descriptions.
2. **The passwordless-primary shape** (Decision 1). When `emailAndPassword.enabled`
   is false and `magicLink.enabled` is true, the login page renders **email-only**
   (no password field, no "Forgot?"), and **sign-up collapses into sign-in** — one
   email → link action; an unknown-but-admittable email is created at verify time
   and routed to onboarding. Note this is the **migration path** for a
   formerly-passwordless deployment (cross-link from `how-to/migration.md`).
3. **Verify-callback routing** (Decision 3): a magic-link user lands on
   **onboarding** as a first-time user; expired/consumed links return to the login
   page as `INVALID_TOKEN` → "this link has expired or was already used — request a
   new one." Add `INVALID_TOKEN` to the documented error-code set on
   `auth-methods.md` (which already lists `MEMBERSHIP_REQUIRED`,
   `EMAIL_NOT_VERIFIED`, `INVALID_EMAIL_OR_PASSWORD`, `default`).
4. **Security surface degradation** (Decision 6): a passwordless user has no
   credential, so the password and 2FA controls hide (already governed by the
   per-user credential read); passkeys, linked accounts, and sessions remain.
   If `concepts/auth-methods.md` or the security/write-pathways docs describe the
   credential gate, add a sentence noting the passwordless user is exactly the
   "no credential" case. Keep it brief — do not duplicate the whole security tile
   doc.
5. **Front-matter**: keep each edited page's YAML front-matter valid
   (`title`, `module: user-account`, `type`, optional `concepts`) per
   `docs/CONTRIBUTING.md`. Add `magic-link` / `passwordless` to `concepts:` where
   apt.
6. **Regenerate** `docs/llms.txt`: run `pnpm docs:gen` and commit the result.

## Acceptance Criteria

- `docs/user-account/concepts/auth-methods.md` documents the magic-link method, the
  `link-sent` state, the passwordless-primary email-only shape, and `INVALID_TOKEN`
  in the error-code set.
- `docs/user-account/how-to/migration.md` notes magic-link as the passwordless
  migration path (cross-linked).
- Front-matter valid on all edited pages.
- `pnpm docs:gen` run; `docs/llms.txt` regenerated and committed.
- `pnpm docs:check` passes (no front-matter or generated-file drift).

## Files

- `docs/user-account/concepts/auth-methods.md` — modify — magic-link method,
  `link-sent` state, passwordless shape, `INVALID_TOKEN`, credential-gate note.
- `docs/user-account/how-to/migration.md` — modify — magic-link as the
  passwordless migration path.
- `docs/user-account/index.md` — modify (if it enumerates methods/pages) — mention
  magic-link.
- `docs/llms.txt` — regenerate via `pnpm docs:gen` (do not hand-edit).

## Notes

- Depends on tasks 2 and 3 (document the behaviour as actually implemented).
- **Do not hand-edit `docs/user-account/reference/vars.md`** — it is generated from
  the manifest. Magic-link adds **no new module var** (enablement reads from
  `_build.authConfig`, per Decision 2 / the parent's "no mirror vars"), so `vars.md`
  should not change. If you find yourself wanting a `magicLink`/`passwordless` var,
  stop — that contradicts the design.
- `docs/` wins over the design on **behaviour** wording (CLAUDE.md) — describe what
  the implemented pages actually do, not a stale plan.
