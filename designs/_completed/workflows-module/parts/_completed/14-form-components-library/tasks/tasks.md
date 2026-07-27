# Implementation Tasks — Part 14: Form components library

## Overview

Ship the 27 internal field components at `modules/workflows/components/fields/` that form actions reference by name in their `form:` blocks, plus a README. A working starting point exists at `modules/workflows/components-current/edit/*.yaml.njk` but deviates from the spec in shape, location, and file extension — most of the work is porting these into the spec'd shape (`vars: / config:` plain YAML) and resolving deviations along the way. Verification rolls up into part 20's demo build and part 15's resolver integration tests; this part does not ship its own test harness.

Derived from [../design.md](../design.md), with reference to [../../../../workflows-module-concept/action-authoring/spec.md](../../../../workflows-module-concept/action-authoring/spec.md) (§ "Form components library").

## Tasks

| #   | File                              | Summary                                                                                                                             | Depends On |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-scaffold-fields-directory.md` | Create `modules/workflows/components/fields/`, settle file-shape decisions, port one canonical component end-to-end as the template | —          |
| 2   | `02-port-text-numeric.md`         | Port `text_input`, `text_area`, `tiptap_input`, `number`                                                                            | 1          |
| 3   | `03-port-date.md`                 | Port `date_selector`, `date_range_selector`                                                                                         | 1          |
| 4   | `04-port-choice.md`               | Port the 8 choice components + resolve `enum_selector` enum path                                                                    | 1          |
| 5   | `05-port-files-location.md`       | Port `file_upload`, `file_download`, `location`                                                                                     | 1          |
| 6   | `06-port-display.md`              | Port `label`, `label_value`, `title`, `section_title`, `alert`, `html`                                                              | 1          |
| 7   | `07-port-structure-actions.md`    | Port `box`, `section`, `controlled_list`, `button`                                                                                  | 1          |
| 8   | `08-write-readme.md`              | Component-by-component README at `components/fields/README.md`                                                                      | 2–7        |
| 9   | `09-retire-components-current.md` | Delete `modules/workflows/components-current/` and `card_template.yaml`                                                             | 2–7        |

## Ordering rationale

- **Task 1 is the gate.** It settles the per-file shape (the spec's `vars: / config:` vs the current `component:`-only fragment), the `.yaml` vs `.yaml.njk` choice, and how Nunjucks-style interpolations like `{{ key }}` are replaced with operator-based equivalents (e.g. `id: { _var: key }`). One canonical component is ported end-to-end so that tasks 2–7 follow a worked template. Without this gate, the six porting tasks would each re-litigate the same decisions.
- **Tasks 2–7 are parallelisable** after task 1 lands. They split the 27 components into the spec's natural categories. Each category is independently reviewable.
- **Task 4 (Choice) carries the `enum_selector` open question** — the current implementation references `../shared/enums/options_enum.yaml`, which doesn't exist in the repo. Task 4 owns deciding whether the enum-to-options conversion lives inside `enum_selector` itself (via inline operators) or in a co-located shared helper.
- **Task 8 (README) follows** because it needs the final shipped set of components.
- **Task 9 retires the staging directory** once the new components are verified and consumed. Last so a fallback is available if reviewers want to compare line-by-line. Verification itself (YAML validity, substitution correctness) rolls up into part 20's demo build and part 15's resolver integration tests.

## Scope

**Source:** [../design.md](../design.md)
**Context files considered:**

- [../../../../workflows-module-concept/action-authoring/spec.md](../../../../workflows-module-concept/action-authoring/spec.md) — § "Form components library", § "Form action", § "Resolver pipeline"
- [../../../design.md](../../../design.md) — parts overview and dependency graph
- [../../../../../docs/idioms.md](../../../../../docs/idioms.md) — slots / component-export conventions
- `modules/workflows/components-current/edit/*.yaml.njk` — current implementation (27 files; the porting source)
- `modules/workflows/components-current/card_template.yaml` — out-of-spec leftover (retired in task 9)
- `modules/events/`, `modules/contacts/` — peer module structure for manifest and component conventions
  **Review files skipped:** none (no `review/` folder under part 14)
