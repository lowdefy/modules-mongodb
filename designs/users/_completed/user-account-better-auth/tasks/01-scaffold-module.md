# 01 — Scaffold the module skeleton, manifest, and demo consumer

**Context**: Breaking rebuild of `modules/user-account` against the BetterAuth
engine (design.md — Proposed change, Module surface). The old NextAuth module
(passwordless login + profile CRUD over the fused collection) is retired in place.
This task creates the buildable skeleton every downstream UI/wire task renders
into: the manifest, connections, vars, exports, page stubs, and the demo consumer
wiring. No page content yet — stubs only, so `_ref`s resolve and `pnpm ldf:b`
passes with an empty-but-valid module.

**Task**:

1. **Rewrite `modules/user-account/module.lowdefy.yaml`** to the design's Module
   surface table:
   - **Pages** (stub files, each a minimal valid page): public `login`, `signup`,
     `forgot-password`, `reset-password`, `verify-email`, `two-factor`, `accept`,
     `logout`; protected `view`, `onboarding`.
   - **Vars**: keep `login_message` (+ add `signup_message`, `verify_email_message`
     equivalents — Decision 8), `event_display`, `avatar_colors`, `fields.profile`
     - `fields.show_honorific`, `components.main_slots`, `request_stages.write`.
       **Add** `providers` (array of `{ id, label, icon, order? }` — OAuth display
       metadata layered over `_build.authConfig.providers`, Decision 2/8). **Remove**
       `app_name` (retired, Decision 8) and do **not** add `methods` / `two_factor` /
       `passkeys` mirror vars — enablement reads from `_build.authConfig`.
   - **Connections**: `user-contacts-collection` (app connection, read-write) plus
     read-only connections for the natively-read auth collections: `users`,
     `user-sessions`, `user-accounts`, `user-passkeys`, `user-invitations`
     (mongodb design owns the collection names).
   - **Dependencies**: `layout`, `events` only (notifications is NOT a dependency —
     Decision 8).
   - **APIs**: declare `update-profile` and `link-contact-on-signup` (stubs; filled
     by tasks 07/08).
   - **Components**: `profile-avatar`, `user-selector`, `user-multi-selector`,
     `user-avatar` (stubs; filled by 04). The two shared write fragments
     `create-or-link-contact` and `write-profile` are **not** manifest components —
     they live var-free in `modules/shared/contact/` and are `_ref`'d by relative
     path (Decisions 7/8), authored/reused in tasks 05/06. Do **not** add
     `components` export stubs for them.
   - **Menus**: `default` (Account), `profile-default` (Profile + Divider + Logout).
   - **authPages role declarations + public-page declarations** in the manifest
     (upstream ask 2, delivered): declare which page serves `signIn`, `signUp`,
     `forgotPassword`, `resetPassword`, `verifyEmail`, `error`, and
     `acceptInvitation` (ask 2 + auth-emails' 7th role), and which pages are public.
   - **Hook-binding declarations** for `link-contact-on-signup` at `email.verified`
     and `user.create.before` (upstream ask 4, delivered) — endpoint stub in 08.
   - **Plugins**: keep the mongodb community plugin + `@lowdefy/modules-mongodb-plugins`
     (the QR block from task 02 ships here); bump versions as needed.
   - Bump `version` (breaking — major).
2. **Delete retired files**: `pages/verify-email-request.yaml`, `pages/edit.yaml`,
   `pages/new.yaml`, `api/create-profile.yaml`, and any `app_name` references.
   Also audit and remove components orphaned by the page deletions —
   `components/form_profile.yaml` (only consumed by `new`/`edit`) and
   `components/view_profile.yaml` (only consumed by the rewritten `view`) — plus a
   quick pass over `requests/`, `validate/`, and `enums/` for the same orphaning.
3. **Wire the demo consumer** (`apps/demo`, per CLAUDE.md's mandatory rule):
   - `apps/demo/modules/user-account/vars.yaml` — drop `app_name`, add a `providers`
     example (e.g. google), keep `fields.profile`, `request_stages.write`.
   - `apps/demo/lowdefy.yaml` — update `auth.authPages.*` to the new page ids (or
     rely on manifest contribution if the build now provides it; app config wins on
     collision). The demo `auth:` config **must enable the full method matrix** —
     `emailAndPassword` + `magicLink` + `twoFactor` + `passkey` + at least one
     `providers` entry (matched by a `providers` display-metadata var, e.g. google) —
     so every `_build.authConfig`-gated branch in the login page (task 09) and the
     account workspace (task 18) resolves true and builds into a demo artifact.
     Un-enabled gates compile to nothing and cannot be walked by the verify gate
     (task 20), leaving that capability without the build-verified demo consumer
     CLAUDE.md mandates. No real OAuth secrets are needed — `ldf:b` reads only the
     config projection. (Keep `passkey` enabled even though the login passkey button
     drops pending ask 6 — task 18's passkeys tile still renders and builds.) Confirm
     the demo `auth:` config exposes `_build.authConfig` the pages read.
4. Confirm `pnpm ldf:b` (from `apps/demo`) passes with the stub pages.

**Acceptance Criteria**:

- `module.lowdefy.yaml` matches the design's Module surface table; `app_name` and
  the mirror vars are gone; `providers` var is present.
- All 10 page stubs, 6 connections, 4 components, 2 APIs, 2 menus declared and
  `_ref`-resolvable (the two shared write fragments are not manifest components).
- Retired files deleted; no dangling `_ref`s.
- Demo consumer wired; `pnpm ldf:b` is green.
- Demo `auth:` enables the full method matrix (`emailAndPassword` + `magicLink` +
  `twoFactor` + `passkey` + ≥1 `providers`) so every `_build.authConfig`-gated
  login/workspace branch builds into a demo artifact.

**Files**:

- `modules/user-account/module.lowdefy.yaml`
- `modules/user-account/pages/{login,signup,forgot-password,reset-password,verify-email,two-factor,accept,logout,view,onboarding}.yaml` (stubs)
- `modules/user-account/connections/*.yaml`
- `modules/user-account/menu.yaml`, `menus/profile-default.yaml`
- `apps/demo/modules/user-account/vars.yaml`, `apps/demo/lowdefy.yaml`, `apps/demo/modules.yaml`
- Delete: `pages/verify-email-request.yaml`, `pages/edit.yaml`, `pages/new.yaml`, `api/create-profile.yaml`, `components/form_profile.yaml`, `components/view_profile.yaml`

**Notes**:

- Everything downstream depends on this; do it first.
- Manifest is the source of truth for var schema — every var needs
  `description`/`type`/`default` (CLAUDE.md). `docs:gen` runs in task 19.
- Use the `/lowdefy-modules` skill for manifest/export conventions.
