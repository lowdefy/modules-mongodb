# Consistency Review 1

## Summary

Scanned Part 25's design tree after the review-1 action-review pass. Nine review-1 findings are all annotated and propagated into design.md. Two minor drift fixes auto-applied: a stale hedge in the verification block and a stale rationale phrase in an open question. No design-vs-task or design-vs-plan drift (no task or plan files exist yet).

## Files Reviewed

- **Design:** [design.md](../design.md)
- **Reviews:** [review/review-1.md](review-1.md)
- **Supporting / tasks / plans:** none exist yet.

## Inconsistencies Found

### 1. Stale "if we settle on…" hedge in the Api unit-test bullet

**Type:** Internal Contradiction / stale deliberation language
**Source of truth:** Return-shape paragraph at design.md:70 — design has settled on `{ workflow: null, group: null, actions: [] }` collapse. Aligns with review-1 finding 3's resolution.
**Files affected:** [design.md:138](../design.md) (verification → unit tests, first bullet).
**Resolution:** Auto-resolved. Rewrote the bullet as a single forward-going statement: "When access filtering removes every action in the requested group, returns `{ workflow: null, group: null, actions: [] }` (the access-vs-existence collapse rule under 'Return shape' above)." No mention of an "or, if we settle on…" branch.

### 2. Stale "consistency with `get-workflow-overview`" rationale in open question

**Type:** Internal Contradiction
**Source of truth:** Return-shape paragraph at design.md:70 — calls out that this Api adds `group: null` to the collapse as a deliberate divergence from `get-workflow-overview`.
**Files affected:** [design.md:159](../design.md) (Open questions → unknown-group-id).
**Resolution:** Auto-resolved. Changed the rationale from "Stick with collapse for v1 consistency with `get-workflow-overview`" to "Stick with collapse for v1 — same security-driven access-vs-existence rule the Return-shape section commits to." Decision unchanged; framing aligned with the divergence already documented.

## No Issues

The following were checked and are consistent:

- **review-1 finding 1** (drop `title` from Api response) — design.md:31, 56, 63 all reflect the client-side `_global: workflows_config` resolution. Title absent from return-shape block.
- **review-1 finding 2** (line 31 phrasing) — fixed in place.
- **review-1 finding 3** (access-vs-existence collapse wording) — design.md:70 holds the tightened phrasing.
- **review-1 finding 4** (`_module.pageId` in `_js.params` precedent + fallback) — design.md:96 documents both.
- **review-1 finding 5** (every-group link accepted with edges) — "Known edges with the 'always link' rule" subsection at design.md:104-107.
- **review-1 finding 6** (tracker rule) — design.md:111 covers it.
- **review-1 finding 7** (manifest reframing) — design.md:16, 72-81, 133, 166 all attribute the manifest edit to this part with Part 20 reconciling later.
- **review-1 finding 8** (title resolution smoke) — design.md:145 adds the bullet.
- **review-1 finding 9** (ActionSteps README) — rejected; no design surface to maintain.
- **Tracker rule scope.** design.md:39 (tracker actions on the `group-overview` page → `status_map` links to child workflows) and design.md:111 (tracker rule on the `actions-on-entity` widget) describe two different surfaces. Not in tension.
- **Empty-group open question vs. progress-bar spec.** design.md:32 commits to rendering empty groups; design.md:158 leans "render, don't redirect" and defers final ratification. Tension is intentional and called out.
