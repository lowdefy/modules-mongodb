# Consistency Review 1

## Summary

Scanned `design.md` and `review/review-1.md` for drift after the action-review edits. Six inconsistencies found — four auto-resolved against review-1's decisions, two surfaced to the user for a scope call. No untouched task / plan files exist yet to drift against.

## Files Reviewed

**Design:** `design.md`
**Reviews:** `review/review-1.md`

No supporting files, no `tasks/`, no `plan/`.

## Inconsistencies Found

### 1. Intro paragraph still framed hook content as "YAML files the hook block references"

**Type:** Review-vs-Design drift
**Source of truth:** review-1 finding #1 resolution — hook routines are inline `_ref`s into sibling routine arrays, not "YAML files referenced by the hook block" (which connotes Lowdefy Api descriptors).
**Files affected:** `design.md` line 5
**Resolution:** Rewrote the intro to "pre/post-hook routines (authored as inline `_ref`s into sibling YAML files)".

### 2. Intro still said the framework fix "obsoletes the part-02 channel"

**Type:** Review-vs-Design drift
**Source of truth:** review-1 finding #6 resolution — softened "retire / obsolete" framing to "audit" posture.
**Files affected:** `design.md` line 5
**Resolution:** Rewrote to "removing the original need for the part-02 channel — see [Implemented — manifest dynamic surface § Why this differs] for the audit posture". Aligns the intro's tone with the body section.

### 3. Out-of-scope entry called hook artifacts "YAMLs" and pointed at a no-longer-numbered verification step

**Type:** Review-vs-Design drift + stale reference
**Source of truth:** review-1 finding #1 (routine vs Api file terminology) + the verification block's restructure (steps were renumbered when "Per-status projection" was inserted as the first verification item).
**Files affected:** `design.md` line 201
**Resolution:** Rewrote to "The three hook routines (referenced inline via `_ref` from the action `hooks:` blocks) ship dormant; verification walk-through steps that observe pre/post-hook firing only pass once part 9 lands." Drops the specific "step 3" pointer that would have drifted again on any future verification edit.

### 4. Demo-flows bullet for `track-installation` was thinner than verification step 8

**Type:** Internal contradiction
**Source of truth:** Verification step 8 (the concrete click-through flow) sets the canonical walk-through; the Demo-flows bullet was a stale shorter version.
**Files affected:** `design.md` line 186
**Resolution:** Rewrote the Demo-flows bullet to summarize the click-through path (lead-view → child workflow-overview → task-edit) and reference the runtime-deps callout for the link-projection gating. Now aligned with verification step 8.

### 5. `g1.on_complete` callback declared but no routine file in "Files touched / added"

**Type:** Internal under-specification
**Source of truth:** Verification step 5 + runtime-only deps both reference the callback; "Files touched / added" didn't list a routine for it; "Hook routines" section hedged with "optionally pulled in via `_ref` from a sibling file under `hooks/` or `on-complete/`".
**Files affected:** `design.md` lines 158, 162–169
**Resolution:** Asked user. **Decision:** add `apps/demo/modules/workflows/workflow_config/onboarding/hooks/g1-on-complete.yaml` to the file list; reference it via `_ref` from `onboarding.yaml`'s `action_groups[g1].on_complete.routine`; tighten the "Hook routines" section to drop the "or `on-complete/`" hedge and point at the concrete file. Also notes the resolver-emitted `workflow-{type}-group-{id}-on-complete` Api id for completeness.

### 6. Table rows for `qualify` / `send-quote` used bare basenames for hook routines

**Type:** Stale-reference style — could read as Api ids rather than sibling-file basenames after review-1's terminology shift.
**Source of truth:** review-1 finding #1 — routines live in sibling files under `hooks/`.
**Files affected:** `design.md` lines 129–130
**Resolution:** Asked user. **Decision:** expand parentheticals to "routine in `hooks/qualify-pre-submit.yaml`" / "routines in `hooks/send-quote-pre-submit.yaml` and `hooks/send-quote-post-approve.yaml`". Slightly more verbose but removes any reader confusion between sibling-files and resolver-emitted Api ids.

## No Issues

- Proposed-change items 1–7 — numbered cleanly, no gaps or duplicates.
- "Implemented — manifest dynamic surface" — matches `modules/workflows/module.lowdefy.yaml` on disk.
- "Per-status projection fix" — shape matches review-1 finding #3 resolution.
- "Onboarding actions" worked example — `qualify` `status_map` block matches review-1 finding #2 + spec.
- "Runtime-only" deps — covers part 1, part 9, part 11, the engine-side `status_map → action_root` write (including `urlQuery` projection per finding #7), and the four shipped engine parts.
- "Closed during review" section — limited to the two original-review resolutions; review-1's seven resolutions are tracked in the review file itself, not duplicated here.

## Files Modified

- `designs/workflows-module/parts/20b-module-manifest-dynamic/design.md` — 6 targeted edits per the inconsistencies above.
