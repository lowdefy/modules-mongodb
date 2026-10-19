# Task 8: Workflows `concepts/` (Phase 3b)

## Context

The best explanation of workflows — signals vs. status, the FSM, the three action kinds, hooks, groups, the worked onboarding example — already exists, well-written, in `designs/workflows-module-concept/` (sub-designs: `action-authoring/`, `action-groups/`, `engine/`, `state-machine/`, `submit-pipeline/`, `ui/`, `module-surface/`, `call-api/`). But it's build-time source-of-truth, mixed with implementation-part tracking and review critiques, and consumers never see it.

This task migrates the **explanation** content into `docs/workflows/concepts/`, rewritten for a consumer audience. The boundary (design decision 3): docs explain _how it behaves and how to author it_; designs keep _why it was built this way_. So **drop**: implementation-part numbering, review findings, and "why we chose X over Y" rationale. The design folders stay as the historical record of _why_.

## Task

Author seven `concepts/*.md` files, each `type: concept`, `module: workflows`, with `concepts:` tags, mapped to sources:

| Target                            | Source                                                                   | Notes                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `concepts/mental-model.md`        | `designs/workflows-module-concept/design.md` (worked onboarding example) | The "start here" orientation page.                                                                                  |
| `concepts/signals-vs-status.md`   | `.../state-machine/` (FSM, signals, button bars)                         | The **#1 confusion point** — give it dedicated, clear treatment. Cross-link `reference/fsm-and-signals.md`.         |
| `concepts/action-kinds.md`        | `.../action-authoring/`                                                  | The three kinds: form / check / tracker.                                                                            |
| `concepts/groups-and-blocking.md` | `.../action-groups/`                                                     | Rollup status, `blocked_by`, and the **conditional-action anti-pattern** — call it out explicitly so it's findable. |
| `concepts/access.md`              | `.../action-authoring/` access model                                     | Per-app / per-verb access, and the **review-verb signal flip**.                                                     |
| `concepts/hooks.md`               | `.../submit-pipeline/`                                                   | pre/post hooks, out-of-band writes, failure modes.                                                                  |
| `concepts/events.md`              | `.../engine/` event logging                                              | Link to `docs/shared/event-display.md` rather than re-explaining event display.                                     |

Rewrite each for a consumer: explanatory voice, "how it behaves and how you author against it", concrete examples. One concept per file.

The complexity hotspots the design flags must get **dedicated, findable** treatment (not buried): signals-vs-status, the conditional-action `blocked_by` anti-pattern, per-app/per-verb access, tracker `start_link` wiring, instanced-action form-data paths, and `allow_not_required`. Place each in its most natural concept file and make sure a reader scanning headings can find it.

## Acceptance Criteria

- Seven `docs/workflows/concepts/*.md` files exist with `type: concept` front-matter and `concepts:` tags.
- Content is rewritten for consumers — no implementation-part numbers, no review findings, no "why we chose X over Y" rationale.
- `signals-vs-status.md` clearly resolves the signal-vs-status confusion and cross-links `reference/fsm-and-signals.md`.
- `groups-and-blocking.md` explicitly names the conditional-action `blocked_by` anti-pattern.
- `access.md` covers per-app/per-verb access and the review-verb signal flip.
- `events.md` links to `docs/shared/event-display.md` instead of duplicating it.
- The flagged hotspots (signals-vs-status, `blocked_by` anti-pattern, per-app/per-verb access, tracker `start_link`, instanced-action form-data paths, `allow_not_required`) each appear under a findable heading.
- All internal links resolve; `pnpm docs:check` passes.

## Files

- `docs/workflows/concepts/mental-model.md` — create.
- `docs/workflows/concepts/signals-vs-status.md` — create.
- `docs/workflows/concepts/action-kinds.md` — create.
- `docs/workflows/concepts/groups-and-blocking.md` — create.
- `docs/workflows/concepts/access.md` — create.
- `docs/workflows/concepts/hooks.md` — create.
- `docs/workflows/concepts/events.md` — create.

## Notes

- This is **migration + rewrite, not invention** — the explanations exist; the work is lifting them out of the design folders and stripping the build-time framing.
- Leave `designs/workflows-module-concept/` in place — it remains the historical "why" record. Do not move or delete it.
- `tracker start_link`, `instanced-action form-data paths`, and `allow_not_required` may map most naturally to `action-kinds.md` or `groups-and-blocking.md` — place them where they read best, but ensure each is present.
