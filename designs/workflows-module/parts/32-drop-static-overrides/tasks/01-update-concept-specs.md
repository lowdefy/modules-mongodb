# Task 1: Update concept specs to drop Layer 2

## Context

The concept specs are the canonical description of the action-YAML surface and the submit-pipeline merge layers. They currently describe a three-layer status resolution and a four-layer event-overrides merge, and document `action.interactions:` and `action.event:` as build-time override blocks. Part 32 collapses both — pre-hook becomes the only override channel.

Affected files (from a grep across the concept spec):

- `designs/workflows-module-concept/submit-pipeline/spec.md`
  - Line ~16: "Pre-hook for interaction (if declared) — returns optional actions[] + event_overrides + form_overrides" (unchanged — still applies)
  - Line ~63: `event_overrides:` "build-time from action.event[interaction]" — drop that property from the per-action endpoint shape example
  - Line ~79: `hooks` and `event_overrides` keying paragraph — drop the `event_overrides[interaction]` discussion (or rephrase so only `hooks[interaction]` survives)
  - Line ~103: "2. Action YAML `interactions:` block — optional, build-time-baked..." — drop this list entry; renumber the layers
  - Line ~116: `#### Action YAML `interactions:` block` — drop the whole subsection
  - Lines ~121–130: the example `interactions:` YAML block — drop it
  - Lines ~192–193: pre-hook `event_overrides` return — adjust the comment "merged over action.event[interaction] over engine defaults" → "merged over engine defaults"
  - Line ~263: "Action YAML `event.{interaction}.{type|display|metadata}`..." — drop this list entry
  - Line ~264: renumber the pre-hook layer (was 3, becomes 2)
  - Line ~269: the example `event:` YAML block — drop it
- `designs/workflows-module-concept/action-authoring/spec.md`
  - Line ~396: "the action's `hooks:`, `event:`, and `interactions:` blocks are baked in as build-time literals" → "the action's `hooks:` block is baked in as a build-time literal"
  - Line ~501 (resolver table row for `makeWorkflowApis`): drop "`event_overrides:` / `interactions:`" from the "bakes in" parenthetical
  - Line ~510: same edit as 396
  - Line ~535: the `interactions: { submit_edit: { status: <override-or-null> }, ... }` line — drop from the example payload shape

Use the grep starting points above as anchors — the exact line numbers will drift as you edit, so search for the strings each time.

## Task

Edit the two concept specs to remove every reference to the action YAML `interactions:` and `event:` blocks as engine-runtime override channels:

1. **In `submit-pipeline/spec.md`:**
   - In the per-action endpoint shape example, drop the `event_overrides:` line.
   - In the "Status resolution" section: drop the layer 2 list entry and the `#### Action YAML interactions: block` subsection (including its YAML example). The list collapses to two layers — engine default, then pre-hook return.
   - In the "Event override paths" / "Default log event" section: drop the layer-2 list entry citing `action.event[interaction]` and its YAML example. Renumber the pre-hook layer (was 3, becomes 2). Re-read the surrounding prose and make it consistent with a two-layer merge after the engine default + runtime `comment` are folded together.
   - In the `event_overrides:` schema description for pre-hook return (lines ~192–193), trim the inline comment so it doesn't reference `action.event[interaction]` any more.
   - In the `hooks` and `event_overrides` keying paragraph (line ~79), drop the discussion of `event_overrides[interaction]` resolution; only `hooks[interaction]` survives at build time.
2. **In `action-authoring/spec.md`:**
   - At the two prose mentions of "the action's `hooks:`, `event:`, and `interactions:` blocks are baked in as build-time literals", drop `event:` and `interactions:` so only `hooks:` remains.
   - In the resolver table row for `makeWorkflowApis`, drop the "bakes in `hooks:` / `event_overrides:` / `interactions:`" mention of `event_overrides:` and `interactions:`. The `hooks:` mention stays.
   - In the `update-action-{action_type}` example payload, drop the `interactions: { ... }` line.
   - **Also drop** the `interactions:` and `event:` rows from the per-action field list (search for the table or bullet list that enumerates action YAML top-level fields; the design's § Why this is being considered notes both are removed from the field list).

Be terse. The design document already articulates the rationale at length — the spec edit is purely removal and renumbering. Do not add a "Layer 2 removed" note; the merged layers should read as if Layer 2 never existed. (Part 32 is independent of any reader's prior knowledge of Layer 2.)

## Acceptance Criteria

- `grep -n "interactions:" designs/workflows-module-concept/submit-pipeline/spec.md designs/workflows-module-concept/action-authoring/spec.md` returns no matches that refer to the action YAML override block. (Matches that refer to `hooks.{interaction}` keying or `interactions[interaction].status` inside the schema's pre-hook return are fine — but in fact the design drops the latter; only the former should remain.)
- `grep -n "action.event\|action.interactions" designs/workflows-module-concept/submit-pipeline/spec.md designs/workflows-module-concept/action-authoring/spec.md` returns no matches.
- The status-resolution section in `submit-pipeline/spec.md` describes exactly two layers: engine default + pre-hook return.
- The event-overrides section in `submit-pipeline/spec.md` describes three layers post-fold: engine default (with runtime `comment` folded in by `buildDefaultLogEventPayload`) + pre-hook return.
- The per-action field list in `action-authoring/spec.md` does not list `interactions:` or `event:`.

## Files

- `designs/workflows-module-concept/submit-pipeline/spec.md` — modify — drop Layer 2 prose, examples, and renumber merge layers.
- `designs/workflows-module-concept/action-authoring/spec.md` — modify — drop `event:` / `interactions:` from prose, resolver table, payload example, and field list.

## Notes

These specs are already labelled "committed" in the design's § Parts touched table — the edits unwind the committed text without leaving migration notes (no real-world readers depend on the dropped text).
