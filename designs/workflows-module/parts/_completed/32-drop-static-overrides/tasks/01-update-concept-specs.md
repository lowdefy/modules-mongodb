# Task 1: Update concept specs to drop static `interactions:` status override

## Context

The concept specs are the canonical description of the action-YAML surface and the submit-pipeline merge layers. They currently describe a three-layer status resolution and document `action.interactions:` as a build-time status-override block. Part 32 collapses status resolution to two layers — pre-hook becomes the only status-override channel.

The `event:` block stays as a build-time override (out of scope for Part 32; tracked under [Part 33](../../../_next/33-comment-rendering/design.md)). Do not touch the four-layer event-override prose or the `action.event:` documentation.

Affected files (from a grep across the concept spec):

- `designs/workflows-module-concept/submit-pipeline/spec.md`
  - Line ~103: "2. Action YAML `interactions:` block — optional, build-time-baked..." — drop this list entry; renumber the layers
  - Line ~116: `#### Action YAML `interactions:` block` — drop the whole subsection
  - Lines ~121–130: the example `interactions:` YAML block — drop it
- `designs/workflows-module-concept/action-authoring/spec.md`
  - Line ~396: "the action's `hooks:`, `event:`, and `interactions:` blocks are baked in as build-time literals" → "the action's `hooks:` and `event:` blocks are baked in as build-time literals"
  - Line ~501 (resolver table row for `makeWorkflowApis`): drop "`interactions:`" from the "bakes in" parenthetical; keep `hooks:` and `event_overrides:`
  - Line ~510: same edit as 396
  - Line ~535: the `interactions: { submit_edit: { status: <override-or-null> }, ... }` line — drop from the example payload shape
  - Per-action field list: drop the `interactions:` row; **keep** the `event:` row

Use the grep starting points above as anchors — the exact line numbers will drift as you edit, so search for the strings each time.

## Task

Edit the two concept specs to remove every reference to the action YAML `interactions:` block as an engine-runtime override channel. The `event:` block stays untouched in both specs.

1. **In `submit-pipeline/spec.md`:**
   - In the "Status resolution" section: drop the layer 2 list entry and the `#### Action YAML interactions: block` subsection (including its YAML example). The list collapses to two layers — engine default, then pre-hook return.
   - Leave the "Event override paths" / "Default log event" section alone — Part 32 no longer touches the event merge.
2. **In `action-authoring/spec.md`:**
   - At the two prose mentions of "the action's `hooks:`, `event:`, and `interactions:` blocks are baked in as build-time literals", drop `interactions:` so `hooks:` and `event:` remain.
   - In the resolver table row for `makeWorkflowApis`, drop the `interactions:` mention. The `hooks:` and `event_overrides:` mentions stay.
   - In the `update-action-{action_type}` example payload, drop the `interactions: { ... }` line. Keep the `event_overrides: { ... }` line.
   - **Also drop** the `interactions:` row from the per-action field list (search for the table or bullet list that enumerates action YAML top-level fields). Keep the `event:` row.

Be terse. The design document already articulates the rationale at length — the spec edit is purely removal and renumbering. Do not add a "Layer 2 removed" note; the merged layers should read as if status Layer 2 never existed.

## Acceptance Criteria

- `grep -n "action.interactions\b" designs/workflows-module-concept/submit-pipeline/spec.md designs/workflows-module-concept/action-authoring/spec.md` returns no matches. (Matches that refer to `hooks.{interaction}` keying are fine, and `action.event` matches stay since the event channel is out of scope.)
- The status-resolution section in `submit-pipeline/spec.md` describes exactly two layers: engine default + pre-hook return.
- The event-overrides section in `submit-pipeline/spec.md` is **unchanged** — still describes the existing four-layer merge.
- The per-action field list in `action-authoring/spec.md` does not list `interactions:` but still lists `event:`.

## Files

- `designs/workflows-module-concept/submit-pipeline/spec.md` — modify — drop `interactions:` Layer 2 prose, example, and renumber status-resolution layers. Do not touch the event-override section.
- `designs/workflows-module-concept/action-authoring/spec.md` — modify — drop `interactions:` from prose, resolver table, payload example, and field list. Leave `event:` mentions intact.

## Notes

These specs are already labelled "committed" in the design's § Parts touched table — the edits unwind the committed text without leaving migration notes (no real-world readers depend on the dropped text).
