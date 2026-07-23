# Implementation Tasks — Reporting Open Query Engine

## Overview

Implements `designs/reporting-open-query-engine/design.md`: replace the structured analytics query spec with AI-authored, allowlist-validated MongoDB aggregation pipelines across every reporting surface (chat, charts, saved reports, exports), backed by a collections catalog and a read-only MongoDB principal. This is a breaking replacement — the structured spec, its compiler, and old persisted reports are dropped, no compatibility path.

## Tasks

| #   | File                                  | Summary                                                                            | Depends On |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| 1   | `01-allowlist-constants.md`           | Allowlist constants for the three pipeline grammars + resource caps                | —          |
| 2   | `02-validate-pipeline.md`             | `validatePipeline.js` reconstruct-don't-forward walker + adversarial test suite    | 1          |
| 3   | `03-analytics-pipeline-request.md`    | `AnalyticsPipeline` request replaces `AnalyticsQuery`; connection-level catalog    | 2          |
| 4   | `04-collections-catalog.md`           | Collections catalog replaces the dataset list (manifest var schema + demo catalog) | —          |
| 5   | `05-chat-query-path.md`               | `query-data` API on pipelines + agent instruction rewrite                          | 3, 4       |
| 6   | `06-charts-reports-exports.md`        | Presentation contract: analytics validators/compilers + five API YAMLs             | 3, 4       |
| 7   | `07-demo-consumers-and-build.md`      | Demo consumers for every new capability + build verification                       | 5, 6       |
| 8   | `08-docs.md`                          | Docs: open-engine concept, security model, catalog reference, bootstrap workflow   | 6          |
| 9   | `09-readonly-principal-deployment.md` | Read-only MongoDB principal provisioning + deployment docs                         | —          |
| 10  | `10-catalog-bootstrap-script.md`      | AI-drafted, human-curated catalog bootstrap script                                 | 4          |

## Ordering Rationale

The security core is a strict chain: the allowlist constants (1) feed the validator (2), which is the sole dependency of the new connection request (3). The collections catalog (4) is independent config-shape work and can run in parallel with 1–3. The two consumer rewrites — the chat path (5) and the charts/reports/exports path (6) — both need the request (3) and the catalog (4) but not each other, so they can run in parallel. The demo-consumer task (7) is the integration gate: it exercises everything 5 and 6 built and runs the full build check, so it comes after both. Docs (8) describe what 6 finalized. The deployment docs (9) touch no code and can be written any time. The bootstrap script (10) needs only the catalog shape (4).

Boundaries were chosen so each task leaves the repo verifiable in isolation: 1–2 are pure plugin code with their own unit tests; 3 swaps the request while its consumers are still broken (unit-testable, not build-testable — the build gate is task 7); 4 is config + generated docs; 5/6 are the consumer swaps; 7 is the single point where `pnpm ldf:b:i` must pass.

One naming decision made here (the design leaves it open): the module var is renamed `datasets` → `catalog`, and the demo file `apps/demo/modules/reporting/datasets.yaml` → `catalog.yaml`. Breaking renames are in scope per the design's compatibility waiver.

## Scope

**Source:** `designs/reporting-open-query-engine/design.md`
**Context files considered:** none exist (design.md is the only design file)
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md`
