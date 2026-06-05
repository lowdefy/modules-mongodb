# Task 5: Concept-doc reconciliation + roadmap registration

## Context

Two concept docs describe the per-page chrome surface and must learn about `buttons.extra`; both also carry a **stale `modals` paragraph/row** describing a never-wired `modals.{name}.{field}:` config-knob shape — the actual shipped modal-override knobs live under `buttons.{signal}.modal.{title,content}` for `submit` / `not_required` (edit), `approve` (review), and `resolve_error` (error); the request-changes modal is mandatory and carries **no** knobs (`request_changes` exposes only `.visible` / `.disabled`, per `review.yaml.njk`). The parent roadmap (`designs/workflows-module/design.md`) has no Part 36 row yet.

Markdown-only; no code dependency. These sections are also touched by Part 39 task 8 (doc reconciliation to the signal model). If Part 39's doc task has landed, apply these edits on top of its text; if not, apply to current text and flag the overlap in the PR.

## Task

### 1. `designs/workflows-module-concept/action-authoring/design.md` — Decision 8 "Per-page chrome" (§ around line 774–794)

- Add `buttons.extra: [...]` to the per-page chrome list: an array of author-composed `Button` blocks the verb templates concatenate into the `floating-actions` bar after the template-shipped signal buttons. Offered on `edit` / `review` / `error` (not `view` — deferred). Entries carry their own `events.onClick`; the engine's signal vocabulary stays locked.
- Document the button-opens-modal pattern: modal block declared in `pages.{verb}.formFooter:` (overlays at render time regardless of position), opened via `CallMethod { blockId, method: toggleOpen }` from the extra's `onClick` (`method: open` is `ConfirmModal`-only).
- Add a shortened worked-example YAML shape mirroring the part design's "YAML shape" section (one modal-opener extra + one link extra is enough).
- **Remove the stale `modals` paragraph** (currently line ~787 in the chrome YAML shape and the `modals.{name}.{field}:` bullet at ~794) — the never-wired shape. Where modal overrides are mentioned, state the `.modal.{title,content}` knob lives under `buttons.{signal}.modal` for `submit` / `not_required` / `approve` / `resolve_error`, and that the request-changes modal is mandatory with no knobs (`request_changes` exposes only `.visible` / `.disabled`).
- Update the error-pages "Buttons" subsection (~line 835): replace "Multi-button error pages can use `formFooter:` to add additional buttons" with `buttons.extra` as the multi-button path.

### 2. `designs/workflows-module-concept/ui/design.md` — Decision 4 "Page-event vocabulary and per-page chrome" (§ around lines 281–358)

- **Chrome-blocks table** (~line 328–332): add a `buttons.extra` row (author-supplied buttons appended to the floating bar). Fix the stale `modals` row: either remove it (the `modals.{name}.{field}:` shape was never wired) or replace with a note that modal overrides live under `buttons.{signal}.modal.{title,content}` on `submit` / `not_required` / `approve` / `resolve_error` (the `request_changes` comment modal is mandatory and has no knobs).
- **"Why fixed names"** (~line 350–358): replace the "additional buttons via `formFooter:`" guidance with: additional buttons via `buttons.extra:`, rendered alongside the template-shipped signal buttons in the same `floating-actions` bar; modals declared in `pages.{verb}.formFooter:` and opened via `CallMethod` from button `onClick`. Add a sentence reframing the invariant: **the engine's signal vocabulary is locked, not the bar's composition** — extras never carry a recognised signal slot of their own, and if an author routes an extra through the per-action endpoint with a recognised signal, the engine processes it the same as from a template button (payload determines behaviour, not caller).
- Also update the error-page button mention at ~line 110 if it still says "Additional buttons can be added via `formFooter:`" — point it at `buttons.extra`.

### 3. `designs/workflows-module/design.md` (parent roadmap)

- Add a Part 36 row to the follow-on parts table (the parts table around the top sections / `### Follow-on parts` at ~line 50).
- Add a one-line entry under `## Follow-on parts` (~line 115, alongside the Part 28 entry style) describing why it was spun out: an orthogonal authoring extension spanning three shipped templates + the validator that would dilute any active part's review. Note dependencies: **Parts 16 (page templates), 4 (config resolver), and 39 (signal-model templates)** — the part is designed against the post-Part-39 template state, which is design-only at the time of writing.

## Acceptance Criteria

- `buttons.extra` appears in both concept docs with the append-after-signal-buttons semantics and the verb scope (`edit`/`review`/`error`, view deferred).
- No remaining reference to the never-wired `modals.{name}.{field}:` shape in either doc; modal-override knobs correctly attributed to `buttons.{signal}.modal.{title,content}` on `submit` / `not_required` / `approve` / `resolve_error`, with `request_changes` documented as `.visible` / `.disabled` only.
- The locked-invariant reframing (vocabulary locked, composition open) is present in ui Decision 4 "Why fixed names".
- Part 36 is registered in the parent roadmap with its dependency note.
- All edited relative links resolve.

## Files

- `designs/workflows-module-concept/action-authoring/design.md` — modify — Decision 8 chrome list, modal pattern, stale `modals` removal, error-pages buttons subsection.
- `designs/workflows-module-concept/ui/design.md` — modify — Decision 4 chrome table + "Why fixed names" + error-page button mention.
- `designs/workflows-module/design.md` — modify — Part 36 roadmap row + follow-on entry.

## Notes

- Line numbers are anchors as of writing; Part 39 task 8 edits the same regions. Locate sections by heading, not line.
- Do not touch anything under `designs/_completed/` or the part's own `review/` folder.
