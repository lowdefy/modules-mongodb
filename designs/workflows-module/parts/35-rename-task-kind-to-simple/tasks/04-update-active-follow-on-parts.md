# Task 4: Update Active Follow-On Parts (Designs)

## Context

The workflows-module design is split into numbered parts under `designs/workflows-module/parts/`. Several active (not-yet-shipped, or mid-flight) follow-on parts reference `kind: task` or the shared page IDs `task-edit` / `task-view` / `task-review` in their design.md. As part of the rename, these references flip in place so the design surface stays consistent with the renamed code.

**Scope rules:**
- **Active parts only.** Anything under `designs/workflows-module/parts/_completed/` (frozen, shipped) and `_rejected/` (frozen, superseded) stays as-is.
- **`design.md` only.** `review/` subfolders and `review-*.md` files at the top level of each part stay frozen — they describe the world at the time of review and are historical.
- **The current part (35) is excluded** — the rename design itself uses `kind: task` and `task-*` as the rename source, which is correct.
- **Part 30 (status-map-rendering) is excluded** — Part 38 supersedes it and moves it to `_rejected/`; renaming a design slated for rejection is wasted churn.

The parts in scope (per the design's "Files changed — active follow-on parts" table):

| Part | Files | Approx site count |
| ---- | ----- | ----------------- |
| 22-workflows-e2e-suite | `design.md` | 3 |
| 24-universal-fields | `design.md` | 5 |
| 28-custom-action-kind | `design.md` | 6 |
| 33-comment-rendering | `design.md` | 3 |
| 34-action-access-model | `design.md` | 12 |

> **Part 30 (status-map-rendering) is excluded.** Part 38 (engine-rebuild) supersedes Part 30 and moves it to `_rejected/`. Renaming a design slated for rejection is wasted churn (same reason `_completed/` parts are out of scope), so Part 30's `design.md` and its six `tasks/*.md` files — formerly the largest single cluster in this part — are not touched. See the design's Out-of-scope section.

## Task

For each part listed above, open the `design.md` and flip every mention of `kind: task` and `task-edit` / `task-view` / `task-review` to the new vocabulary:

- `kind: task` → `kind: simple`
- `kind === "task"` / `kind === 'task'` → `kind === "simple"` / `kind === 'simple'`
- `task-edit` → `simple-edit`
- `task-view` → `simple-view`
- `task-review` → `simple-review`

### Things to leave alone

- **General word "task"** in unrelated contexts (e.g. "workflow tasks", "this design task", "implementation task", "the task at hand") — leave alone. Only flip the specific `kind: task` literal, kind-enum mentions in prose, and the three `task-*` page-ID strings.
- **`review/` subfolders and `review-*.md` files** in each part — leave frozen.
- **Frontmatter, headings, and section titles** unrelated to the kind/page-ID rename — do not edit.

### Cross-part conflict notes (Part 28 specifically)

Part 28's design.md contains a comparison table and prose comparing `custom` semantics to `task` semantics. Flip those `task` mentions to `simple`. If Part 28's design.md has a code-touchpoint section listing `kind === "task"` checks in shipped files, flip those literals too — they reflect the post-rename world.

### Sweep check

After applying the flips, run a search across the in-scope parts for `kind: task`, `task-edit`, `task-view`, `task-review`:

```bash
rg -n "kind: task|kind: \"task\"|kind: 'task'|task-edit|task-view|task-review" \
   designs/workflows-module/parts/{22,24,28,33,34} \
   --glob '!review*' --glob '!review/**'
```

The only remaining hits should be inside the excluded files (review/) — if any survive in `design.md`, flip them. (Part 30 is intentionally absent from the sweep — it is excluded; see the note above.)

## Acceptance Criteria

- All `design.md` files in the listed parts (22, 24, 28, 33, 34) have `kind: task` → `kind: simple` and `task-*` page IDs → `simple-*` page IDs.
- Part 30 is not touched (excluded — Part 38 supersedes it).
- Files in `review/` subfolders and `review-*.md` files at part top level are untouched.
- The sweep command above returns hits only in excluded paths (or no hits at all).

## Files

- `designs/workflows-module/parts/22-workflows-e2e-suite/design.md` — modify — flip 3 sites.
- `designs/workflows-module/parts/24-universal-fields/design.md` — modify — flip 5 sites.
- `designs/workflows-module/parts/28-custom-action-kind/design.md` — modify — flip 6 sites (comparison table and prose).
- `designs/workflows-module/parts/33-comment-rendering/design.md` — modify — flip 3 sites.
- `designs/workflows-module/parts/34-action-access-model/design.md` — modify — flip 12 sites.

## Notes

- Be precise: it is easy to flip a generic word "task" when the intent was only `kind: task` and the page-ID strings. When in doubt, leave a generic mention alone and only flip the three target patterns (kind value, kind-enum mention in prose, page-ID strings).
- Do not edit `designs/workflows-module-concept/design.md` line 314 (or anywhere else in `workflows-module-concept/`) that describes `kind: task` as reserved for the future tasks module — that reservation note must stay, and it sits outside the parts/ tree anyway.
- This task is pure documentation editing — it has no code dependency and can ship in parallel with Tasks 1–3. Recommended to bundle into the same PR for review consistency.
