# Task 4: Update manifest and README docs for the page-drop contract

## Context

The mechanism is now: the **page** drops `check-action-modal` once and owns its `on_complete`; surfaces no longer auto-bundle the modal, and the timeline's `include_modal` / `on_action_complete` vars are gone (Tasks 2–3). The shared click handler degrades gracefully when no modal is present (Task 1).

Per CLAUDE.md, the module manifest is the source of truth for the component contract; the README restates it in narrative form. Both currently describe the old "auto-bundled by `actions-on-entity` / opt-in via `include_modal`" model and must be updated to the page-drop contract. No code in the manifest's `components:` registry changes — only the `exports.components` descriptions.

## Task

### `modules/workflows/module.lowdefy.yaml` — `exports.components`

Update two descriptions (lines ~124–149):

- **`check-action-modal`** — Replace the "Bundled automatically by actions-on-entity (and, opt-in, by workflows-events-timeline via include_modal)" language with the page-drop contract: the page drops the modal exactly once and owns its `on_complete` (the host's refetch action sequence run after a successful signal, default `[]`). Keep: fixed blockId `check_action_modal`; opened via the documented `SetState` + `CallMethod(setOpen, [{ open: true }])` contract; one instance per page; never drop it on a page that already defines a `get_workflow_action` request (the `workflow-action-*` pages).
- **`workflows-events-timeline`** — Remove the `include_modal` and `on_action_complete` var descriptions. Keep the surviving vars (`reference_field`, `reference_value`, `reverse`, `contact_page_url`, `disable_contact_link`, `compact`, `s3GetPolicyRequestId`) and the baked-in click-handler note. Add that the modal, if wanted in-context, is dropped by the page (not by this component).

### `modules/workflows/README.md`

Update the component reference entries (around lines 312–316, 329) to match:

- **`actions-on-entity`** (line ~312) — Drop any "bundles/owns the modal" language; it renders the per-workflow action list only. Keep `entity_id` + `entity_collection`.
- **`check-action-modal`** (line ~315) — Replace "**Bundled automatically by `actions-on-entity`** (and, opt-in, by `workflows-events-timeline` via its `include_modal` var)" with the page-drop contract: the **page** drops it exactly once (a single `_ref`) and owns `on_complete` (the refetch sequence run after a successful signal, default `[]`). Keep the open contract, the fixed blockId, the once-per-page rule, and the `get_workflow_action`-collision warning. Note the click handler is `check` → try the modal, falling back to navigation when absent.
- **`check-action-click`** (line ~316) — Update to reflect the `try`/`catch` shape: `check` cards _try_ to open `check_action_modal` and, when no modal is on the page, navigate to `action.link`; every other kind navigates directly. Still baked into both hosts — consumers wire no click handler.
- **`workflows-events-timeline`** (line ~329) — Remove the `include_modal` and `on_action_complete` sentences. Keep the required/optional surviving vars and the baked-in click-handler note; state the in-context modal is dropped by the page.

Mirror the manifest wording where they overlap; if they disagree, the manifest wins.

## Acceptance Criteria

- `module.lowdefy.yaml` `exports.components` for `check-action-modal` describes the page-drop contract and no longer says "bundled automatically" / "include_modal".
- `module.lowdefy.yaml` `exports.components` for `workflows-events-timeline` no longer lists `include_modal` or `on_action_complete`.
- `README.md` entries for `actions-on-entity`, `check-action-modal`, `check-action-click`, and `workflows-events-timeline` reflect the page-drop contract and `try`/`catch` fallback; no remaining reference to `include_modal` or auto-bundling.
- `grep -n "include_modal\|on_action_complete\|Bundled automatically\|bundles ONE\|owns it when present" modules/workflows/README.md modules/workflows/module.lowdefy.yaml` returns nothing (all stale references removed).
- `pnpm ldf:b` from `apps/demo` still compiles (docs-only change; sanity check).

## Files

- `modules/workflows/module.lowdefy.yaml` — modify — update `exports.components` descriptions for `check-action-modal` and `workflows-events-timeline`.
- `modules/workflows/README.md` — modify — update the `actions-on-entity`, `check-action-modal`, `check-action-click`, and `workflows-events-timeline` reference entries.

## Notes

- Documentation only — no `components:` registry, `vars:`, `pages:`, or `api:` changes.
- The `components:` registry entries for `check-action-modal` and `entity-workflows-refetch` already exist and stay — they are what make the page-drop `_ref` resolve.
