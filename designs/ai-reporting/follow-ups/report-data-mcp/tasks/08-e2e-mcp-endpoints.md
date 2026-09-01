# Task 8: e2e coverage for the three MCP-facing endpoints

## Context

A build check confirms the YAML compiles; it cannot tell you whether
`get-report-data` hands a report to someone who should not see it. Per CLAUDE.md,
`pnpm e2e` is the only gate that catches behaviour depending on a routine actually
executing — which is all three endpoints are. The suite is browser-driven and an
MCP tool has no button, so these endpoints are tested **as the HTTP endpoints
they are**.

**The harness already exists** — the design's verification section describes
building it, but `apps/demo/e2e/ai-reporting/helpers.js` already ships
`callEndpoint(page, endpointId, payload)`, which POSTs to
`/api/endpoints/ai-reporting/{endpointId}` with a `{ payload }` body. Read its
comment before writing assertions: the session cookie `ldf.user()` sets lives on
the browser context and `page.request` shares that cookie jar, so a call runs as
whoever the test last became. And note the two layers in the return — a routine's
`:return:` arrives nested under `body.response`, and a **`:reject:` is HTTP 200**
with `success: false, status: "reject"`, not a 4xx. Assert on `response` for the
happy path and `rejected` for a refusal; asserting a status code would pass or
fail for the wrong reason.

`helpers.js` also ships `USER_A` (owner, holds `report-publisher`), `USER_B`
(everyone else), `reportDoc({...})` in the current document shape, `REPORTS`, and
`SPEC` — which already carries one section of every type, including a `download`
(`s5`) and a `select` filter on `status` (`s3`).

## Interfaces

- **Consumes:** endpoints `get-report` (task 5), `list-reports-tool` (task 6),
  `get-report-data` (task 7); `callEndpoint`, `reportDoc`, `SPEC`, `ORDERS`,
  `USER_A`, `USER_B`, `REPORTS` from `helpers.js`.

## Task

Write `apps/demo/e2e/ai-reporting/mcp-endpoints.spec.js` covering the cases below.
Seed with `mdb.seed(REPORTS, [...])` and become a user with `ldf.user(...)`, as
the sibling specs do.

**Authorization** — the reason this task exists:

1. `USER_B` reading `USER_A`'s **private** report through `get-report` is
   rejected, and through `get-report-data` is rejected. Both must answer
   `Report not found.` — the same answer as a report that does not exist, so a
   caller cannot probe for existence.
2. `USER_B` reading `USER_A`'s **shared** report succeeds through both.
3. A **soft-deleted** report (`deleted` set) reads as not-found through both, for
   its own owner.
4. An unauthenticated call (no `ldf.user()`) is rejected by all three.

**The three decisions from the design's last review round** — each is the kind of
thing that passes review and then silently does not happen:

5. **No pipelines leave the server.** Assert over the _whole serialized response_
   of both `get-report` and `get-report-data` that the strings `"pipeline"`,
   `"collection"` and `"demo_orders"` do not appear. A whole-payload check, not a
   per-key one — that is what makes the subtraction rule testable rather than
   aspirational.
6. **A `download` section comes back with rows.** `SPEC`'s `s5` is a download over
   the same query as `s1`; assert it carries `rows` and `columns` derived from the
   row keys. Then assert the UI path is unchanged: open the report page as the
   owner and confirm it still renders (the download section must not have started
   running a pipeline on open — `report-render.spec.js` is the existing shape to
   follow for a page assertion).
7. **`deleted` is rejected by the sibling but still works on `list-reports`.**
   `list-reports-tool` with `scope: "deleted"` is rejected; `list-reports` with
   the same scope returns the owner's deleted report. Same call, two endpoints,
   opposite outcomes — that pair is the whole point of the sibling.

**Response contract:**

8. `truncated_sections` and `failed_sections` are both present and are arrays,
   even when empty — a caller instructed to check them must not have to handle
   `undefined`.
9. Every section entry carries `section_id`, `type` and `label`.
10. A **role-denied** section produces a `failed_sections` entry and an `error` on
    that section while its siblings still return rows. Seed a report whose section
    reads a catalog collection gated to a role `USER_B` lacks — see
    `report-resolve-shared.spec.js` for the existing role-gated fixture pattern.
11. `applied_filters` echoes what was sent.

**The filter binder** — the case the design calls out as the silent failure:

12. A **date-filtered** section returns the same rows a UI-driven filter would.
    Add `order_date` to the `ORDERS` fixture in `helpers.js` (the field is already
    cataloged — `apps/demo/modules/ai-reporting/catalog.yaml:57-59`, `type: date`,
    "use for date-range filters") and build a local spec in this file with a
    `daterange` filter on it bound to a table section. Send ISO-8601 strings
    (`"2026-07-01"`), and assert the returned rows are the subset inside the
    range — **not** an empty result. An empty result here is exactly the failure
    the coercion exists to prevent, and a test that accepts it proves nothing.
13. An **unknown filter key** is rejected, with the offending key named. Silently
    ignoring it would let an agent report a whole-dataset number as a filtered
    one.
14. The **cross-endpoint walk**: `list-reports-tool` → take an `id` from the
    result → `get-report` → take a filter field from the result →
    `get-report-data` with a value for it. This is the sequence a connected agent
    actually performs, and nothing else in the suite asserts the three responses
    fit together.

## Acceptance Criteria

- `pnpm e2e` passes, including the pre-existing specs (`order_date` on `ORDERS`
  is additive — confirm `report-render.spec.js`, `formatted-report.spec.js` and
  `report-remove-section.spec.js` still pass).
- Every case above is a named `test(...)`, not a bundled assertion block — a
  failure must name which contract broke.
- Run it as `pnpm e2e` from `apps/demo`, backgrounded, reading the log. It builds
  the app, starts its own server on port 3101 with a `MongoMemoryServer`, and
  exits with a real code. Do **not** start a dev server for this.

## Files

- `apps/demo/e2e/ai-reporting/mcp-endpoints.spec.js` — create
- `apps/demo/e2e/ai-reporting/helpers.js` — modify — add `order_date` to `ORDERS`

## Notes

- **Out of scope, deliberately: the MCP transport itself** — tool listing, the
  `mcp:read` scope check, the OAuth handshake. That is platform behaviour, it
  needs the version bump and a real MCP client to exercise, and the framework
  already unit-tests `buildMcp`. Building a harness for Lowdefy's own feature is
  not this module's job.
- These specs **are** the demo contribution for this design. The `mcp` block
  cannot be added to `apps/demo/lowdefy.yaml` until the consent page exists, and
  the demo could never be the consumer anyway — the whole point is consumption
  from outside the app by an OAuth client. That is a stated exception to the
  demo-consumer rule, not an oversight, so do not add a demo page that calls
  these endpoints to satisfy the rule's letter.
- `pnpm --filter @lowdefy/modules-mongodb-plugins build` must have run after tasks
  3 and 4, or the operators will not be in the dist the app loads.
