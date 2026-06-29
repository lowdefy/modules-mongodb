# Task 7: `workflows-test` fixture — custom-action config + app page + wiring

## Context

(Depends on tasks 2, 3, 4 — the build must accept `kind: custom`, validate its
cells, and the runtime must route its links.)

The `workflows-test` app (`apps/workflows-test/`) is the e2e fixture home (NOT
`demo`). Existing scenarios live under
`apps/workflows-test/modules/workflows/workflow_config/{scenario}/` and are
registered in `workflow_config/workflows.yaml`:

```yaml
- _ref: modules/workflows/workflow_config/check-blocked-by/check-blocked-by.yaml
# …one _ref per scenario workflow
```

A scenario workflow file declares `type`, `title`, `entity` (connection_id,
ref_key, page_id, id_query_key, title), `starting_actions`, `action_groups`, and
`actions` (each `_ref`'d). See
`apps/workflows-test/modules/workflows/workflow_config/check-blocked-by/` for the
shape, and `first-check.yaml` for a check action with `access` + `status_map`.

The entity surface is `apps/workflows-test/pages/thing-view.yaml`, which embeds the
`actions-on-entity` module component. That component bakes in
`check-action-click` (`modules/workflows/components/check-action-click.yaml`):
for a **non-check** kind it navigates via the server-resolved `action.link`
(`pageId` + `urlQuery`) — so a custom action card navigates to
`action.link.pageId` with `urlQuery: { action_id: <concrete _id> }`.

App pages are registered in `apps/workflows-test/lowdefy.yaml` under `pages:`
(e.g. `- _ref: pages/thing-view.yaml`).

## Task

1. **New workflow config** under
   `apps/workflows-test/modules/workflows/workflow_config/custom-action/`:
   - `custom-action.yaml` — the workflow: `type: custom-action`, an `entity` block
     pointing at `things-collection` / `thing-view` (mirror check-blocked-by),
     one `starting_action` at `action-required`, and an `actions:` `_ref` list.
   - one `kind: custom` action file (e.g. `review-document.yaml`) modelled on the
     design's app-side example: an `access` block (a `view: true` + `edit: [role]`
     - `review: [role]` for the test app slug), and a `status_map` with:
     * `action-required` → `{ message, link: { pageId: <app-page-id>, urlQuery: { action_id: true } }, view_link?: { pageId: <view-page-id>, urlQuery: { action_id: true } } }`
     * `in-review` → message-only (observers get the shared view page; reviewers
       get the in-review working link if you author one)
     * `done` → `{ message, link: { pageId: <view-page-id>, urlQuery: { action_id: true } } }`
   - Include enough to exercise **both** assertions the e2e needs: a working
     `link` (→ app page, concrete `_id`) and the observer fallback (a stage that
     exposes `view` with no authored `view_link`, so it falls back to the shared
     `{workflow_type}-action`). Pick the slug name to match whatever the test app's
     access uses (check existing scenarios for the app slug, e.g. `test`).

2. **Register** the new workflow in
   `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` with a
   `_ref` entry.

3. **App-owned working page(s)** under `apps/workflows-test/pages/`:
   - The working page the custom action's `link.pageId` points at. It reads
     `?action_id=<id>` (`_url_query: action_id`), shows enough to confirm it
     loaded the right action, and has a control (button) whose event does an
     (optional) domain write then calls the module submit endpoint:

     ```yaml
     - id: submit_review
       type: CallApi
       params:
         endpointId:
           _module.endpointId: { id: custom-action-submit, module: workflows }
         payload:
           action_id: { _url_query: action_id }
           signal: approve # or submit / request_changes …
     ```

     (Confirm the exact `id:` of the emitted submit endpoint — it is
     `{workflow_type}-submit`, i.e. `custom-action-submit`.)

   - If the config uses a separate `view_link`/view page id for `done`, add that
     page too (it can be a minimal read-only page reading `?action_id=`).

4. **Wire** the new page(s) into `apps/workflows-test/lowdefy.yaml` `pages:` (and
   `menus.yaml` / `modules.yaml` only if a new menu entry or module wiring is
   actually needed — most scenarios just add `pages:` refs).

5. **Build check:** `pnpm --filter @lowdefy/modules-demo ldf:b` is the demo; for
   this app run the equivalent build from `apps/workflows-test` (`pnpm ldf:b`) to
   confirm the config + pages compile.

## Acceptance Criteria

- A `custom-action` workflow config exists, is registered in `workflows.yaml`, and
  uses `kind: custom` with `link:` / `view_link:` cells and the `action_id`
  sentinel.
- The app-owned working page exists, reads `?action_id=`, and calls
  `custom-action-submit` with `action_id` + a nullary `signal`.
- All new pages are registered in `lowdefy.yaml`.
- `pnpm ldf:b` (from `apps/workflows-test`) compiles with no config errors.

## Files

- `apps/workflows-test/modules/workflows/workflow_config/custom-action/custom-action.yaml` — create — the workflow.
- `apps/workflows-test/modules/workflows/workflow_config/custom-action/review-document.yaml` (or similar) — create — the `kind: custom` action.
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify — register the new workflow.
- `apps/workflows-test/pages/` — create — the app-owned working page (+ optional view page).
- `apps/workflows-test/lowdefy.yaml` — modify — register the new page(s).

## Notes

The whole point of the kind is "app owns the working surface", so the working page
is genuinely app-owned (under `apps/workflows-test/pages/`), not a module page. The
shared `{workflow_type}-action` page (module-supplied) is the observer fallback and
needs no app page.
