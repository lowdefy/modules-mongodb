# Implementation Tasks — Rename `kind: simple` → `kind: check`

## Overview

A pure vocabulary sweep that renames the workflow-action kind value `simple` to `check` across all code, fixtures, and consumer-facing terminology. No behavioural change, no data migration (pre-production). Derives from `designs/workflows-module/parts/43-rename-simple-kind-to-check/design.md`. Page ids, file paths, and routes are **untouched** — they were already renamed to `workflow-action-*` by Part 38 task 18.

## Tasks

| #   | File                              | Summary                                                                                  | Depends On |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-validator-rename.md`          | Flip `ACTION_KINDS` and the kind branches/error wording in the config-schema validator + its resolver tests | —          |
| 2   | `02-engine-rename.md`             | Rename the `simple` FSM-table alias, the render-layer kind branch, the `ActionKind` typedef + all plugin engine tests | —          |
| 3   | `03-docs-and-demo-sweep.md`       | Update README + living concept-spec terminology; verify the demo `workflow_config` is fully on `check` | 1, 2       |

## Ordering Rationale

The runtime surfaces split cleanly across two independent packages, each with co-located tests, so Tasks 1 and 2 are **parallel** — neither imports the other, and each leaves its own package's test suite green:

- **Task 1** owns `modules/workflows/resolvers` — the build-time config-schema validator (`makeWorkflowsConfig.js`) that accepts/rejects `kind:` values, plus the four resolver test files that seed `kind: "simple"` fixtures.
- **Task 2** owns `plugins/modules-mongodb-plugins` — the runtime engine FSM table alias (`tables.js`), the render-layer page-routing branch (`computeEngineLinks.js`), the `ActionKind` typedef (`types.js`), and all plugin engine tests.

Both must land for the system to be end-to-end correct: the demo config already declares `kind: check` (committed on this branch), so the validator currently **rejects** the demo and a `check` action would find no FSM key at runtime. Task 1 un-breaks the build; Task 2 makes the runtime resolve it.

**Task 3** (docs + demo verification) is sequenced last because it should describe the post-rename world. It has no code dependency but is ordered after 1 and 2 so the terminology it documents matches the shipped code. The demo config is already on `check`, so Task 3's demo portion is a verification step, not a change.

Tasks 1 and 2 can be implemented and reviewed concurrently. If preferred, all three collapse cleanly into a single mechanical commit (the design frames this as "one mechanical, zero-behaviour sweep, reviewable as exactly that").

## Scope

**Source:** `designs/workflows-module/parts/43-rename-simple-kind-to-check/design.md`
**Context files considered:** none (the design folder contains only `design.md`); supporting facts gathered from the live tree (`modules/workflows/`, `plugins/modules-mongodb-plugins/`, `apps/demo/`, `modules/workflows/README.md`, `designs/workflows-module-concept/`).
**Review files skipped:** none present in this design folder.
