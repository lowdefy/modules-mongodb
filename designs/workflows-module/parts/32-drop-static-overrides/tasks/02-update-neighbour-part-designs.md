# Task 2: Reconcile neighbour part designs with the status Layer-2 collapse

## Context

Three other part design docs cite Layer 2 by name and need their prose updated so the project's design-as-source-of-truth invariant holds. All three are in `_completed/`, so per `CLAUDE.md` ("designs under `_completed/` are read-only history; add notes documenting deviations") each gets a top-of-file deviation note rather than a body rewrite:

- **Part 4** (`_completed/04-workflow-config-schema/design.md`) — shipped. Drops `interactions:` from the per-action schema. No dedicated rejecting validator (the schema validator has no unknown-keys rejection).
- **Part 9** (`_completed/09-hook-invocation/design.md`) — shipped. Drops the Layer 2 branch in `resolveTargetStatus`. Adds pre-hook `status` enum-membership runtime check. Three-layer status resolution becomes two-layer. **Does not** touch the event-overrides merge (still four-layer).
- **Part 13** (`_completed/13-resolver-apis/design.md`) — tasks 1–2 shipped. Stop emitting the `interactions:` literal into the per-action endpoint payload. **Does not** touch the `event_overrides:` literal.

The `event:` block stays as a build-time override channel — out of scope for Part 32, tracked under [Part 33](../../33-comment-rendering/design.md). Do not touch any prose describing the event-overrides merge or the `event_overrides:` endpoint literal.

Read each file before editing — the prose styles differ.

## Task

For each of the three parts, update the design doc so a reader landing on it cold gets a coherent description that matches the post-Part-32 world.

1. **Part 4** (`designs/workflows-module/parts/_completed/04-workflow-config-schema/design.md`):
   - Since this is in `_completed/`, do NOT rewrite the body. Add a short note at the top (under the title, before the first heading) along the lines of:
     > **Deviation (Part 32):** The `interactions:` per-action field described below is dropped from the schema. `makeWorkflowsConfig` has no unknown-keys rejection, so stale fields are silently ignored rather than rejected. See [Part 32 design](../../32-drop-static-overrides/design.md). The `event:` field is unchanged.
   - Use repo-relative paths in the link.
2. **Part 9** (`designs/workflows-module/parts/_completed/09-hook-invocation/design.md`):
   - Since this is in `_completed/`, do NOT rewrite the body. Add a short top-note like Part 4's:
     > **Deviation (Part 32):** The Layer 2 branch in `resolveTargetStatus` (the action YAML `interactions[interaction].status` override) is dropped — status resolution collapses to two layers (engine default → pre-hook `status` return). A runtime enum-membership check on the pre-hook `status` return fires inside `resolveTargetStatus` (after the pre-hook return, before step-4 writes) and throws `UserError(isReject: false)` on a non-`action_statuses` value; the wrapping endpoint's `runRoutine` classifies the throw as `{ status: 'error' }` (per [Part 29 § D5](../_completed/29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently)). The `action.interactions:` YAML override subsection and the three-layer status-resolution prose are superseded; the four-layer event-overrides merge is unchanged. See [Part 32 design](../../32-drop-static-overrides/design.md).
   - Use repo-relative paths in the links.
3. **Part 13** (`designs/workflows-module/parts/_completed/13-resolver-apis/design.md`):
   - Since this is in `_completed/`, do NOT rewrite the body. Add a short top-note like Part 4's:
     > **Deviation (Part 32):** Task 2's `interactions:` literal is no longer emitted in the per-action endpoint payload. The `event_overrides:` literal is unchanged. See [Part 32 design](../../32-drop-static-overrides/design.md).

Keep each edit tight. Do not duplicate Part 32's rationale — link to it.

## Acceptance Criteria

- Parts 4, 9, and 13 each carry a single top-of-file deviation note pointing at Part 32, scoped to `interactions:` (Part 9's note also covers the new runtime enum check). The body text of each part is otherwise untouched (verified by diff being purely additive).
- Part 9's deviation note documents the new runtime enum check inside `resolveTargetStatus` (fired on the pre-hook `status` return) and links to Part 29 § D5 for the `UserError(isReject: false)` classification.
- The deviation notes do not duplicate Part 32's rationale — they state the deviation and link.

## Files

- `designs/workflows-module/parts/_completed/04-workflow-config-schema/design.md` — modify — add deviation note at top scoped to `interactions:`.
- `designs/workflows-module/parts/_completed/09-hook-invocation/design.md` — modify — add deviation note at top covering the 2-layer collapse, the dropped `action.interactions:` override, and the new runtime enum check on the pre-hook `status` return.
- `designs/workflows-module/parts/_completed/13-resolver-apis/design.md` — modify — add deviation note at top scoped to `interactions:`.

## Notes

- Per `CLAUDE.md`: "Designs under `designs/_completed/` are already implemented — treat as read-only history. Add notes documenting deviations if helpful, but handle any changes in a new design/task." All three parts get notes, not rewrites.
- Do not move Part 32 itself into `_completed/` — only the user moves design folders.
