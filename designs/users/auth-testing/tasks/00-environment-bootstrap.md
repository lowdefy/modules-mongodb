# Phase 0 — Environment & bootstrap

> **Depends on:** — (stands the rig up). · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

Two environments back this campaign ([README §8](../../../../scripts/auth-testing/README.md#8-atlas--sendgrid--tester-facing-passes)
has the split), and they drive **different apps**: the **local rig** — `apps/demo`
under `policy: pinned`, docker Mongo + Mailpit, `demo-auth-test` — for dev
iteration, and **QA** — `apps/tenant-demo` under `policy: tenant`, Atlas
`modules-mongodb-demo-tenant-test` + SendGrid — for tester-facing passes. Run 0a
or 0b, not both. The ticks below were recorded on the local rig.

Later phases read against either app; where a step names the pinned org or a
per-org admin instance, it is 0a-only (under `tenant` those writes refuse by
design — see [`qa-test-plan.md`](../../../auth-tenancy-verification/qa-test-plan.md) §6.1).

## Phase 0a — Local rig (`apps/demo`, `pinned`)

- [x] Mongo + Mailpit up (dev's own setup, not the compose stack); mongo reachable at `mongodb://localhost:27017`
- [x] Compass connected; `demo-auth-test` DB visible (only this DB on local mongo — old cluster untouched)
- [x] `apps/demo/.env` present with `LOWDEFY_SECRET_*` values (README §3a)
- [x] Email → Mailpit via `.env` `SMTP_*` — config is env-driven (host `localhost`, port `1025`, secure `false`); live send verified in Phase 1
- [x] Partial-unique index present on `user-contacts.{organization_id, lowercase_email}` (`unique` + `$exists` partial) — earlier runs used the pre-snake-case `organizationId` spelling; a fresh DB on the current platform version needs the snake_case shape below
- [x] Build green — the `lowdefy-docs` dev server reports `build.status: ok`
- [x] `pnpm ldf:d` dev server up (it backs the MCP); pinned `demo` org row exists in `user-organizations` (keyed by its slug — see Phase 5)
- [x] Script deps OK — `mongodb` resolves via the root dep (the local `pnpm install` is a no-op; see FINDINGS)
- [x] **First admin bootstrapped:** sign up + verify email (Phase 1), then `pnpm bootstrap-admin <email>`; log in and reach the user-admin console — bootstrap confirmed: `admin@demo.test`'s `user-members.role` is now `user-admin` (reaching the console verified in Phase 3)

Index creation (run once per fresh DB — survives `reset-db`, lost on `down -v`):

```sh
docker exec demo-auth-mongo mongosh mongodb://localhost:27017/demo-auth-test --quiet --eval '
  db["user-contacts"].createIndex({ organization_id: 1, lowercase_email: 1 }, { unique: true, partialFilterExpression: { lowercase_email: { $exists: true } } });
  print("indexes created");
'
```

## Phase 0b — QA environment (`apps/tenant-demo`, `tenant`; Atlas + SendGrid)

- [ ] `apps/tenant-demo/.env` points at Atlas `modules-mongodb-demo-tenant-test` + SendGrid (README §8a)
- [ ] `AUTH_FROM_ADDRESS` is a sender SendGrid will send as — otherwise every auth email fails silently
- [ ] **Live send confirmed:** one signup delivers a verification email to a real inbox, and the link works
- [x] Both `user-contacts` partial-unique indexes present (README §8c) — confirmed on the Atlas DB; the 0a `createIndex` command is not used here
- [x] **Clean slate:** QA DB cleared before the pass (README §8f) — leftover orgs/invitations/sessions make the data-separation checks unreadable — cleared 2026-07-31: 85 documents across 14 collections, both `user-contacts` indexes retained
- [ ] Served from a production build of `apps/tenant-demo` (`pnpm ldf:b && pnpm ldf:s`, port 3003), not `ldf:d` — removes the "building page" artifact a tester reads as an app bug
- [ ] Roles granted from `/organizations/members` (`bootstrap-admin` is unused under `tenant`; `mail-link` is Mailpit-only)
