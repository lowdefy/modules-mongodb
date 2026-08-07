# Task 8: Update demo consumers and build-verify the sweep

## Context

This is the only task that exercises the whole change end-to-end. The `apps/demo` app is the
sole consumer of `user-admin`/`user-account`, and it moves in the same change (no external
consumer to migrate). This task audits the demo consumers for any binding of a renamed row-
contract key or the `_user` field, updates what it finds, then confirms the config compiles
and the docs are in sync.

The demo DB is dev and resettable — **no data step is implied** by this design. Do not run a
data migration or reset.

## Task

- **Audit the demo** for bindings of renamed contract keys or the `_user` field — table
  column `field:`/`idField:`, page config, `_event: row.*`, nunjucks reads. Known consumer
  entry points: `apps/demo/modules.yaml`, `apps/demo/lowdefy.yaml`,
  `apps/demo/modules/user-admin/vars.yaml`, and any demo page that renders `user-admin` /
  `user-account` output. Grep the demo for `userId`/`organizationId`/`providerId`/`accountId`/
  `emailVerified`/`appRoles`/`twoFactorEnrolled`/`expiresAt`; flip only reads of the renamed
  **data-plane** keys — leave action params and `?userId=`-style labels that the demo doesn't
  route through these modules. (A first pass found no demo YAML binding these keys directly;
  confirm, and update any that surface.)
- **Build-verify:** from `apps/demo`, run `pnpm ldf:b`. It needs no secrets/Infisical/network
  beyond npm. A clean build confirms all renamed refs resolve.
- **Inspect artifacts:** check the generated `.lowdefy/server/build/pages/**` for the affected
  pages (`user-admin/all`, `user-admin/view`, `user-admin/invite`, `user-account/view`,
  `user-account/two-factor-enrol`) — confirm the snake keys appear in the compiled request
  projections and client bindings, no stale camelCase survivor.
- **Docs gate:** run `pnpm docs:check` (belt-and-braces with Task 7) — must pass.

## Acceptance Criteria

- Any demo binding of a renamed data-plane key or `_user` field is updated; the audit result
  (including "no demo binding found") is stated.
- `pnpm ldf:b` compiles cleanly from `apps/demo`.
- The affected pages' `.lowdefy/server/build/pages/**` artifacts show snake keys with no stale
  camelCase data-plane refs.
- `pnpm docs:check` passes.
- No data mutation was run.

## Files

- `apps/demo/**` — modify only if the audit finds a renamed-key binding
- (no source changes here beyond demo consumers)

## Notes

- `pnpm ldf:b` from `apps/demo` (or `pnpm --filter @lowdefy/modules-demo ldf:b` from root) is
  the build-check command. **Do not** use the `:i` (Infisical) variants — the sandbox blocks
  `app.infisical.com`. Never run `lowdefy dev`/`start`/`e2e` for this check — those are
  long-running servers, not build checks.
- A build check verifies config compiles; it does **not** verify runtime behaviour, which
  depends on the upstream adapter change being present.
