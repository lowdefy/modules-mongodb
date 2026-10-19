# Implementation Tasks — Part 45: Demo rebuild

## Overview

These tasks rebuild the demo app's `workflow_config` from scratch as a realistic lead-onboarding demo (qualify → quote → purchase order → convert to customer) with a cross-entity `company-setup` child workflow started from the companies module's new-company page via the Part 44 tracker `start_link`. Derived from `designs/workflows-module/parts/45-demo-rebuild/design.md`.

## Prerequisites

**This part lands after Part 38 tasks 12–19, Part 43, and Part 44** (the landing chain recorded in `38-engine-rebuild/tasks/20-demo-migration.md`). As of task-breakdown time (2026-06-03), Part 38 bands 1–2 plus tasks 9, 10, 11, 21 are committed; tasks 12–19 and Parts 43/44 are not. The new config is authored in the post-rebuild grammar — `kind: check` (Part 43), `action-*` shared pages (Part 43), signal-keyed hooks and `{ type, signal, upsert }` spawn entries (Part 38), per-verb access maps (Part 34/38 task 6), `tracker.start_link` (Part 44) — none of which validate or run until those parts are in.

Exception: **task 1** (the companies module `on_create_routine` var) touches only `modules/companies/` and has no dependency on the workflows engine — it can land any time.

Note: the demo app is currently in a known-broken window — Part 38 task 6's `validateActionAccess` rejects the old config's shorthand `access: { demo: [edit, view], roles: [...] }` grammar, and task 20 (the in-place migration that would have fixed it) was superseded by this part. Tasks 2–3 are what close that window.

## Tasks

| #   | File                                    | Summary                                                                                                                        | Depends On |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-companies-on-create-routine-var.md` | Companies module `on_create_routine` var: manifest schema, `create-company` concat split, new-page `url_query` forward, README | —          |
| 2   | `02-company-setup-workflow-config.md`   | Author the `company-setup` workflow config (workflow + 3 actions)                                                              | —          |
| 3   | `03-onboarding-workflow-config.md`      | Rewrite the `onboarding` config, delete `installation`, point `workflows.yaml` at the two new configs                          | 2          |
| 4   | `04-lead-side-demo-wiring.md`           | `leads-create` starts onboarding; `lead-view` cleanup; delete the raw-insert API                                               | 3          |
| 5   | `05-company-side-demo-wiring.md`        | Demo `on_create_routine` steps + workflows panel slot on companies view + workflows `entities` entry                           | 1, 2       |
| 6   | `06-notifications-send-routine.md`      | Wire the demo `send_routine`: `action-approve` × `send-quote` → inbox notification                                             | 3          |
| 7   | `07-docs-authoring-conventions.md`      | Workflows README + action-authoring concept doc: D1 `starting_actions` convention + D2 `blocked_by` rule                       | 3          |
| 8   | `08-e2e-happy-path.md`                  | Delete the stale tracker spec; author `onboarding-happy-path.spec.js` per the worked example                                   | 4, 5, 6    |

## Ordering Rationale

- **Task 1 first (or any time):** the `on_create_routine` extension is pure companies-module work with no engine dependency. It must precede task 5, which injects demo steps into the var.
- **Child config before parent (2 → 3):** `track-company-setup` declares `tracker.workflow_type: company-setup`, so authoring the child first reads naturally. Task 2's files are not yet referenced by `workflows.yaml` (the old configs still occupy it and fail the post-38 validator), so full build validation of both configs happens at task 3, which deletes the old configs and rewrites `workflows.yaml` — that is the commit where the demo build goes green again.
- **Demo wiring fans out after the config (3 → 4, 6, 7; 1+2 → 5):** tasks 4, 5, 6, 7 touch disjoint files and can run in parallel once their dependencies land. Task 4 removes lead-view UI that referenced the deleted installation workflow; task 5 wires the company side (needs the module var from 1 and the `company-setup` type from 2); task 6 filters on the `send-quote` action type defined in 3; task 7 documents the conventions the new config canonically demonstrates.
- **E2E last (8):** the happy-path spec walks the entire chain — lead create through onboarding completion — so it needs every wiring task in place. It doubles as the part's integration verification.

Design item 11 (reduce `38-engine-rebuild/tasks/20-demo-migration.md` to a stub) is **already done** — the stub exists on `workflows-sam` — so no task covers it.

## Scope

**Source:** `designs/workflows-module/parts/45-demo-rebuild/design.md`
**Context files considered:** none besides design.md — the part folder contains only `design.md` and `review/`. Referenced sibling designs read for context: `44-tracker-start-link/design.md`, `43-rename-simple-kind-to-check/design.md`, `38-engine-rebuild/tasks/tasks.md` + task 12 + task 20, `41-notification-roles-model/design.md` (recipient policy is app-owned).
**Review files skipped:** `45-demo-rebuild/review/` (one file), per the design-task skill.
