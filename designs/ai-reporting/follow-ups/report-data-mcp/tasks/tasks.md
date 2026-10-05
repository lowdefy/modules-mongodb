# Implementation Tasks — Report-data MCP

## Overview

Implements `designs/ai-reporting/follow-ups/report-data-mcp/design.md`: three
`ai-reporting` module `Api` endpoints (`get-report`, `get-report-data`, and an
MCP-facing `list-reports` sibling) shaped for consumption as MCP tools, plus the
plugin-side binder and response builder they need, an extraction of the
duplicated authorization predicate, e2e coverage and docs.

**All nine tasks are executable on the repo's current Lowdefy pin
(`0.0.0-experimental-20260814133003`).** The endpoints are ordinary `Api`
endpoints; nothing here needs the MCP server route. The version bump and the
`user-account` consent page gate only the app-level `mcp` block, which no task
in this set adds.

## Global Constraints

- **No `mcp` block is added to `apps/demo/lowdefy.yaml` by any task.** `buildMcp`
  throws for a non-public endpoint with no `auth.oauthProvider`, and the consent
  page that requires is `user-account` work tracked separately. This is a stated
  exception to the demo-consumer rule, not an oversight.
- **`query-data` is never listed in an `mcp` block.** The open engine has no
  field-level scoping, so a caller-authored pipeline over MCP is a bounded dump
  of any cataloged collection. The module cannot enforce this — it must be stated
  in `docs/ai-reporting/`.
- **Every MCP-facing endpoint is `type: Api` with both `description` and
  `payloadSchema`.** `InternalApi`, a missing description or a missing schema is
  a hard build error the moment the endpoint is listed as a tool.
- **`payloadSchema` is advertisory — it is never validated at runtime.** Every
  payload assumption (scope narrowing, `report_id` shape, filter keys) is
  guarded in the routine. A schema-only restriction enforces nothing.
- **Sections are serialized minus `query` and `optionsQuery`, everywhere.**
  Stated as a subtraction, not an allow-list, so a seventh section type is safe
  by default. Applies to `get-report` and to the `get-report-data` spec walk.
- **Truncation and failure are reported per section _and_ as two separate
  top-level lists** (`truncated_sections`, `failed_sections`). One boolean cannot
  carry both: truncated data is usable with a caveat, a failed section is absent.
- **Row cap is `PIPELINE_RESULT_CAP` = 1000** (`constants.js:118`), appended
  unconditionally by `validatePipeline.js:980`. Never hardcode the number.
- **Plugin source changes require a rebuild** —
  `pnpm --filter @lowdefy/modules-mongodb-plugins build` — before the demo build
  or e2e will see them.
- **`pnpm e2e` is the gate**, not `ldf:b`. A build check cannot catch
  routine-level behaviour, which is all three endpoints are.
- Repo conventions: snake_case step/request ids, kebab-case endpoint ids and
  file names, change stamps on writes (none of these endpoints write).

## Tasks

| #   | File                               | Summary                                                                                             | Depends On |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-extract-auth-fragments.md`     | Extract the readable-scope `$or` and the signed-in guard into `_ref` fragments; update 5 + 2 sites  | —          |
| 2   | `02-extract-filter-op-map.md`      | Pull the control→op mapping out of `boundFilters` into one shared exported function                 | —          |
| 3   | `03-report-queries-operator.md`    | New `_analytics.reportQueries`: real filter values, ISO→Date coercion, downloads included           | 2          |
| 4   | `04-report-response-operator.md`   | New `_analytics.reportSpec` + `_analytics.reportResponse`: strip rule, envelope, truncation/failure | —          |
| 5   | `05-get-report-endpoint.md`        | `get-report` endpoint + manifest wiring                                                             | 1, 4       |
| 6   | `06-list-reports-tool-endpoint.md` | MCP-facing `list-reports` sibling: guards + `CallApi` delegation                                    | 1          |
| 7   | `07-get-report-data-endpoint.md`   | `get-report-data` endpoint: bind filters, run sections, build the response                          | 1, 3, 4    |
| 8   | `08-e2e-mcp-endpoints.md`          | e2e specs over the three endpoints via `page.request`                                               | 5, 6, 7    |
| 9   | `09-docs.md`                       | `docs/ai-reporting/` MCP page, prohibitions and preconditions; `pnpm docs:gen`                      | 5, 6, 7    |

## Ordering Rationale

**Three independent starts.** Tasks 1, 2 and 4 touch disjoint files and can run
in parallel. Task 1 is a pure refactor of existing endpoints (4 files), task 2 a
pure refactor inside `compileReport.js`, task 4 a new plugin file. None depends
on the others.

**The plugin layer lands before the endpoints that call it.** Task 3 consumes
task 2's shared op map — that sharing is the point, since two hand-kept copies of
the control→op rules drift the first time a fourth control is added, and the
failure mode is a filter that silently does nothing. Tasks 5 and 7 cannot be
verified before the operators they call exist.

**Refactor is kept out of the feature tasks.** The readable predicate appears
five times across four files today and the signed-in guard twice; extracting them
(task 1) is separated from the endpoints that consume the extraction (5, 6, 7) so
a regression in existing report pages is attributable to one commit. Task 1 is
covered by the existing suite — `report-scopes.spec.js`,
`report-resolve-shared.spec.js`, `report-favourite-duplicate.spec.js` — which is
why it goes first and alone.

**The three endpoints are independent of each other** once 1/3/4 exist, so 5, 6
and 7 can run in parallel. Task 6 is the smallest by a wide margin (a guard plus
a delegation); task 7 is the largest.

**Verification and docs last**, because both describe the finished surface. e2e
is a single task rather than one per endpoint: the specs share seeded fixtures
and the cross-endpoint walk (`list` → `get-report` → `get-report-data`) is itself
one of the cases worth asserting.

### Two decomposition calls worth stating

**Where the new server-side code lives.** The design mandates a server-side
filter binder ("this is new code") and a spec-walking response, but does not name
the mechanism. Both are `_analytics.*` operators in
`plugins/modules-mongodb-plugins/src/analytics/`, registered in
`analyticsOperator.js`, because that is where every server-side reporting
transform in this module already lives (`compileReport`, `querySections`,
`validateReportSpec`, `buildFlintOption`), and because a YAML routine cannot walk
a spec. Git history shows the plugin and the endpoints moving together in single
commits (`feat(reporting,plugins): …`). This is the established shape, not added
scope.

**The `includeDownloads` change rides task 3** rather than getting its own task.
It is a one-line default-off parameter on `orderedQueries` plus a unit test, and
it is inseparable in practice from the operator that is its only caller. It must
**not** widen the shared filter: `resolve-report` consumes the same list and its
`:for` step array aligns index-for-index with `compileReport`'s `results`.

## Open item flagged for the design, not resolved here

The design's **Goal** section names the tool `ai-reporting__list-reports`, but
the **Endpoint work required** section decides on a dedicated MCP-facing sibling
rather than annotating `list-reports` — so the tool name cannot be
`ai-reporting__list-reports`. Task 6 uses endpoint id **`list-reports-tool`**,
following the in-repo precedent of `query-data-tool.yaml` (an
agent/tool-facing variant of `query-data`), giving the tool name
`ai-reporting__list-reports-tool`. This is an internal inconsistency in the
design, not a decision the decomposition should make silently: the Goal
section's tool list needs a one-line correction. Raise it rather than assume it.

## Scope

**Source:** `designs/ai-reporting/follow-ups/report-data-mcp/design.md`
**Context read:** `modules/ai-reporting/` (manifest, `api/list-reports.yaml`,
`api/resolve-report.yaml`, `api/query-data.yaml`),
`plugins/modules-mongodb-plugins/src/analytics/` (`analyticsOperator.js`,
`querySections.js`, `compileReport.js`, `validateReportSpec.js`, `constants.js`),
`apps/demo/e2e/ai-reporting/`, `docs/ai-reporting/`, `@lowdefy/api` dist
(`handleEndpointCall.js`, `invokeEndpoint.js`, `authorizeApiEndpoint.js`),
`@lowdefy/operators` (`getFromObject.js`), git history for
`plugins/…/analytics` + `modules/ai-reporting/api`
**Review files skipped:** `review/review-1.md`, `review/review-2.md`,
`review/review-3.md`
