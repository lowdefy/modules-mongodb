# Implementation Tasks — Part 29 Error-model cleanup

## Overview

These tasks implement [Part 29](../design.md): the engine stops force-writing `error` transitions on mid-submit failures (they throw instead), `hook_error` is removed, soft-reject from pre-hooks rides Lowdefy's standard `:reject` control via a small upstream tweak, status entries become uniform `{ stage, created, event_id }`, and the handler's failure-return shape collapses to "success or throw."

## Tasks

| #   | File                                       | Summary                                                                                                            | Depends On |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-upstream-lowdefy-reject-flag.md`       | Upstream PR: add `UserError.isReject`, pass it from `controlReject`, classify `runRoutine` catch by it             | —          |
| 2   | `02-concept-spec-amendments.md`            | Edit `engine/spec.md`, `submit-pipeline/spec.md`, `ui/spec.md` to the new error model                              | —          |
| 3   | `03-part-1-and-part-6-design-notes.md`     | Add Part 1 callApi-throws deviation note; rewrite Part 6 § Failure shape for uniform status entries                | —          |
| 4   | `04-types-cleanup.md`                      | Drop polymorphic fields from `StatusEntry` typedef and `error_transition` from the handler return-type docs        | —          |
| 5   | `05-handlesubmit-remove-catch-converter.md`| Remove the steps 4–11 catch-converter from `handleSubmit.js`, drop `error_transition`, rewrite the two existing failing-step tests | 4          |
| 6   | `06-handlesubmit-new-failure-tests.md`     | Add new unit tests covering the propagate-everywhere failure model and the `:reject` pre-hook path                 | 5          |
| 7   | `07-part-13-no-trailing-reject-step.md`    | Verify Part 13's in-flight design and any draft implementation do not emit a trailing `:if`/`:reject` step         | —          |
| 8   | `08-part-22-e2e-specs.md`                  | Add Part 22 E2E specs for the retry-after-transient-throw path and the author-driven `error → resolve_error` path  | 1, 5       |

## Ordering Rationale

**T1 (upstream PR)** is a hard precondition for shipping Part 29 (per design § Upstream dependency) but unblocks no in-repo unit work — most tasks can land in parallel against it. Integration-layer `:reject` classification needs T1 merged; T8's E2E specs do too.

**T2 (concept specs) and T3 (Part 1/Part 6 design notes)** are documentation-only and independent of code. Landing them first puts the contract in writing so reviewers of the code changes have something to verify against.

**T4 (types) → T5 (handler code + existing-test rewrites)** because the handler edit removes the field that the typedef advertises. T5 bundles the two existing failing-step test rewrites because they assert the exact behaviour being removed — leaving them as-is would red-line the build.

**T6 (new unit tests)** follows T5 because the new tests exercise the new contract.

**T7 and T8** are independent of the in-repo code edits. T7 is a small verification on the in-flight Part 13 design. T8's specs depend on T5 (the new failure behaviour they exercise) and on T1 (for the `:reject` end-to-end spec).

T2, T3, T4, T7 can run in parallel. T1 can run in parallel with everything; it's a separate repo.

## Scope

**Source:** `designs/workflows-module/parts/29-error-model-cleanup/design.md`

**Context files considered:** none beyond the design (Part 29 has no supporting files outside the review folder).

**Review files skipped:** `review/review-1.md` (already addressed in the design).
