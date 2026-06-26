# Part 25 — Group overview page + `get-action-group-overview` Api

**Source rationale:** [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md) (shared workflow-overview surface) + [workflows-module-concept/action-groups/spec.md](../../../workflows-module-concept/action-groups/spec.md) (persisted `groups[]` summary). **Layer:** UI delivery + surface. **Size:** S. **Repo:** `modules/workflows/pages/` + `modules/workflows/api/`.

## Goal

Ship a shared, static page that focuses on a single action group within a workflow — `pages/group-overview.yaml` — plus the operational Api that backs it (`get-action-group-overview`). The page is the group-level analogue of `workflow-overview` ([part 17](../_completed/17-shared-pages/design.md)): it loads one workflow's actions filtered to a single `action_group`, renders one card per action with the existing `status_map`-driven link cells, and adds a progress bar driven by the engine-persisted per-group `summary` ([action-groups spec](../../../workflows-module-concept/action-groups/spec.md#persistence--groups-on-the-workflow-doc)).

The motivating gap: a host app's entity page wants to drill into a single phase of a long workflow (e.g. "Phase 2 — Quote" from the worked-example onboarding workflow) without rendering the whole workflow-overview tree. The page is also the natural target for an `action_group`-scoped link cell from an entity-page summary widget.

## Proposed change

1. Ship `pages/group-overview.yaml` — addressed by `?workflow_id=<id>&group_id=<id>`. Mounts a single `CallApi` to `get-action-group-overview`; renders the group header, a progress bar, and a list of access-filtered action cards.
2. Ship `api/get-action-group-overview.yaml` — sixth module-shipped operational Api. Matches the `get-workflow-overview` shape but filters actions to the requested `action_group` and returns `{ workflow, group, actions: [] }`.
3. Reuse every existing primitive: the `access_filter` aggregation stage, the `status_map.{current_stage}.{app_name}.link` link contract, `global.action_form_configs` for the read-only form-data display, and the engine-persisted `groups[id].summary` for the progress bar. No new schemas, no new reducer state.
4. Append `group-overview` to `exports.pages`, `get-action-group-overview` to `exports.api`, and the corresponding `_ref` entries under `pages:` and `api:` in [`module.lowdefy.yaml`](../../../../modules/workflows/module.lowdefy.yaml). Part 20 will fold these into its formal manifest-shape contract when it lands; in the meantime each part edits the manifest progressively (parts 4, 15, 17, 18, 19 each did the same — see `git log -- modules/workflows/module.lowdefy.yaml`).
5. Update `components/actions-on-entity.yaml` ([part 18](../_completed/18-entity-components/design.md)) so its `ActionSteps` block links each group title to `group-overview?workflow_id=<id>&group_id=<id>`. The link target is built client-side in the existing `actionGroupConfig` builder; no changes to the `ActionSteps` block itself (its `actionGroupConfig[group].link` slot already ships).
6. Cross-reference the new page/Api in [part 17 — shared-pages](../_completed/17-shared-pages/design.md), [part 19 — operational-apis](../_completed/19-operational-apis/design.md), and [part 20 — module-manifest](../20-module-manifest/design.md) so the surface lists are coherent.

## In scope

### Page: `pages/group-overview.yaml`

- **URL query:** `?workflow_id=<id>&group_id=<id>`. Missing either triggers a `Link` back to the host entity page (same fallback shape as `workflow-overview`).
- **Mount:** one `CallApi` to `get-action-group-overview` with `{ workflow_id, group_id }` from the URL query. The Api returns `{ workflow, group, actions: [] }` (or `{ workflow: null, group: null, actions: [] }` when nothing is visible — the page redirects back to the host entity page in that case, matching `workflow-overview`'s redirect-on-empty contract).
- **Reused module-shipped requests:** `requests/get_entity.yaml` from [part 16](../_completed/16-page-templates/design.md), fired after the Api returns, to fetch the entity doc for breadcrumbs / back-link. The entity find substitutes `{{ entity_collection }}` from the workflow doc into the `connectionId` literal at Nunjucks render time (same mechanism part 17 uses for `workflow-overview`).
- **Layout-module composition:** `layout.page` → progress-bar block + `layout.card` per action. Same layout vocabulary as the rest of the module's shipped pages.

#### Rendered blocks

1. **Page header.** Workflow title + group title (resolved client-side via `_global: workflows_config[workflow.workflow_type].action_groups[]` joined on `group.id` — same lookup `workflow-header.yaml` uses at [workflow-header.yaml:117-137](../../../../modules/workflows/components/workflow-header.yaml); fall back to `group.id` when no matching `action_groups[]` entry exists), back-link breadcrumb to the entity page.
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
     - `group` — `workflow.groups[]` entry where `id === payload.group_id`, returned with `{ id, status, summary }`. Title is **not** included in the Api response — `groups[]` on the persisted doc carries only `{ id, status, summary }` ([action-groups/spec.md § Persistence](../../../workflows-module-concept/action-groups/spec.md#persistence--groups-on-the-workflow-doc), [recomputeGroups.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js)) and the static title lives in build-time `workflowsConfig.{type}.action_groups[]`, unreachable from a Mongo aggregation. The page resolves the title client-side via `_global: workflows_config` (see "Rendered blocks § Page header" above). Null when the workflow / group is inaccessible.
     - `actions` — array of access-filtered actions, ordered per step 2's `$sort`.
- **Return shape:**

  ```js
  // success
  { workflow: { _id, workflow_type, entity_id, entity_collection, status, summary, groups, ... },
    group:    { id, status, summary: { done, not_required, total } },
    actions:  [ <action_doc>, ... ] }

  // access-denied / missing
  { workflow: null, group: null, actions: [] }
  ```

  Follows `get-workflow-overview`'s rule — `workflow` collapses to `null` when no actions survive the access filter (see [api/get-workflow-overview.yaml:55-79](../../../../modules/workflows/api/get-workflow-overview.yaml)). `actions` is the raw `$lookup` output (naturally `[]` in the access-denied case because every action was filtered). This Api adds one minor divergence on top: `group` also collapses to `null` alongside `workflow`, since the group payload is only meaningful in the context of a visible workflow. Callers can't distinguish "no such workflow", "no such group", and "no actions in this group are visible to me" — same deliberate security choice as `get-workflow-overview`.

### Page + Api in the manifest

This part edits [`modules/workflows/module.lowdefy.yaml`](../../../../modules/workflows/module.lowdefy.yaml) directly — same pattern parts 4 / 15 / 17 / 18 / 19 each followed:

- `exports.pages` gains a `group-overview` entry.
- `exports.api` gains a `get-action-group-overview` entry.
- `pages:` gains `- _ref: pages/group-overview.yaml`.
- `api:` gains `- _ref: api/get-action-group-overview.yaml`.

[Part 20](../20-module-manifest/design.md) will fold this in when it lands its formal manifest-shape contract; it doesn't gate this part.

### `actions-on-entity` → group-overview link

[Part 18](../_completed/18-entity-components/design.md) ships `components/actions-on-entity.yaml`, which renders one `ActionSteps` block per workflow on the host entity page. The block already exposes `actionGroupConfig[group].link` ([`ActionSteps` README § Properties](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md#properties)) — wrapping the group title in a clickable `Link`. v1 of part 18 builds `actionGroupConfig` without a `link`, so group titles are inert text.

This part adds the link in `actions-on-entity`'s existing `actionGroupConfig` `_js` builder ([`components/actions-on-entity.yaml:48-64`](../../../../modules/workflows/components/actions-on-entity.yaml)). For every configured group the builder also writes:

```js
config[g.id].link = {
  pageId: "<scoped group-overview pageId>", // _module.pageId: { id: group-overview, module: workflows } — passed in as a third _js param
  urlQuery: { workflow_id: workflow._id, group_id: g.id },
};
```

The `pageId` is resolved by Lowdefy via `_module.pageId: { id: group-overview, module: workflows }` and passed into the `_js` block as a parameter. The existing builder already resolves `_module.var: workflows_config` and `_module.var: app_name` in `_js` `params` ([components/actions-on-entity.yaml:50-53, 67-69](../../../../modules/workflows/components/actions-on-entity.yaml)), so the operator family works in this position — but `_module.pageId` is build-time-resolved and has no in-repo precedent inside `_js.params` (workflow-header uses it directly in `Link.params` YAML at [workflow-header.yaml:67-73](../../../../modules/workflows/components/workflow-header.yaml), not as a `_js` param). **Implementation should sanity-check this**. If Lowdefy doesn't resolve `_module.pageId` in `_js.params`, the workaround is mechanical: lift the resolved `pageId` to a sibling YAML property and pass it as a constant string into the `_js` builder, or build the per-group `link` map in YAML (`actionGroupConfig:` literal) and merge it onto the `_js`-built `{ order, title, icon }` map.

The link is built unconditionally — every group on the entity widget links to its group-overview page, mirroring the workflow-header's workflow-overview button. No status_map cell, no per-group YAML config: the link target is mechanical (`workflow_id` + `group_id`), so building it client-side keeps the wiring trivial.

**Why client-side, not status_map.** `status_map` is per-action and per-`current_stage`; the group-overview link is per-group and stage-independent. Threading it through `status_map` would mean every action's `status_map` cell would need to carry the same group-level link — duplicative and confusing. Building it client-side from `{ workflow._id, group.id }` keeps the link contract co-located with the data already in scope.

**Why every group, no opt-out.** A v1 toggle (e.g. `_module.var: hide_group_overview_link`) adds surface area for no clear win — apps that don't want the page don't ship the route, in which case the link 404s and that's the signal to remove the route OR remove the link by forking the component. Defer.

**Known edges with the "always link" rule.** Two cosmetic / UX edges are accepted in v1:

1. **Bounce-back on access-restricted `done` groups.** If a user clicks the title of a `done` group whose actions are all access-filtered out for _that user_, `group-overview` returns `{ workflow: null, group: null, actions: [] }` and redirects back to the entity page (per the redirect-on-empty contract above). The user clicked a visually active link and got nothing. Rare in practice — a user with workflow visibility on the entity page almost always has visibility into some action per group — but possible under per-action role gating. Accepted because the alternative (disable link on `done` groups) requires the builder to mirror engine state per group and the bounce-back is recoverable (one click back). If this becomes a real complaint we'd flip to `link.disabled: true` on `groups[i].status === 'done'` — a small, additive change in the `_js` builder.
2. **Struck-through clickable title on all-`not-required` groups.** `ActionSteps` wraps the group title in `<strike>` when the block-internal rollup is `not-required` ([`ActionSteps.js:115-117`](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js)). With the link populated, that markup sits inside a clickable `Link`, giving a struck-through hyperlink. Visually dissonant but rare — only fires when every action in the group rolls up to `not-required`. Accepted in v1; same fallback as above (`link.disabled: true` on the rollup) is available if it surfaces.

**No change to the `ActionSteps` block.** The block already renders `actionGroupConfig[group].link` as a clickable group title; this part just populates it. README is already correct.

**Tracker actions: child-workflow info stays off the parent widget.** A tracker action's row inside `actions-on-entity` is treated like any other row — badge + `status_map`-driven message + `status_map`-driven link cell (per [part 18 design.md:42](../_completed/18-entity-components/design.md)). The row's `link` is the only surface that points at the child workflow; nothing else in `actions-on-entity` (group title, header, summary counts) reflects child-workflow state. This part preserves that: the per-group title link added here points at the _parent_ workflow's `group-overview`, never a child's. The two surfaces — group title (parent) and tracker row link (child) — address different workflows and are not in competition.

### Cross-references in sibling designs

The list-of-shared-pages in [part 17](../_completed/17-shared-pages/design.md), the list-of-operational-Apis in [part 19](../_completed/19-operational-apis/design.md), and the manifest list in [part 20](../20-module-manifest/design.md) each grow a row to point at this part. Parts 17, 18, and 19 are shipped — each design grows a "see also part 25" line and the new YAML / manifest edits ship from this part rather than reopening them. Part 18's design also notes that this part extends the `actionGroupConfig` builder it already specifies. Part 20 isn't shipped — its design picks up the formal manifest-shape contract for the entries this part appends progressively.

## Out of scope / deferred

- **Multi-group selection.** v1 is one group per page. A "selected groups" UX (filter chips, multi-group view) can compose this page + `workflow-overview` rather than landing as a third surface.
- **Page-level event override slots.** Authors who need bespoke group-overview chrome render their own page. Adding `pages.group_overview.{events|formHeader|formFooter}` to the workflow YAML schema (declared in [part 4](../_completed/04-workflow-config-schema/design.md)) is an additive v1.x change if real apps surface the need.
- **Direct link to the parent workflow's `workflow-overview`.** v1 ships a back-link to the entity page only. A "view full workflow" link can ride on the breadcrumb in v1.x.
- **Per-group `display_order` override on the URL.** The list inherits the same intra-group ordering (`sort_order` ASC) as `workflow-overview`. No per-call sort.

## Depends on

- [Part 7 — group-state-machine](../_completed/07-group-state-machine/design.md) — supplies the persisted `groups[id].summary` the progress bar reads.
- [Part 13 — resolver-apis](../13-resolver-apis/design.md) — emits the `update-action-{action_type}` endpoints the action cards' downstream click destinations call. (Indirect — this page doesn't call them, but the cards link to pages that do.)
- [Part 15 — resolver-form-builder](../_completed/15-resolver-form-builder/design.md) — populates `global.action_form_configs` for the card-body `DataView`.
- [Part 16 — page-templates](../_completed/16-page-templates/design.md) — owns the canonical `requests/get_entity.yaml` this page `_ref`s.
- [Part 17 — shared-pages](../_completed/17-shared-pages/design.md) — peer surface; the `workflow-overview` page is the reference design this page mirrors.
- [Part 18 — entity-components](../_completed/18-entity-components/design.md) — owns `components/actions-on-entity.yaml`; this part edits the existing `actionGroupConfig` `_js` builder to add the group-overview `link`. The `ActionSteps` block's `actionGroupConfig[group].link` slot is already shipped — no plugin changes.
- [Part 19 — operational-apis](../_completed/19-operational-apis/design.md) — owns the `access_filter` aggregation stage at `api/stages/access_filter.yaml` that the new Api `_ref`s.
- [Part 20 — module-manifest](../20-module-manifest/design.md) — will fold the manifest changes into its formal shape contract; this part edits `module.lowdefy.yaml` directly in the interim (matching how parts 4 / 15 / 17 / 18 / 19 have done it).

## Verification

This part's verification is **handler-level smoke against the demo app**. No unit tests on Api YAML — there's no precedent for testing Lowdefy Api routines in this repo ([`api/get-workflow-overview.yaml`](../../../../modules/workflows/api/get-workflow-overview.yaml) and the other shipped Apis have no sibling tests). Behavioural coverage for the Api lands in [part 22 — workflows-e2e-suite](../22-workflows-e2e-suite/design.md) (`group-overview.spec.js`).

- Page-level smoke against the worked-example onboarding workflow:
  - Loads with `?workflow_id=<id>&group_id=phase-2`.
  - Progress bar renders correct `done / total` for the group's state at load.
  - Group title renders correctly from `workflowsConfig[workflow_type].action_groups[group_id].title`; falls back to `group_id` when no matching entry exists (matches the fallback in [workflow-header.yaml:135-137](../../../../modules/workflows/components/workflow-header.yaml)).
  - Action cards render status badges and Nunjucks-templated status-map messages.
  - Clicking a card with a `status_map.{stage}.{app_name}.link` navigates to the configured page; clicking a card without one is inert.
  - Empty / fully-access-restricted group redirects back to the entity page.
- `actions-on-entity` link smoke:
  - On the entity page, each `ActionSteps` group title is now a `Link` whose target resolves to `group-overview?workflow_id=<workflow._id>&group_id=<group.id>` for the row's workflow + group.
  - Clicking the group title lands on `group-overview` with both query params populated; the page in turn loads the correct group via `get-action-group-overview`.
  - Group title's `Link` is rendered for every configured group, including `done` groups (consistent with the workflow-header's always-visible workflow-overview button).
- a11y + responsive: progress bar carries an `aria-valuenow` / `aria-valuemax`; cards reflow on narrow viewports.
- Part 22 e2e spec (`group-overview.spec.js`) covers the four Api-behaviour scenarios this part can't unit-test in isolation: access-filter collapse to `{ null, null, [] }`; correct per-group filtering (other groups' actions absent); per-app verb + role gating via `access_filter`; keyed actions returned as N entries in `sort_order` order.

## Open questions

- **Empty-group rendering.** Empty groups are `done` by convention (action-groups spec). The progress bar at 100% with "no actions" copy is fine; the question is whether the page should redirect back to the entity page on an empty group, the same way it does for an inaccessible group. Leaning **render, don't redirect** — emptiness is meaningful state ("this phase has no work") whereas inaccessibility is a security boundary. Confirm during implementation.
- **`group` payload when the workflow exists but the group id is unknown.** Currently collapsed to the access-denied shape (`null`). Alternative: 404-style explicit "unknown group" so authors can distinguish a bad link from an access denial. Stick with collapse for v1 — same security-driven access-vs-existence rule the Return-shape section commits to.

## Contract to neighbours

- **[Part 17](../_completed/17-shared-pages/design.md)** lists `group-overview` alongside `workflow-overview` / `task-*` in its "Shared pages" inventory. Part 17 doesn't own the file; this part does.
- **[Part 18](../_completed/18-entity-components/design.md)** owns `components/actions-on-entity.yaml`. This part extends the existing `actionGroupConfig` `_js` builder to emit a `link` on every group, pointing at `group-overview?workflow_id=…&group_id=…`. The `ActionSteps` block (already shipped) renders the `link` as a clickable group title.
- **[Part 19](../_completed/19-operational-apis/design.md)** exposes the `access_filter` aggregation stage at `api/stages/access_filter.yaml`. This part `_ref`s it from `get-action-group-overview.yaml`.
- **[Part 20](../20-module-manifest/design.md)** owns the eventual manifest-shape contract. This part edits `module.lowdefy.yaml` progressively (same pattern parts 4 / 15 / 17 / 18 / 19 have followed); Part 20 will reconcile.
- **[Part 22](../22-workflows-e2e-suite/design.md)** picks up `group-overview.spec.js` as part of its e2e authoring contract.
