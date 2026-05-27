# Task 13: Sweep in-flight workflows design docs — standardise on "slug"

## Context

The workflows design corpus (`designs/workflows-module/**` and `designs/workflows-module-concept/**`) was written when the module's manifest var was `app_name`. With `app_name` removed in tasks 3–8, the design docs that future implementers read should also use the new vocabulary. The design's decision (`Standardise to "slug" in prose across in-flight and concept design docs`) is to do this in the same PR — half-migrating ("snippets only, prose left as `app_name`") leaves two terms for one thing.

`_completed/` subfolders are read-only history per project rule; they keep their `app_name` references. The sweep is restricted to in-flight design docs and concept docs.

The design also calls out a specific forward-reference to remove: `designs/workflows-module/parts/30-status-map-rendering/design.md` line 144 ("Lowdefy is adding an `_app: slug` operator…"). With this design landing, that note becomes obsolete and should be replaced with a back-reference once this design is moved to `_completed/`.

## Task

1. **Find affected files.** Restrict to non-review, non-task files outside `_completed/`:

    ```bash
    grep -rln "app_name" designs/workflows-module/ designs/workflows-module-concept/ \
      | grep -v "/_completed/" \
      | grep -v "/review/" \
      | grep -v "/reviews/" \
      | grep -v "/tasks/"
    ```

    Expected set (from current state) — verify against the actual grep output:

    - `designs/workflows-module/implementation-plan.md`
    - `designs/workflows-module/parts/22-workflows-e2e-suite/design.md`
    - `designs/workflows-module/parts/24-universal-fields/design.md`
    - `designs/workflows-module/parts/24a-user-account-selector-avatar/design.md`
    - `designs/workflows-module/parts/28-custom-action-kind/design.md`
    - `designs/workflows-module/parts/30-status-map-rendering/design.md`
    - `designs/workflows-module/parts/33-comment-rendering/design.md`
    - All `design.md` and `spec.md` files under `designs/workflows-module-concept/**` (excluding `_completed/`, `/review/`, `/tasks/`).

2. **Rename in each affected file.** Three transform categories:

    **a. Code-snippet sites** — Lowdefy YAML examples:
    - `_module.var: app_name` → `_app: slug`.
    - Manifest var declarations showing `app_name:` (e.g. inside a `vars:` block example) — drop the entry.

    **b. Data-model placeholders that name the slug position:**
    - `access.{app_name}` → `access.{slug}`.
    - `status_map.{stage}.{app_name}` → `status_map.{stage}.{slug}`.
    - `display.{app_name}` → `display.{slug}`.
    - `apps.{app_name}.roles` → `apps.{slug}.roles`.
    - **Do not change** `created.app_name` — that is the stored field name on event/notification documents, not a placeholder.

    **c. Narrative references that are about the value:**
    - "the host app's `app_name`" → "the host app's slug".
    - "match `vars.app_name`" → "match the app slug".
    - Similar phrasings — rewrite so the prose refers to "the slug" or "`_app: slug`".

3. **Remove the forward note.** In `designs/workflows-module/parts/30-status-map-rendering/design.md` around line 144, delete the paragraph that says "Lowdefy is adding an `_app: slug` operator that will replace `_module.var: app_name` repo-wide…". Replace it with a brief back-reference: e.g. "The slug originates from the app's root `slug:` declaration in `lowdefy.yaml`; see [`designs/app-operator/`](../../../app-operator/design.md) for the migration that introduced this pattern." Once this `app-operator` design is moved to `_completed/`, update the link to `_completed/app-operator/design.md`.

4. **Verify nothing is missed.** After the sweep, run the grep from step 1 again. The only `app_name` hits should be:
    - Stored field name references like `created.app_name`.
    - Comments deliberately keeping the old name for context (rare — flag any you keep).

## Acceptance Criteria

- All in-flight workflows design files (per the grep in step 1) use `slug` / `_app: slug` for value references, and `{slug}` for placeholders.
- The forward note in `parts/30-status-map-rendering/design.md` is replaced with a back-reference to `designs/app-operator/`.
- Stored field name references (`created.app_name`) remain untouched.
- Files under `_completed/`, `review/`, `reviews/`, and `tasks/` are not modified.
- A second pass of the same grep returns only stored-field-name hits.

## Files

- `designs/workflows-module/implementation-plan.md` — modify — rename per the rules.
- `designs/workflows-module/parts/22-workflows-e2e-suite/design.md` — modify — rename per the rules.
- `designs/workflows-module/parts/24-universal-fields/design.md` — modify — rename per the rules.
- `designs/workflows-module/parts/24a-user-account-selector-avatar/design.md` — modify — rename per the rules.
- `designs/workflows-module/parts/28-custom-action-kind/design.md` — modify — rename per the rules.
- `designs/workflows-module/parts/30-status-map-rendering/design.md` — modify — rename + remove forward note + add back-reference.
- `designs/workflows-module/parts/33-comment-rendering/design.md` — modify — rename per the rules.
- `designs/workflows-module-concept/**/*.md` (excluding `_completed/`, `review/`, `tasks/`) — modify — rename per the rules.

## Notes

- This task is mechanically independent of the code migration and could ship in a separate PR. Per the design's "one canonical term" decision, it ships in the same PR.
- Be precise about the placeholder vs field-name distinction — a global find/replace risks turning `created.app_name` into `created.slug`, which would be wrong. Walk the diff before committing.
- The concept design (`designs/workflows-module-concept/**`) has many files; this is the largest part of the sweep. Expect to touch every `design.md` and `spec.md` that surfaces in the grep.
