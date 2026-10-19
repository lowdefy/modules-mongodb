# Consistency Review 1

## Summary

Checked the full Part 40 file tree (design.md, open-questions.md, three review files, eight task files) against the chronological review decision register. Found 2 design-level inconsistencies — both auto-resolved. All other drift is confined to the band-1/band-2 **task files**, which review-3 and `open-questions.md` §6 already flag as known-stale and slated for regeneration via `/r:design-task` (the user's separate task-generation pass); those are catalogued here but intentionally left untouched.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** `open-questions.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01`–`08` (read for drift; not modified — out of scope this pass)

## Decision register (chronological)

- **R1 #1–#9** — all resolved in prose: `workflow_button_sources` global → build-time `_ref` enum; single `action_allowed` → per-verb; Part 34 adopted; modal open sequence spelled out; single shared modal instance; `Validate` scoped; (R1 #7 picked `Drawer`, **later overridden** by R2 #4 → `Modal`); `progress` fires `onProgress`; singular `action.link` → per-verb.
- **R2 #1** — per-verb link selection moved server-side (Part 42 D5). Resolved.
- **R2 #2** — `global.simple_action_buttons` dropped entirely; replaced by single doc-borne `allow_not_required` flag. Resolved.
- **R2 #3** — `action_allowed` written to root, copied into `surface.action_allowed` via `SetState`. Resolved (confirmed by R3 #4).
- **R2 #4** — in-modal timeline dropped (page-level only); container `Drawer` → `Modal`. Resolved.
- **R2 #5** — Part 24 renderer gains `state_path` var. Resolved.
- **R2 #6** — Rejected (mooted by #2).
- **R3 #1–#7** — all about **band-1 task files**: #1/#2/#3/#7 _Deferred to task regeneration_; #4 _Rejected_ (keep `surface.action_allowed`); #5/#6 _Resolved_. No design-prose action outstanding.

## Inconsistencies Found

### 1. Stale page-file glob in Current state

**Type:** Stale Reference
**Source of truth:** On-disk filenames (`modules/workflows/pages/workflow-action-{edit,view,review}.yaml`), confirmed by R3 "Verified accurate" (line 191) and design.md's own intro (line 5, the Part 38 task 18 rename).
**Files affected:** `design.md:45`
**Resolution:** Changed `modules/workflows/pages/simple-*.yaml` → `modules/workflows/pages/workflow-action-*.yaml`. The current-state bullets directly below already cite the correct `workflow-action-*.yaml` names, so this was an internal mismatch within the same section.

### 2. open-questions snapshot contradicts §1

**Type:** Stale Status / Internal Contradiction
**Source of truth:** `open-questions.md` §1 ("RESOLVED 2026-06-08") and review-3 #4 (resolution stands).
**Files affected:** `open-questions.md:3`
**Resolution:** Updated the status-snapshot line from "#1, #2, #4, #5 resolved; #6 rejected; #3 open" → "#1, #2, #3, #4, #5 resolved; #6 rejected (#3 resolved 2026-06-08 — see §1)."

## Deferred to the task-regeneration pass (not modified)

These are real drifts, but they live in task files the user is regenerating separately, and review-3 is their authoritative spec:

- `tasks/01-resolver-simple-action-buttons.md` — entirely implements the deleted `global.simple_action_buttons` model; should instead validate the optional boolean `allow_not_required` + carry it through `ACTION_FIELDS` (R3 #1).
- `tasks/03-check-action-surface.md` — three-way AND with `_global: simple_action_buttons` (should be two-term AND + doc-borne `allow_not_required` term for `not_required` only, R3 #2); events-timeline placed inside the surface (should be page-level, R3 #3); endpoint operator hedged though design fixed it (R3 #7).
- `tasks/04-rewrite-check-pages.md` — events-timeline inside surface (R3 #3); prescribes the `action_allowed` remap glue R3 #4 rejected framing-wise (placement itself is correct: `surface.action_allowed`).
- `tasks/07-concept-doc-reconciliation.md` — still references `global.simple_action_buttons` (lines 19/29).
- `tasks/tasks.md` — Task 1 row + Band-1 narrative still describe the `simple_action_buttons` global; missing the dedicated `allow_not_required` engine task that R3 #6 assigned to Band 1.

## Open items (pending work, not consistency drift — left for the user)

- **`open-questions.md` §4** — D5's `actions-on-entity` wiring fires the modal for _every_ clicked action; it needs a `kind: simple` branch (navigate otherwise). Flagged as a discovered gap awaiting response-projection verification before amending D5 — a substantive design change, not a consistency fix.
- **`open-questions.md` §2/§3/§5/§6** — cross-design (Part 46) reconciliation, the parked `allow_not_required` form-page display-channel call, the recorded `EventsTimeline.onActionClick` payload mismatch, and housekeeping. All correctly tracked; no design-prose contradiction.

## No Issues

- No stale `global.simple_action_buttons` / `global.workflow_button_sources` references remain in `design.md` (R1 #1 / R2 #2 fully propagated; residue is task-file-only).
- Container is consistently `Modal` across `design.md` D5 (R1 #7's `Drawer` correctly superseded by R2 #4).
- No stale "Part 41" timeline references in `design.md`/`open-questions.md` (all renumbered to Part 42, shipped).
- Per-verb `action_allowed` / `surface.action_allowed` placement is consistent across D1/D2/D5/D6 and `open-questions.md` §1 (R2 #3 / R3 #4).
- Navigation prose consistently cites the server-resolved single `action.link` (Part 42 D5), with the payload caveat recorded.
