# Task 5: Update concept-design rationale and the follow-on parts table

## Context

`designs/` is the source of truth for rationale — why the module is built this way. Part 36 introduces `buttons.extra` and reframes the "fixed names" invariant (the engine's _signal vocabulary_ is locked, not the bar's _composition_). Three concept/tracker design files need updating to reflect this and to record the part in the workflows-module follow-on table.

These are design-doc prose edits — no code. They keep the rationale consistent with the shipped behaviour.

## Task

1. **`designs/workflows-module-concept/action-authoring/design.md`** — Decision 8 § "Per-page chrome: `formHeader`, `formFooter`, `requests`, `modals`" (~line 792):
   - Add `buttons.extra: [...]` to the per-page chrome list.
   - Document the button-opens-modal pattern: modal block declared in `formFooter`, opened via `CallMethod` (`toggleOpen` for `Modal`, `open` for `ConfirmModal`).
   - Add a short worked-example YAML shape mirroring the design's "YAML shape" section (the extra button + a `formFooter` modal), shortened.
   - **Correct the stale `modals.{name}.{field}:` paragraph** (~lines 805/812 — a never-wired config-knob shape) by removing it. The shipped modal-override knobs live under `buttons.{signal}.modal.{title,content}` for `submit` / `not_required` (edit), `approve` (review), and `resolve_error` (error); the request-changes modal is mandatory and carries no knobs (`request_changes` exposes only `.visible` / `.disabled`).
   - Update the error-pages subsection (~line 849) to mention `buttons.extra` as the multi-button path instead of `formFooter`.

2. **`designs/workflows-module-concept/ui/design.md`** — Decision 4 "Why fixed names" subsection (already on the signal model + five-verb event vocabulary post-Part 39):
   - Replace the "additional buttons via `formFooter:`" paragraph with: additional buttons via `buttons.extra:`, rendered alongside the template-shipped signal buttons in the same `floating-actions` bar; modals declared in `pages.{verb}.formFooter:` and opened via `CallMethod` from button `onClick`.
   - Update the chrome-blocks table: add `buttons.extra` as a slot, and fix the stale `modals` row — either remove it (the never-wired `modals.{name}.{field}:` shape isn't shipped) or replace it with a note that modal overrides live under `buttons.{signal}.modal.{title,content}` on `submit` / `not_required` / `approve` / `resolve_error` (the `request_changes` comment modal is mandatory and has no knobs).
   - Add a sentence reframing the invariant: the engine's _signal vocabulary_ is locked, not the bar's _composition_. Extra buttons that carry no recognised signal don't break the engine contract, don't shadow any signal's event handler, and don't change the v0 port.

3. **`designs/workflows-module/design.md`** (the workflows-module implementation tracker):
   - Add a **Part 36 row** to the follow-on parts table with a dependency note: depends on shipped Parts 16, 4, 39, 46/48, and sequences **after** Parts 56 + 57 (which reshape the templates and entity config it builds on).
   - Add a one-line entry under "Follow-on parts" describing why it was spun out (a small authoring extension orthogonal to active parts).

## Acceptance Criteria

- action-authoring Decision 8 lists `buttons.extra` in the per-page chrome, documents the button→modal pattern, removes the stale `modals.{name}.{field}` paragraph, and updates the error-pages subsection.
- ui Decision 4 replaces the `formFooter` additional-buttons paragraph, updates the chrome-blocks table, fixes the stale `modals` row, and reframes the locked-signal invariant.
- workflows-module/design.md has a Part 36 follow-on row with the dependency/sequencing note and a one-line spin-out rationale.
- No code or `docs/` changes in this task.

## Files

- `designs/workflows-module-concept/action-authoring/design.md` — modify — Decision 8 per-page chrome + stale-modals correction + error-pages subsection.
- `designs/workflows-module-concept/ui/design.md` — modify — Decision 4 "Why fixed names" + chrome-blocks table.
- `designs/workflows-module/design.md` — modify — Part 36 follow-on table row + one-line entry.

## Notes

- Before editing, read the current text at the referenced line ranges — they may have drifted from the design's line citations. Anchor on the section headings ("Per-page chrome", "Why fixed names", the follow-on parts table) rather than exact line numbers.
- Keep edits to rationale only; observable-behaviour documentation lives in `docs/` (Task 4).
