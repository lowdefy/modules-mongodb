# Task 19: Verify — build gate, then render / e2e

## Context

Final task. The green-build gate belongs here, not after each UI phase (a UI page
with mock data and `TODO(request-substitute)` YAML-comment markers builds fine).
By now the markers are all resolved (tasks 9, 13, 17), so the build must be clean
and the screens must render and behave against a live dev server.

Per CLAUDE.md: `pnpm ldf:b` is the build check (no secrets/network beyond npm);
running the app needs real secrets (`MONGODB_URI`, etc.) and a reachable MongoDB
co-located per Decision 1 — that is a human / `/r:dev-test` step, not an
autonomous gate.

## Task

**Build gate** — run `pnpm ldf:b` from `apps/demo`. Fix any config errors until
it is clean. Inspect the generated `.lowdefy/server/build/pages/**` artifacts for
`all`, `view`, `invite` to confirm they resolve end-to-end (no unresolved `_ref`,
no leftover `TODO(request-substitute)` in effective config — the markers should
all be resolved by the wire tasks).

**Render / e2e** — against a dev server the developer runs (co-located MongoDB
with seeded members, invitations, sessions, cross-app memberships), verify the
acceptance criteria of the screens:

- `all`: Members + Invitations tabs load; role filter matches exact split-array
  elements; sort re-runs server-side; pending-count badge; export merges both
  (when `download` on) / absent (when off).
- `view`: tiles hydrate from native reads; sessions read hides `token`;
  count-0 degradation (Apps hidden, plain Suspend, Delete enabled, copy collapsed)
  vs multi-app; tile edits and Security actions call the routines and refetch;
  impersonation gated on the var.
- `invite`: Check resolves to all four states; prefill/blank forms; submit invites
  and the email is sent via `auth.email`; cancel/resend work.

Consider generating Playwright specs via `.claude/skills/r:dev-playwright-gen`.

## Acceptance Criteria

- `pnpm ldf:b` is clean; generated artifacts for `all`/`view`/`invite` resolve
  with no leftover request-substitute markers.
- The three screens render and pass their behavioural acceptance criteria against
  a co-located, seeded dev database (developer-run).
- Blank contact data anywhere is investigated as a co-location-precondition
  violation (Decision 1), not a wiring bug.

## Files

- No new module source expected — fixes only, where the build or render surfaces
  defects.
- `apps/demo/**` — seed/config adjustments if needed for the render pass.
- e2e specs (optional) under the app's test location.

## Notes

- If the demo's BetterAuth engine build lacks a capability the module assumes
  (admin steps, `_organization` operator, `_build.authConfig.roles`, role
  catalog), surface it clearly — the design treats upstream asks 1–7 as resolved,
  but the running experimental `@lowdefy/server` build must actually ship them.
- This is the only task that requires a live server; earlier tasks gate on
  `pnpm ldf:b` alone.
