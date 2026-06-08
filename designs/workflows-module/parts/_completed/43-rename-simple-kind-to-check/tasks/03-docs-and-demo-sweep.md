# Task 3: Update consumer-facing terminology (README + concept spec) and verify the demo config

## Context

With the validator (Task 1) and engine (Task 2) renamed, the consumer-facing terminology must follow. The design lists "README + remaining concept-doc terminology (`form / simple / tracker` → `form / check / tracker`)" as a changed surface. This task aligns the prose so the documented vocabulary matches the shipped code, and verifies the demo `workflow_config` (which already declares `kind: check` on this branch) has no stragglers.

This task carries judgment: only terminology describing the **current/live** kind taxonomy is renamed. Historical and forward-looking references that intentionally name `simple` as the *old* value must be preserved.

### Do NOT touch

- **`designs/workflows-module/parts/_completed/`** — frozen historical record (as Part 35 left the `task`-era parts). Includes the Part 35 rename design.
- **`designs/workflows-module/parts/43-rename-simple-kind-to-check/design.md`** — this part's own design discusses the `simple → check` rename and must keep both words.
- **`designs/workflows-module/implementation-plan.md`** — the roadmap tracker intentionally says things like "the resolver/engine still validate `kind: simple` (43)" to describe the pending rename. Marking Part 43 shipped is a separate roadmap refresh, not this sweep.
- **Any `review/` subfolder** under the concept docs — review files are treated as already-addressed feedback and are left as-is.
- Any prose that is explicitly recounting the rename history (e.g. "the kind formerly known as `simple`").

## Task

### 1. README

Update `modules/workflows/README.md` so the action-kind taxonomy reads `form / check / tracker`. Known sites (verify by grep; line numbers approximate):

- Line ~88: "Every action declares a `kind:` — `form`, `simple`, or `tracker`" → `form`, `check`, or `tracker`.
- Line ~118: per-kind FSM list "(`form`, `simple`, `tracker`)" → `check`.
- Line ~190: "a `kind: form` (or `kind: simple`) trigger action" → `kind: check`.
- Lines ~282–284: the shared-page table descriptions "Shared simple-kind action ... page" → "check-kind".
- Line ~290: "simple actions use the shared `workflow-action-*` pages" → "check actions".
- Line ~333: submit-endpoint emission "one per `kind: form` or `kind: simple` action" → `kind: check`.

Do **not** rename the page ids `workflow-action-edit` / `-view` / `-review` or any route — only the *kind* word in the surrounding description.

### 2. Living concept spec terminology

In `designs/workflows-module-concept/`, update terminology that describes the current kind taxonomy from `simple` → `check`. Work file-by-file with grep and judgment (do not blanket-`sed`). Files known to carry kind-taxonomy references (counts are a guide, not a target — some occurrences may be historical and must stay):

- `spec.md`, `design.md`
- `action-authoring/design.md`, `action-authoring/spec.md`
- `state-machine/design.md`
- `ui/design.md`, `ui/spec.md`
- `submit-pipeline/design.md`, `submit-pipeline/spec.md`
- `engine/design.md`, `engine/spec.md`
- `module-surface/design.md`, `module-surface/spec.md`
- `action-groups/design.md`
- `tasks-module-plan/design.md`

For each, change references to the live kind value `simple` → `check`. Where a doc deliberately documents the rename history or names `simple` as a prior/rejected name, leave it. Skip every `review/` subfolder.

### 3. Verify the demo config

Confirm `apps/demo/modules/workflows/workflow_config/` declares only `form` / `check` / `tracker` and no `kind: simple`:

```
grep -rn "kind:" apps/demo/modules/workflows/workflow_config/
```

Expected: the four check actions (`company-setup/kickoff-call.yaml`, `company-setup/assign-account-manager.yaml`, `onboarding/schedule-followup.yaml`, `onboarding/site-visit.yaml`) already read `kind: check`; the rest are `form` / `tracker`. If any `kind: simple` remains, change it to `check`. (On this branch it is already fully migrated — this is a verification step.)

## Acceptance Criteria

- `grep -rn "kind: simple\|kind: 'simple'\|kind: \"simple\"" apps/demo/` returns nothing.
- `modules/workflows/README.md` describes the kinds as `form / check / tracker`; no `simple`-kind reference remains, and no page id/route was altered.
- Living concept-spec docs under `designs/workflows-module-concept/` describe the kind as `check`; only intentional historical references to `simple` remain.
- `_completed/` parts, this part's own `design.md`, `implementation-plan.md`, and all `review/` folders are unchanged.

## Files

- `modules/workflows/README.md` — modify — kind-taxonomy prose.
- `designs/workflows-module-concept/**/*.md` (excluding `review/` subfolders) — modify — kind-taxonomy terminology, surgically.
- `apps/demo/modules/workflows/workflow_config/**/*.yaml` — verify (modify only if a `kind: simple` straggler is found).

## Notes

- This is the lowest-risk task but the one requiring most judgment — prefer reading each occurrence in context over bulk find-and-replace, so historical/rationale references are preserved.
- The roadmap entry for Part 43 in `implementation-plan.md` is updated when the part ships (a separate roadmap refresh), not here.
