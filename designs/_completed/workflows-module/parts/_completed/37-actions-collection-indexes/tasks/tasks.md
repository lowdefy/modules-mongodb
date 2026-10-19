# Implementation Tasks — `actions` and `workflows` Collection Indexes

## Overview

These tasks implement Part 37, a documentation-only change that pins down the minimum index set the shipped workflows-module queries require, the schema-shape constraints that keep those indexes compatible with the future tasks module, and one factual correction to a concept doc. Derived from `designs/workflows-module/parts/37-actions-collection-indexes/design.md`. No shipped code or tests change.

## Tasks

| #   | File                          | Summary                                                                                               | Depends On |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-document-indexes.md`      | Add a standalone `## Indexes` section to the workflows README and amend the CLAUDE.md README template | —          |
| 2   | `02-correct-tracker-claim.md` | Flip the incorrect tracker-subscription mechanism wording in the tasks-module-plan concept doc        | —          |

## Ordering Rationale

The two tasks are fully independent and can run in parallel — they touch disjoint files and neither depends on the other's output.

The README `## Indexes` section (item 1 in the design) and the CLAUDE.md fixed-template amendment (item 5) are bundled into **one** task because they have a hard consistency requirement: the template list must name `Indexes` in exactly the position the section is placed (between `Exports` and `Vars`). Splitting them risks the template and the section drifting, and the CLAUDE.md one-liner is meaningless without the section it documents. The design's item 2 (no-validator constraint) and item 3 (non-partial constraint) are not separate edits — they are content _inside_ the README section, so they fold into Task 1.

The concept-doc correction (item 4) is a self-contained one-bullet flip in a different file with its own verification (the mechanism in `fireTrackerSubscription.js`), so it stands alone as Task 2.

## Scope

**Source:** `designs/workflows-module/parts/37-actions-collection-indexes/design.md`
**Context files considered:** none beyond the design (the design folder contains only `design.md` and a review file). Verified against `modules/workflows/README.md`, `CLAUDE.md`, `modules/workflows/connections/actions-collection.yaml`, `modules/workflows/connections/workflows-collection.yaml`, `designs/workflows-module-concept/tasks-module-plan/design.md`, and `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js`.
**Review files skipped:** `review/review-1.md`
