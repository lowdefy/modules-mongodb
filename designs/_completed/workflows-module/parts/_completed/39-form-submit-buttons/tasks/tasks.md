# Implementation Tasks — Part 39: Form-action submit buttons (interaction → signal)

## Overview

These tasks implement Part 39 of the workflows module: rewriting the four form-action page templates (`edit` / `view` / `review` / `error`) to fire the **signals + FSM** model instead of the old `interaction:` payloads, adding the first-class `progress` (Save Draft) button, deriving button visibility from an FSM source-stages map, adding a button bar to the read-only `view` template, and reconciling the concept docs. Derived from `designs/workflows-module/parts/39-form-submit-buttons/design.md`.

## Tasks

| #   | File                                       | Summary                                                                                                               | Depends On |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-button-signal-sources-enum.md`         | Create `enums/button_signal_sources.yaml` (the signal→source-stages map)                                              | —          |
| 2   | `02-edit-template-signals-progress.md`     | Rewrite `edit.yaml.njk`: signal payloads, `progress` button, FSM visibility, drop `fields`                            | 1          |
| 3   | `03-review-template-signals-visibility.md` | Rewrite `review.yaml.njk`: signal payloads, FSM visibility, drop dead `fields`                                        | 1          |
| 4   | `04-error-template-signals-visibility.md`  | Rewrite `error.yaml.njk`: signal payload, FSM visibility, drop dead `fields`/`form_review`                            | 1          |
| 5   | `05-view-template-button-bar.md`           | Add a floating-actions bar to `view.yaml.njk` (Edit-nav + `request_changes` modal)                                    | 1          |
| 6   | `06-fsm-guard-test-and-plugin-export.md`   | Add plugin `./fsm` export + module guard test asserting enum matches the FSM `form` table                             | 1          |
| 7   | `07-e2e-supplements.md`                    | E2E specs: Save Draft, button-absent-from-stage, submit-from-done re-open                                             | 2, 5       |
| 8   | `08-doc-reconciliation.md`                 | Reconcile `ui` D2/D3/D4 + `state-machine` button-bar table; README button-visibility rules; parent-design Part 39 row | —          |

## Ordering Rationale

**Task 1 (the enum) is the foundation** — every template's `visible` block in tasks 2–5 reads `enums/button_signal_sources.yaml` at build time via `_ref`, and the guard test (task 6) validates it. It must exist first.

**Tasks 2–5 (the four template rewrites) are independent of each other** once the enum exists and can run in parallel. Each touches exactly one `.yaml.njk` file. Task 2 (`edit`) is the largest — it carries the rename, the net-new `progress` button + `onProgress` verb, and two payload copies (inline + modal). Tasks 3/4 are mechanical signal migrations + visibility rewrites. Task 5 (`view`) is the one net-new surface (a bar where there was none).

**Task 6 (guard test + plugin export)** depends on task 1 (it reads the enum) and on Part 38 having created `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js` (external dependency — this part sequences with/after Part 38). It adds the package's `./fsm` public export and the module-side test. Parallelizable with the template tasks.

**Task 7 (e2e)** depends on tasks 2 **and 5**. Case (a) (Save Draft) exercises the `edit` template (task 2). Cases (b) and (c) start on the `view` template and need task 5's Edit-nav button: the only UI path to the edit page of a `done` action is a `Link` carrying `input: { skip_status_redirect: true }` — the `review` page's Edit-link is unreachable for `done` (review's stale-URL allowlist `[in-review, error]` bounces `done` to view before its bar renders) — so (b)'s `done`-stage assertions and (c)'s `view → Edit` navigation both go through `view`'s Edit button. Task 7 also relies on Part 38's engine behaviour at runtime.

**Task 8 (doc reconciliation)** is markdown-only and has no code dependency — it transcribes the decisions already locked in `design.md` (D4's `view` bar, D5's `onProgress` verb) into the concept docs and registers the part in the parent index. Can run any time.

Tasks 2, 3, 4, 5, 6, and 8 can all proceed in parallel after task 1.

## Scope

**Source:** `designs/workflows-module/parts/39-form-submit-buttons/design.md`
**Context files considered:** `edit-for-universal-fields.md` (Part 24 universal-fields decoupling note); `designs/workflows-module-concept/state-machine/design.md` (FSM tables + "Default v1 button bars"); `designs/workflows-module-concept/ui/design.md` (Decisions 2/4); `designs/workflows-module/parts/38-engine-rebuild/design.md` (signal contract, FSM `tables.js`); `designs/workflows-module/design.md` (parent, follow-on parts).
**Review files:** `review-1`/`review-2` resolutions were already folded into `design.md` before task derivation (skipped as inputs); `review-3`/`review-4` findings were subsequently actioned directly into these task files and `design.md`.
