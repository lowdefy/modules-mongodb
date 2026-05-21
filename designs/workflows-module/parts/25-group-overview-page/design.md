# Part 25 — Group overview page + `get-action-group-overview` Api

**Source rationale:** [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md) (shared workflow-overview surface) + [workflows-module-concept/action-groups/spec.md](../../../workflows-module-concept/action-groups/spec.md) (persisted `groups[]` summary). **Layer:** UI delivery + surface. **Size:** S. **Repo:** `modules/workflows/pages/` + `modules/workflows/api/`.

## Goal

Ship a shared, static page that focuses on a single action group within a workflow — `pages/group-overview.yaml` — plus the operational Api that backs it (`get-action-group-overview`). The page is the group-level analogue of `workflow-overview` ([part 17](../17-shared-pages/design.md)): it loads one workflow's actions filtered to a single `action_group`, renders one card per action with the existing `status_map`-driven link cells, and adds a progress bar driven by the engine-persisted per-group `summary` ([action-groups spec](../../../workflows-module-concept/action-groups/spec.md#persistence--groups-on-the-workflow-doc)).

The motivating gap: a host app's entity page wants to drill into a single phase of a long workflow (e.g. "Phase 2 — Quote" from the worked-example onboarding workflow) without rendering the whole workflow-overview tree. The page is also the natural target for an `action_group`-scoped link cell from an entity-page summary widget.

## Proposed change

1. Ship `pages/group-overview.yaml` — addressed by `?workflow_id=<id>&group_id=<id>`. Mounts a single `CallApi` to `get-action-group-overview`; renders the group header, a progress bar, and a list of access-filtered action cards.
2. Ship `api/get-action-group-overview.yaml` — sixth module-shipped operational Api. Matches the `get-workflow-overview` shape but filters actions to the requested `action_group` and returns `{ workflow, group, actions: [] }`.
3. Reuse every existing primitive: the `access_filter` aggregation stage, the `status_map.{current_stage}.{app_name}.link` link contract, `global.action_form_configs` for the read-only form-data display, and the engine-persisted `groups[id].summary` for the progress bar. No new schemas, no new reducer state.
4. Wire the page + Api through the module manifest (export `group-overview` page, export `get-action-group-overview` Api).
5. Cross-reference the new page/Api in [part 17 — shared-pages](../17-shared-pages/design.md), [part 19 — operational-apis](../_completed/19-operational-apis/design.md), and [part 20 — module-manifest](../20-module-manifest/design.md) so the surface lists are coherent.

## In scope

### Page: `pages/group-overview.yaml`

- **URL query:** `?workflow_id=<id>&group_id=<id>`. Missing either triggers a `Link` back to the host entity page (same fallback shape as `workflow-overview`).
- **Mount:** one `CallApi` to `get-action-group-overview` with `{ workflow_id, group_id }` from the URL query. The Api returns `{ workflow, group, actions: [] }` (or `{ workflow: null, group: null, actions: [] }` when nothing is visible — the page redirects back to the host entity page in that case, matching `workflow-overview`'s redirect-on-empty contract).
- **Reused module-shipped requests:** `requests/get_entity.yaml` from [part 16](../16-page-templates/design.md), fired after the Api returns, to fetch the entity doc for breadcrumbs / back-link. The entity find substitutes `{{ entity_collection }}` from the workflow doc into the `connectionId` literal at Nunjucks render time (same mechanism part 17 uses for `workflow-overview`).
- **Layout-module composition:** `layout.page` → progress-bar block + `layout.card` per action. Same layout vocabulary as the rest of the module's shipped pages.

#### Rendered blocks

1. **Page header.** Workflow title + group title (`group.title` from YAML, looked up by `group_id` against the workflow's persisted `groups[]`), back-link breadcrumb to the entity page.
2. **Progress bar.** Single block, driven by `group.summary: { done, not_required, total }`. Filled proportion is `(done + not_required) / total`. Label reads `{{ done + not_required }} of {{ total }} done`. Empty groups (`total === 0`) render the bar at 100% with a "no actions" label — matches the action-groups spec convention that empty groups are `done` by default.
3. **Group-status badge.** Reads `group.status` (`blocked` / `in-progress` / `done`) — engine-persisted three-value enum from the action-groups spec.
4. **List of action cards** wrapped in `layout.card`:
   - Status badge from `global.action_statuses.{current_stage}` + status-map message (`status_map.{current_stage}.{app_name}.message`, Nunjucks-templated).
   - Card body identical to `workflow-overview`'s card body: empty-state Html block when no `form_data`, or a `DataView` over `form_data` using `global.action_form_configs.{action_type}.form` / `.form_review`. Recurses into nested `form:` arrays on structural components (`controlled_list`, `section`, `box`, `label`, `file_upload`).
   - Click navigation: each card's link target comes from `status_map.{current_stage}.{app_name}.link` — exactly the same mechanism `workflow-overview`'s cards and `actions-on-entity`'s rows use ([ui spec § Status-map binding](../../../workflows-module-concept/ui/spec.md#status-map-binding)). `link.pageId` is the destination, `link.urlQuery` builds the query string, `link.title` is the label. Actions with no `status_map[currentStage].{app_name}.link` render as a non-clickable card.
   - Keyed actions render as N cards within their group slot (one per `key` value), already returned that way by the Api.
   - Tracker actions link to the child workflow's `workflow-overview` (or `group-overview` if the link cell points there), routed entirely through `status_map`.

#### Page events

Same `onMount` vocabulary as `workflow-overview`. v1 doesn't expose page-level event overrides — apps that need bespoke group-overview UX render their own page.

### Api: `api/get-action-group-overview.yaml`

- **Payload schema:** required `workflow_id`, required `group_id`.
- **Routine:** Lowdefy routine on `workflows-collection`, modeled on `get-workflow-overview`:
  1. `$match: { _id: workflow_id }`.
  2. `$lookup` against `actions-collection`:
     - Inner `$match` on `workflow_id` AND `action_group: <payload.group_id>`.
     - `_ref: stages/access_filter.yaml` (existing reusable stage) — applies the per-app verb gate + role gate.
     - `$sort` by `sort_order` ASC, then `_id` ASC (no `_group_index` — single group, so the cross-group ordering layer drops out).
  3. `_state` capture + `_return`:
     - `workflow` — the matched workflow doc (or `null` when no actions are visible).
     - `group` — `workflow.groups[]` entry where `id === payload.group_id`, returned with `{ id, title, status, summary }`. `title` comes from the workflow's static `action_groups[]` (looked up by id; matches the action-groups spec's separation of "static config in YAML / runtime status in `groups[]`"). Null when the workflow / group is inaccessible.
     - `actions` — array of access-filtered actions, ordered per step 2's `$sort`.
- **Return shape:**

  ```js
  // success
  { workflow: { _id, workflow_type, entity_id, entity_collection, status, summary, groups, ... },
    group:    { id, title, status, summary: { done, not_required, total } },
    actions:  [ <action_doc>, ... ] }

  // access-denied / missing
  { workflow: null, group: null, actions: [] }
  ```

  The access-vs-existence collapse mirrors `get-workflow-overview`'s deliberate security choice — callers can't distinguish "no such workflow", "no such group", and "no actions in this group are visible to me".

### Page + Api in the manifest

[Part 20](../20-module-manifest/design.md) exports both:

- `exports.pages` adds `group-overview`.
- `exports.api` adds `get-action-group-overview`.

### Cross-references in sibling designs

The list-of-shared-pages in [part 17](../17-shared-pages/design.md), the list-of-operational-Apis in [part 19](../_completed/19-operational-apis/design.md), and the manifest list in [part 20](../20-module-manifest/design.md) each grow a row to point at this part. Part 17 isn't shipped yet — its design absorbs a "see also part 25" line. Part 19 is shipped — its design grows a "see also part 25" line; the Api itself ships from this part rather than reopening part 19.

## Out of scope / deferred

- **Multi-group selection.** v1 is one group per page. A "selected groups" UX (filter chips, multi-group view) can compose this page + `workflow-overview` rather than landing as a third surface.
- **Page-level event override slots.** Authors who need bespoke group-overview chrome render their own page. Adding `pages.group_overview.{events|formHeader|formFooter}` to the workflow YAML schema (declared in [part 4](../04-workflow-config-schema/design.md)) is an additive v1.x change if real apps surface the need.
- **Direct link to the parent workflow's `workflow-overview`.** v1 ships a back-link to the entity page only. A "view full workflow" link can ride on the breadcrumb in v1.x.
- **Per-group `display_order` override on the URL.** The list inherits the same intra-group ordering (`sort_order` ASC) as `workflow-overview`. No per-call sort.

## Depends on

- [Part 7 — group-state-machine](../_completed/07-group-state-machine/design.md) — supplies the persisted `groups[id].summary` the progress bar reads.
- [Part 13 — resolver-apis](../13-resolver-apis/design.md) — emits the `update-action-{action_type}` endpoints the action cards' downstream click destinations call. (Indirect — this page doesn't call them, but the cards link to pages that do.)
- [Part 15 — resolver-form-builder](../_completed/15-resolver-form-builder/design.md) — populates `global.action_form_configs` for the card-body `DataView`.
- [Part 16 — page-templates](../16-page-templates/design.md) — owns the canonical `requests/get_entity.yaml` this page `_ref`s.
- [Part 17 — shared-pages](../17-shared-pages/design.md) — peer surface; the `workflow-overview` page is the reference design this page mirrors.
- [Part 19 — operational-apis](../_completed/19-operational-apis/design.md) — owns the `access_filter` aggregation stage at `api/stages/access_filter.yaml` that the new Api `_ref`s.
- [Part 20 — module-manifest](../20-module-manifest/design.md) — declares the page + Api in `exports`. Manifest wiring is part 20's work; this part lands the YAML files.

## Verification

- Unit tests for the Api:
  - Returns the matching group's `summary` even when access filtering removes all actions (the group meta is still useful) — or, if we settle on the "collapse to null" rule, returns `{ workflow: null, group: null, actions: [] }`. Decided: collapse to null per the access-vs-existence security rule.
  - Filters actions by `action_group` correctly (other groups' actions absent).
  - Honors the per-app verb gate + role gate via the shared `access_filter` stage.
  - Returns keyed actions as N entries, kept in `sort_order` order.
- Page-level smoke:
  - Loads with `?workflow_id=<id>&group_id=phase-2` on the worked-example onboarding workflow.
  - Progress bar renders correct `done / total` for the group's state at load.
  - Action cards render status badges and Nunjucks-templated status-map messages.
  - Clicking a card with a `status_map.{stage}.{app_name}.link` navigates to the configured page; clicking a card without one is inert.
  - Empty / fully-access-restricted group redirects back to the entity page.
- a11y + responsive: progress bar carries an `aria-valuenow` / `aria-valuemax`; cards reflow on narrow viewports.
- End-to-end coverage lands in [part 22 — workflows-e2e-suite](../22-workflows-e2e-suite/design.md) (`group-overview.spec.js`). This part's verification is unit-tests + handler-level smoke only.

## Open questions

- **Empty-group rendering.** Empty groups are `done` by convention (action-groups spec). The progress bar at 100% with "no actions" copy is fine; the question is whether the page should redirect back to the entity page on an empty group, the same way it does for an inaccessible group. Leaning **render, don't redirect** — emptiness is meaningful state ("this phase has no work") whereas inaccessibility is a security boundary. Confirm during implementation.
- **`group` payload when the workflow exists but the group id is unknown.** Currently collapsed to the access-denied shape (`null`). Alternative: 404-style explicit "unknown group" so authors can distinguish a bad link from an access denial. Stick with collapse for v1 consistency with `get-workflow-overview`.

## Contract to neighbours

- **[Part 17](../17-shared-pages/design.md)** lists `group-overview` alongside `workflow-overview` / `task-*` in its "Shared pages" inventory. Part 17 doesn't own the file; this part does.
- **[Part 19](../_completed/19-operational-apis/design.md)** exposes the `access_filter` aggregation stage at `api/stages/access_filter.yaml`. This part `_ref`s it from `get-action-group-overview.yaml`.
- **[Part 20](../20-module-manifest/design.md)** adds `group-overview` to `exports.pages` and `get-action-group-overview` to `exports.api`. Without that wiring, host apps can't `_ref` the page or call the Api.
- **[Part 22](../22-workflows-e2e-suite/design.md)** picks up `group-overview.spec.js` as part of its e2e authoring contract.
