# Task 5: Audit sibling part designs for `entity_type` stragglers

## Context

Part 21's design (per the "Implemented parts" section) refreshes the unimplemented sibling parts' `design.md` files in this PR — specifically parts 5 (start-cancel-handlers), 12 (resolver-pages), and 19 (operational-apis). Part 18 (entity-components) needs no edit because its design doesn't reference `entity_type`. Parts 3 (engine-plugin-shell), 4 (workflow-config-schema), and 14 (form-components-library) have shipped — their `design.md` and `tasks/` are frozen and not touched.

The action-review pass already landed the edits for parts 5 and 19; part 12 was already updated by its own review-1 resolution before part 21 started. This task is a confirmation sweep — once task 1 (concept docs) lands, the unimplemented part designs should be checked against the now-authoritative concept docs to catch anything the earlier passes missed.

## Task

1. Run `grep -rln "entity_type" designs/workflows-module/parts/` and list every file in the result.
2. For each result:
   - If the file is under `parts/03-engine-plugin-shell/`, `parts/04-workflow-config-schema/`, or `parts/14-form-components-library/` (the implemented parts), or any `review/`, `tasks/`, or `parts/21-*/` directory — **do not edit**. These are frozen artifacts or scoped to part 21's own review/tasks.
   - If the file is under any other part's `design.md`, check whether the `entity_type` reference still makes sense after the concept-doc updates from task 1. Almost certainly the answer is "no, rewrite" — apply the same transform as task 1: drop from payload contracts, drop from doc-shape lists, replace worked-example values with `entity_collection: <connection-id>`.
3. Specifically re-verify the lines already edited during the action-review pass to confirm they're still correct:
   - `designs/workflows-module/parts/05-start-cancel-handlers/design.md` — lines around 14 (payload required) and 23 (workflow-doc write list).
   - `designs/workflows-module/parts/19-operational-apis/design.md` — lines around 14 (start-workflow required), 15 (start-workflow optional), 29 (get-entity-workflows payload).
   - `designs/workflows-module/parts/12-resolver-pages/design.md` — entity-context template var passes.

## Acceptance Criteria

- `grep -rln "entity_type" designs/workflows-module/parts/` returns only paths matching `parts/03-*`, `parts/04-*`, `parts/14-*`, `parts/21-entity-type-to-collection/`, or any `*/review/*` or `*/tasks/*` subdirectory.
- Parts 5, 12, 19 `design.md` files describe payload contracts with `entity_collection` only.
- Part 18 `design.md` is unchanged (it has no `entity_type` references to begin with).
- Parts 3, 4, 14 `design.md` and `tasks/` are unchanged.

## Files

- `designs/workflows-module/parts/05-start-cancel-handlers/design.md` — confirm + edit if needed.
- `designs/workflows-module/parts/12-resolver-pages/design.md` — confirm + edit if needed.
- `designs/workflows-module/parts/19-operational-apis/design.md` — confirm + edit if needed.
- Any other unimplemented part's `design.md` surfaced by the grep — modify per the task-1 transform.

## Notes

The "frozen artifacts" rule is part 21's own decision (see the "Implemented parts" section of part 21's `design.md`). It prevents this PR from retroactively rewriting the history of parts 3 and 4, which would obscure what was specced when those parts shipped. The trade-off is that `grep "entity_type"` against the repo will continue to surface stale hits inside `parts/03-*/tasks/` and `parts/04-*/tasks/` — that's expected and acceptable.
