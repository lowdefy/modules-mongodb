# Task 2: Reconcile neighbour part designs with the status Layer-2 collapse

## Context

Three other part design docs cite Layer 2 by name and need their prose updated so the project's design-as-source-of-truth invariant holds. Per Part 32's § Parts touched table:

- **Part 4** (`_completed/04-workflow-config-schema/design.md`) — shipped. Drops `interactions:` from the per-action schema. No dedicated rejecting validator (the schema validator has no unknown-keys rejection). Add a short note documenting the deviation (Part 32 amends a completed design — per `CLAUDE.md` the convention is to leave a note rather than rewrite history).
- **Part 9** (`09-hook-invocation/design.md`) — in progress. Drops the Layer 2 branch in `resolveTargetStatus`. Adds pre-hook `status` enum-membership runtime check. Three-layer status resolution becomes two-layer. **Does not** touch the event-overrides merge (still four-layer).
- **Part 13** (`_completed/13-resolver-apis/design.md`) — tasks 1–2 shipped. Stop emitting the `interactions:` literal into the per-action endpoint payload. **Does not** touch the `event_overrides:` literal.

The `event:` block stays as a build-time override channel — out of scope for Part 32, tracked under [Part 33](../../33-comment-rendering/design.md). Do not touch any prose describing the event-overrides merge or the `event_overrides:` endpoint literal.

Read each file before editing — the prose styles differ.

## Task

For each of the three parts, update the design doc so a reader landing on it cold gets a coherent description that matches the post-Part-32 world.

1. **Part 4** (`designs/workflows-module/parts/_completed/04-workflow-config-schema/design.md`):
   - Since this is in `_completed/`, do NOT rewrite the body. Add a short note at the top (under the title, before the first heading) along the lines of:
     > **Deviation (Part 32):** The `interactions:` per-action field described below is dropped from the schema. `makeWorkflowsConfig` has no unknown-keys rejection, so stale fields are silently ignored rather than rejected. See [Part 32 design](../../32-drop-static-overrides/design.md). The `event:` field is unchanged.
   - Use repo-relative paths in the link.
2. **Part 9** (`designs/workflows-module/parts/09-hook-invocation/design.md`):
   - This part is "in progress" per Part 32's table, so edit the body directly.
   - Rewrite the status-resolution section so it describes two layers (engine default → pre-hook return). The current text describes three layers — search for "three-layer status" and "Layer 2" / "interactions:" references in the status-resolution context.
   - Document the new pre-hook `status` enum-membership runtime check: where it fires (after the pre-hook return, before step-4 writes), what it throws (`UserError` with `isReject: false`), and that the wrapping endpoint's `runRoutine` classifies the throw as `{ status: 'error' }`. Cite Part 29 § D5 as Part 32's design does.
   - Drop the `### action.interactions: YAML override` subsection (line ~104 per current grep).
   - The opening abstract (line ~7) mentions "three-layer status resolution (engine default → action YAML `interactions:` → pre-hook `status`)" — trim to two-layer.
   - **Do not touch** any prose describing the four-layer event-overrides merge or the `event_overrides:` channel — that stays.
3. **Part 13** (`designs/workflows-module/parts/_completed/13-resolver-apis/design.md`):
   - Since this is in `_completed/`, do NOT rewrite the body. Add a short top-note like Part 4's:
     > **Deviation (Part 32):** Task 2's `interactions:` literal is no longer emitted in the per-action endpoint payload. The `event_overrides:` literal is unchanged. See [Part 32 design](../../32-drop-static-overrides/design.md).

Keep each edit tight. Do not duplicate Part 32's rationale — link to it.

## Acceptance Criteria

- Part 4 and Part 13 each carry a single top-of-file deviation note pointing at Part 32, scoped to `interactions:`. The body text is otherwise untouched (verified by diff being purely additive).
- Part 9's body no longer describes a three-layer status resolution. Event-overrides merge prose is unchanged.
- Part 9 documents the new runtime enum check inside `resolveTargetStatus` (fired on the pre-hook `status` return) and links to Part 29 § D5 for the `UserError(isReject: false)` classification.
- `grep -n "interactions:" designs/workflows-module/parts/09-hook-invocation/design.md` returns no matches that reference the action-YAML override block (matches about `hooks.{interaction}` keying are fine — but the part's three-layer status-resolution prose should not survive).
- `grep -nri "Layer 2" designs/workflows-module/parts/_completed/04-workflow-config-schema designs/workflows-module/parts/09-hook-invocation designs/workflows-module/parts/_completed/13-resolver-apis` returns no matches inside descriptive prose claiming a status Layer 2 still exists. (Event-overrides Layer 2 references stay — that channel is unchanged.)

## Files

- `designs/workflows-module/parts/_completed/04-workflow-config-schema/design.md` — modify — add deviation note at top scoped to `interactions:`.
- `designs/workflows-module/parts/09-hook-invocation/design.md` — modify — collapse status layers, drop `action.interactions:` subsection, document runtime enum check. Leave event-overrides merge alone.
- `designs/workflows-module/parts/_completed/13-resolver-apis/design.md` — modify — add deviation note at top scoped to `interactions:`.

## Notes

- Per `CLAUDE.md`: "Designs under `designs/_completed/` are already implemented — treat as read-only history. Add notes documenting deviations if helpful, but handle any changes in a new design/task." That's why parts 4 and 13 get notes, not rewrites.
- Do not move Part 32 itself into `_completed/` — only the user moves design folders.
