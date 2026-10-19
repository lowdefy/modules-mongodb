# 19 — Docs + v0.9→this migration guide

**Context**: Consumer-facing docs live in `docs/` (CLAUDE.md). This is a breaking
rebuild, so the module's docs need a full rewrite plus a migration guide (design.md —
Module surface: "A consumer migration guide (v0.9 → this surface) is an
implementation task once the design is finalised").

**Task**:

1. Rewrite `docs/user-account/` to the new surface: `index.md` (module landing —
   both page families, the auth-pages role, the account workspace), plus `concepts/`
   / `how-to/` pages only where genuinely needed (e.g. method enablement via
   `_build.authConfig`, the `providers` var, the shared `write-profile` /
   `create-or-link-contact` fragments, the workspace tiles + write pathways).
2. Regenerate `docs/user-account/reference/vars.md` from the manifest — run
   `pnpm docs:gen` (do NOT hand-edit generated files).
3. Document the QR block under `docs/plugins/`.
4. Update `docs/shared/*` where the module's idioms changed (`change-stamps`,
   `event-display`, `avatar-colors`, `app-name` retirement).
5. Write the **v0.9 → this-surface migration guide**: retired pages (`edit`, `new`,
   `verify-email-request`), retired `create-profile` API, retired `app_name` var and
   mirror vars, NextAuth `?error=` handling change, the adapter invite-gating →
   hard-wall shift, the new `providers` var, and the `authPages`/`pages.public`
   manifest wiring.
6. Run `pnpm docs:check` — front-matter valid, no drift.

**Acceptance Criteria**:

- `docs/user-account/**` rewritten to the new surface with valid front-matter.
- `vars.md` + `llms.txt` regenerated (`pnpm docs:gen`); `pnpm docs:check` green.
- Migration guide covers every retired/renamed/added surface item.

**Files**:

- `docs/user-account/**`, `docs/plugins/*`, `docs/shared/*`, `docs/llms.txt`
- Migration guide (e.g. `docs/user-account/how-to/migrate-from-v0.9.md`)

**Notes**:

- Depends on the UI + API tasks being settled (surface finalised).
- Use `/r:design-docs` to plan the docs delta; manifest is the var-schema source.
