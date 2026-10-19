# Task 5: Shared role-gate oracle fixtures

## Context

The `(gate, user-roles) → bool` semantic is evaluated in **three runtimes that can't share code**: query-time (`visible_verbs_filter.yaml` aggregation, task 7), submit-time (load-phase JS, task 9), and client (`action_role_check`, task 8). Without a shared oracle, a future change (e.g. a `*` wildcard or a deny-list) would need three lockstep edits and could silently drift.

This task creates the single fixture table that all three implementations are tested against, so divergence fails CI. It is the foundation for the Part 34 access-model cluster (tasks 6–8).

## Task

Create a shared fixture file — `gates.fixtures.js` — enumerating the `(gate, user-roles) → expected bool` cases. The gate shape is `true | [roles]` (Part 34). Cases to enumerate:

- `true` gate → always pass (regardless of user roles, including empty roles).
- array gate intersecting user roles → pass.
- array gate with empty intersection → fail.
- undeclared / missing verb (gate absent) → fail.
- empty user-roles vs non-`true` gate → fail.

Place the file where all three runtimes' tests can import it. A natural home is alongside the access-model resolver/helper code (e.g. `modules/workflows/resolvers/__fixtures__/gates.fixtures.js` or a shared test-fixtures location) — pick the location that all three test suites (resolver JS, aggregation via `mongodb-memory-server`, client component) can reach.

The fixture file exports the case table only (data, not assertions). Each consuming task asserts its implementation against the same table:

- aggregation case (task 7): run fixtures through a `mongodb-memory-server` `$match`.
- JS case (task 9 load gate): assert the helper directly.
- client case (task 8): assert the helper directly.

## Acceptance Criteria

- `gates.fixtures.js` exports a case table covering all five categories above, each with `{ gate, userRoles, expected }`.
- The file is importable from the resolver tests, an aggregation test harness, and the client component tests.
- No assertions in the fixture file itself — it is pure data consumed by three independent test suites.

## Files

- `gates.fixtures.js` — create (location reachable by all three test suites; see Task)

## Notes

- This is the mechanism standing in for the code-sharing the three runtimes preclude (CLAUDE.md "One correct way"). Tasks 7, 8, and 9 each add a test that runs this fixture set through their respective implementation.
- Keep the fixture categories aligned with Part 34 D12's resolution semantics — if the design's gate shape gains a wildcard/deny-list later, the fixture table is the one place that change is expressed.
