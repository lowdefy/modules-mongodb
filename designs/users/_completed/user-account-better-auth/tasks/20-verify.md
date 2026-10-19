# 20 — Verify (build + render)

**Context**: The single green-build gate for the whole rebuild (design-tasks-ui: the
gate belongs at the end — a UI page with mock data and `TODO` comments builds fine;
those markers are YAML comments, and by now the wire tasks have resolved them all).

**Task**:

1. **Build check**: `pnpm ldf:b` from `apps/demo` (or
   `pnpm --filter @lowdefy/modules-demo ldf:b`). Fix any config errors. Confirm no
   `TODO(request-substitute)` markers remain anywhere in the module.
2. **Artifact inspection**: confirm the generated
   `.lowdefy/server/build/pages/**` artifacts for all 10 pages resolve
   (`_ref`s, connections, actions, `_build.authConfig`, `_module.*` operators).
3. **Render / e2e** against the dev server the developer runs (needs real secrets +
   MongoDB — a human or `/r:dev-test` step, not an autonomous gate): walk each screen
   and its states — login (methods + both error paths + 2FA route), signup (+
   check-email), forgot/reset password, verify-email (all renders), two-factor,
   accept (all states), logout, onboarding (marker set), account (all tiles, gates,
   modals, actions). Optionally generate Playwright specs via `/r:dev-playwright-gen`.

**Acceptance Criteria**:

- `pnpm ldf:b` green; no `TODO(request-substitute)` markers remain.
- All 10 pages present valid build artifacts.
- Each screen + state renders and its primary action works against a live server.

**Files**:

- No new source (fixes only as build errors surface).

**Notes**:

- Depends on all prior tasks. Build check is autonomous; render/e2e needs secrets +
  MongoDB (`/r:dev-test`). Never run the dev server in the foreground (CLAUDE.md).
