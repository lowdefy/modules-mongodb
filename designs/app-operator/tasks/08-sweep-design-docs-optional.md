# Task 8 (optional / deferrable): Standardise "slug" prose across in-flight workflows design docs

## Status: optional

This task is **not required for the code migration** and does not gate the PR (see [review-2 finding #10](../review/review-2.md)). It is pure documentation churn over `designs/workflows-module*/**` — designs that are themselves in active flux. Two acceptable choices:

- **Defer:** drop it from this PR and let each workflows design adopt "slug" as it's next touched. Lowest churn-on-churn risk.
- **Do it now:** if the team wants one canonical term immediately (the design's "one canonical term" decision), run the sweep below as a separate commit in the same PR.

If deferring, still do step 3 (remove the obsolete forward note) — that one line is worth fixing regardless, since it now points at a shipped capability.

## Context

The workflows design corpus was written when the module's var was `app_name`. With `app_name` removed in Tasks 2–4, the prose future implementers read should use the new vocabulary. `_completed/`, `review/`, and `tasks/` are excluded (read-only history / out of scope).

## Task

1. **Find affected files** (non-review, non-task, outside `_completed/`):

   ```bash
   grep -rln "app_name" designs/workflows-module/ designs/workflows-module-concept/ \
     | grep -v "/_completed/" | grep -v "/review/" | grep -v "/reviews/" | grep -v "/tasks/"
   ```

   Re-run to get the current set — the corpus has changed since this was drafted; do not trust a frozen file list.

2. **Rename in each file**, three categories:
   - **Code snippets:** `_module.var: app_name` → `_app: slug` (or `_build.app: slug` if the snippet shows a `_build.*` context); drop `app_name:` from example `vars:` blocks.
   - **Slug-position placeholders:** `access.{app_name}` → `access.{slug}`, `status_map.{stage}.{app_name}` → `status_map.{stage}.{slug}`, `display.{app_name}` → `display.{slug}`, `apps.{app_name}.roles` → `apps.{slug}.roles`. **Do not change `created.app_name`** — stored field name.
   - **Narrative:** "the host app's `app_name`" → "the host app's slug"; "match `vars.app_name`" → "match the app slug".

3. **Remove the obsolete forward note.** In `designs/workflows-module/parts/30-status-map-rendering/design.md` (~line 144), replace the "Lowdefy is adding an `_app: slug` operator…" paragraph with a back-reference: "The slug originates from the app's root `slug:` in `lowdefy.yaml`; see [`designs/app-operator/`](../../../app-operator/design.md)." Update the link to `_completed/app-operator/` once this design is moved there.

4. **Verify:** re-run the step-1 grep; remaining hits should only be stored field names (`created.app_name`).

## Acceptance Criteria

- (If done) affected in-flight files use `slug` / `_app: slug` for values and `{slug}` for placeholders; stored field names untouched; `_completed/`/`review/`/`tasks/` unmodified.
- (Always) the forward note in `parts/30-status-map-rendering/design.md` is replaced with a back-reference to `designs/app-operator/`.

## Files

- `designs/workflows-module/parts/30-status-map-rendering/design.md` — modify (back-reference; always).
- Other `designs/workflows-module*/**` `design.md`/`spec.md` per the grep — modify (only if doing the full sweep).

## Notes

- A naive global find/replace risks turning `created.app_name` → `created.slug`, which is wrong. Walk the diff before committing.
- The concept corpus has many files — this is the bulk of the sweep, and the main reason it's optional/deferrable.
