# Task 11: Exercise the publish life cycle end to end, then run the suite

## Context

Every task before this one wrote its own specs and stopped at `pnpm ldf:b`, because running a Playwright spec needs a live server and a reachable MongoDB — which is a human or `/r:dev-test` step, not an autonomous build gate. **This is the task that actually runs it.**

It also adds the one spec no earlier task owns, because it crosses every endpoint: **the publish life cycle end to end** — private → shared → visible to a second user → unpublished → gone from that user's list. Each earlier spec asserts one endpoint's authorization; this one asserts they compose, which is the property a consumer actually depends on.

This sub-design ships no page, so a build check verifies almost nothing about it: `pnpm ldf:b` confirms the YAML compiles and cannot execute a single authorization predicate. Since **the authorization behaviour is the deliverable, the tests are the deliverable too.**

Why Playwright rather than jest: it is the only harness in this repo that reaches an API routine at all. `pnpm test` is jest over the plugins package's JS, and the `mongodb-memory-server` suites all sit under `plugins/modules-mongodb-plugins/src/connections/` — nothing there can invoke a `type: Api` routine. **One exception sits on the jest side and it is the cheapest test in the batch:** task 1's spec round trip, which is a pure-function property asserted in `validateReportSpec.test.js`.

The harness already does everything needed. `apps/demo/e2e/fixtures.js` merges the `ldf` and `mdb` fixtures: `mdb` seeds documents directly and `ldf.user(userObj)` sets or clears the session cookie mid-test, so **one spec can seed as one user and act as another** — which is what makes the non-owner half testable at all. Every non-system collection is cleared after each test, so specs do not have to clean up after themselves. The demo e2e suite is pinned to one worker (`f0c623f3`), so seeded collections cannot collide across specs.

## Interfaces

- **Consumes:** every endpoint from tasks 3–8, the fixtures from task 9, and `callEndpoint` / `reportDoc` / `SPEC` from `apps/demo/e2e/reporting/helpers.js` (task 3).

## Task

### 1. `apps/demo/e2e/reporting/report-publish-lifecycle.spec.js`

One spec, five acts, two users — A the author holding a `share_roles` role, B another user:

1. **Private.** A's report is absent from B's `shared` scope and from B's `all` scope, and B's attempt to open it renders the fallback.
2. **Shared.** A publishes through `set-report-visibility`. The report now appears in B's `shared` and `all` scopes, and stays in A's `mine` scope — publishing does not remove a report from Mine.
3. **Visible to B.** B resolves it, and the response carries `is_owner: false`. B can favourite it and duplicate it; B cannot rename it, delete it, restore it, or remove a section from it.
4. **Unpublished.** A unpublishes. The report leaves B's `shared` and `all` scopes and B's open renders the fallback again — while **B's favourite marker survives in the document** and B's `favourites` scope no longer lists it, because that scope carries the readable predicate as well as the marker.
5. **B's duplicate is unaffected** by any of it — still private, still owned by B, still resolving. That is what "duplicate is the escape hatch" means when the original is withdrawn.

Then the last act as a separate assertion: **A deletes the still-shared report** (re-publish first) and it drops out of everyone's Shared scope with no separate unpublish step, because every read filters the stamp. That is the "one soft delete buys a consequence for free" claim, and it is worth one test.

### 2. Run the whole batch

```bash
pnpm --filter @lowdefy/modules-mongodb-plugins test     # sandbox OFF — see Notes
```

Then the e2e suite. It needs a running server and a reachable MongoDB; `pnpm e2e` from `apps/demo` never exits on its own, so run it as a foreground command only when a human is watching, or start the server in the background and poll `/api/auth/session` before driving Playwright. Do **not** start a dev server in the foreground as part of an autonomous run.

```bash
pnpm --filter @lowdefy/modules-demo e2e     # requires MONGODB_URI and a live server
```

### 3. Build check

```bash
pnpm --filter @lowdefy/modules-demo ldf:b
```

Then inspect the generated artefacts rather than trusting the exit code: confirm every new endpoint appears under `apps/demo/.lowdefy/server/build/api/reporting/` — `set-report-visibility.json`, `set-report-favourite.json`, `set-report-title.json`, `remove-report-section.json`, `duplicate-report.json`, `restore-report.json` — and that `list-reports.json` carries the aggregation, not the old find. An endpoint file that was never registered in the manifest compiles fine and simply is not there, which is the failure mode a green build hides.

### 4. Report honestly

Say which specs ran, which passed, and which are `test.fixme` and why. The report-page positive assertions are expected to be fixme'd on the known `urlQuery` harness gap (`@lowdefy/server-e2e` omits it where `@lowdefy/server` threads it, documented in `formatted-report.spec.js`) — that is a false negative in the harness, not a module defect, and it must be reported as a gap rather than as a pass.

## Acceptance Criteria

- `report-publish-lifecycle.spec.js` exists and covers all five acts plus the delete-drops-from-Shared case.
- The jest suite passes, including task 1's round-trip assertions.
- The e2e suite has been **run**, and the outcome reported spec by spec: passes, failures, and fixmes with their reasons.
- `pnpm ldf:b` succeeds and all six new endpoint artefacts are present under `build/api/reporting/`.
- Any spec that fails is either fixed or reported as a failure with its output. A failing spec is not "flaky" until it has been run twice and shown to be.

## Files

- `apps/demo/e2e/reporting/report-publish-lifecycle.spec.js` — create

## Notes

- **Run jest with the sandbox off.** Sandboxed, `CI=true pnpm test` fails ~19 unrelated `mongodb-memory-server` suites under `src/connections/` spuriously — that is the sandbox, not broken code. The analytics suites this task cares about are pure JS and pass either way, but a full-suite run needs the sandbox off to be readable.
- **The Infisical script variants do not work in the sandbox.** `ldf:b:i` / `ldf:d:i` / `ldf:i` fetch secrets from `app.infisical.com`, which the sandbox blocks. Plain `ldf:b` needs no secrets — the script supplies a build-only `NEXTAUTH_SECRET` placeholder.
- **Do not add specs for behaviour no endpoint implements.** If the life cycle spec wants something that does not exist — a `can_unpublish` flag, a publish-audit record — that is a design gap to raise, not a thing to build here.
- **A build check is not a smoke test.** The two are reported separately: `ldf:b` proves the config compiles; only the e2e run proves an authorization predicate.
