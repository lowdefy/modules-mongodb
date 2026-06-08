# Part 46 — Debundle workflow config + consolidate action reads server-side

Several client surfaces read workflow config at runtime or re-derive access/display logic client-side — two of them embed the **entire authored config** (forms, hook routines, access maps, all workflows) into their built page JSON just to display a few titles and icons, and every action detail surface re-computes per-verb access in a client-side `_js` mirror of the engine's gate. At the target scale (~100 workflows in a production app) the embeds put the whole config on every entity page. This part moves all client config reads **and** the client-side verb/button computation server-side: **four** read methods on the `workflow-api` connection return display-ready, access-resolved data (titles, group display, form metadata, per-verb access, per-signal button booleans), every client config embed is deleted, and the client verb mirror is retired. Clients render dumb — they display what the API returns and compute nothing about access or visibility.

**Layer:** engine plugin (new read methods) + module read APIs + the pages/components/templates that embed config or compute access. **Size:** L–XL. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Proposed change

1. **Four engine read methods** on the `WorkflowAPI` connection — `GetEntityWorkflows`, `GetWorkflowOverview`, `GetActionGroupOverview`, and `GetAction`. The first three replace the raw MongoDB aggregations behind the module's three overview read APIs; `GetAction` backs the detail-page action read (today the trivial `requests/get_action.yaml`). Each runs the doc read and joins display config + resolves per-verb access in JS from the connection's `workflowsConfig` and the action doc; `GetAction` additionally resolves per-signal button visibility (the detail surfaces are the only ones that render signal buttons).
2. **Endpoint/request contracts are kept.** The three overview endpoints keep their ids and contracts (`get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`); each routine becomes a single engine-method call. `get_action` keeps its id and payload but routes to the `WorkflowAPI` connection (`GetAction`) instead of a raw `MongoDBAggregation`. Responses are extended with the display + access fields clients currently derive themselves.
3. **All client config embeds and the client verb mirror are deleted**: the raw `_module.var: workflows_config` reads in `actions-on-entity.yaml` and `workflow-group-overview.yaml`, the all-workflows titles map (`components/workflows_config.yaml`), the all-workflows form-metadata component (`components/action_form_configs.yaml` + `makeActionFormConfigs.js`), **and `components/action_role_check.yaml`** (the `evaluateVerbGate.js` mirror inlined into client `_js`). The build-time `enums/button_signal_sources.yaml` `_ref` leaves the form templates and the simple surface — the FSM source-stage check moves server-side.
4. **The validated config gains two fields and absorbs the form button opt-out**: workflow-level `title` (added to `WORKFLOW_FIELDS`); per-action computed `form_meta` (the `makeActionFormConfigs` projection, computed during validation); and the **form** per-instance button opt-out (`page_config.buttons.{signal}.visible`) migrates off the generated pages into validated config so `GetAction` can apply it. (`allow_not_required` is already validated per Part 40; the **simple** kind has no per-action button map — Part 40 D3.)
5. **Access and buttons are resolved server-side to final answers.** `GetAction` returns the per-verb access bag (`action_allowed: { view, edit, review, error }`) and per-signal button booleans (`buttons: { submit: true, approve: false, … }`) — the latter combining the FSM source-stage check, the per-verb role gate, `allow_not_required`, and (form) the authored opt-out (D5). The three overview methods return per-verb access (`visible_verbs`) as they do today. Clients render the booleans; the client verb mirror is retired and verb/button policy lives in one engine JS implementation beside `evaluateVerbGate`/`gateAllows` (D2).

After this part, **no client artifact reads per-workflow config at runtime, and no client computes access or visibility** — runtime pages render from API responses. The two intended exceptions are deliberate and out of scope: build-time generation (`makeActionPages` bakes per-action slices into the generated action pages, D4) and app-level vars (`app_name`). The rule for every future *runtime* config or access crumb is: *if a page needs config or an access answer at runtime, the API that feeds the page returns it.* This is also the seam for dynamic/versioned config (D7) and makes bespoke/custom action pages trivial: call `GetAction`, render.

## Key decisions

### D1 — Server-side read-time config, not build-time projections or render-on-write

Three mechanisms were considered for getting display config (titles, group icons/order, form metadata, button visibility) to clients:

- **Build-time projection components** (extend the titles-map pattern): small all-workflows maps embedded in pages. Rejected: still ships *all* workflows' crumbs to every page (~20–40KB at 100 workflows, growing with each one), and keeps the per-crumb fork ("raw embed vs curated slice") alive for every future read.
- **Render-on-write** (extend the `message`/`status_title`/`links` precedent): engine stamps display data onto docs at write time. Rejected: a config edit (rename a group title, change an icon) doesn't propagate to live docs without a data migration; every future display field becomes an engine write change + migration.
- **Server-side at read time** (extend the Part 42 `resolve_action_link` precedent): the APIs that already return exactly the right workflows/actions attach the display fields and access answers. **Chosen**: payload is right-sized automatically (an entity page with 2 workflows gets 2 workflows' display data, never 100), config changes propagate on rebuild with no migrations, and it closes the fork permanently.

### D2 — Engine read methods (a port to one implementation), not pipeline-baked maps or a client mirror

The display join + access/visibility resolution lives in **connection methods in JS**, not YAML aggregation stages and not a client `_js` mirror, because:

- The connection **already holds the validated config** (`workflow-api.yaml:11`) and the entry id for building page links (`entry_id`, `workflow-api.yaml:6`) — no map duplication across pipelines.
- The read-side YAML stages (`visible_verbs.yaml`, `resolve_action_link.yaml`) **and** the client mirror (`action_role_check.yaml`, which inlines `evaluateVerbGate.js` because Lowdefy `_js` can't import it) are three re-implementations of one verb/link policy.
- **This is a port, not reuse.** The plugin today has only the per-gate primitive `gateAllows` (`loadWorkflowState.js:28`); the four-key `visible_verbs` bag builder, the `_user.apps.{app}.roles` extraction, and the `edit > review > error > view` link collapse (currently the `$switch` in `resolve_action_link.yaml:31–61` — `computeEngineLinks` returns the per-verb *map*, not the collapse) must be **ported into new plugin JS**. The size estimate (L–XL) prices the port plus the button resolution plus the form-template/surface rewrites, not "reuse."
- Once ported, all reads + the submit-time gate share **one** verb/button implementation, and the client mirror is **deleted** — delivering the "one correct way" consolidation. The only remaining copy is the YAML stages kept for the timeline path (D6), deleted when that follow-up lands.
- **The connection is the future seam for dynamic config.** DB-stored, versioned, CMS-managed config is on the horizon (Non-goals/D7). With every client read going through engine methods, swapping the config source is a change *inside the connection* — zero client surfaces, zero API contracts touched.

### D3 — The connection keeps the full validated config (the stub's Direction 2 is dropped)

The exploration stub proposed moving config off the connection onto per-endpoint properties. Verified facts killed it:

- The connection copy is **server-side only and already pruned** — `makeWorkflowsConfig.js` picks `ACTION_FIELDS`/`WORKFLOW_FIELDS`; authored hook routines, forms, events never reach it (the stub's exposure claim was wrong for the connection; it is only true for the client raw embeds). The one routine class that does ride it is group `on_complete` (inside `action_groups`, picked whole) — server-side, by design.
- The submit "slice" is irreducibly the whole workflow: `planSubmit`/`planAutoUnblock`/`planWorkflowRecompute` need every sibling action's `blocked_by`/`action_group` plus `action_groups` for group-completion fixpoints.
- `StartWorkflow`/`CancelWorkflow`/`CloseWorkflow` ride generic endpoints called with `workflow_type` in the payload by data-driven callers; per-workflow variants would force every generic caller to construct endpoint ids from runtime data.

Validate-once on the connection, look up per request, is the correct server-side shape — not a bundling smell. The stub's OQ6 (validation seam) dissolves: `validated_workflows_config.yaml` keeps riding the connection `_ref`.

### D4 — Shared overview pages stay (the stub's Direction 1 is dropped)

Per-workflow generated `{workflow_type}-overview` pages were proposed to shrink the shared pages' embeds. With D1/D2 the embeds die instead, and the shared `workflow-overview` / `workflow-group-overview` pages become config-free. Per-workflow pages would buy nothing while costing ~100 generated pages at scale, making every fixed-id link surface type-dependent (`computeEngineLinks` tracker links, `actions-on-entity`'s overview button, group back-links), and creating a persisted-`links` migration problem for live docs. The stub's OQ5 dissolves — links keep pointing at the fixed page ids. The per-*action* generated pages (`makeActionPages`) are genuinely per-action and stay as they are.

### D5 — Buttons resolved server-side to final booleans (all three dimensions)

Button visibility is the AND of three dimensions (Part 40 D2 / Part 39 D3):

1. **FSM source-stage** — a signal shows only from a stage it can fire from: `submit`/`progress`/`not_required` at `action-required`/`in-progress`/`changes-required`, `approve`/`request_changes` at `in-review`, `resolve_error` at `error`. This is the dominant term and is derivable from the engine's authoritative FSM table (Part 38) — no separate client enum needed server-side.
2. **Per-verb role gate** — `action_allowed.{verb}` for the signal's required verb (Part 34 D6/D8).
3. **`allow_not_required`** — for the `not_required` signal only (doc-borne, engine-enforced; Part 40 D3); and for **form** actions, the authored per-instance opt-out (`page_config.buttons.{signal}.visible`, Part 39 D3 — now in validated config, point 4).

`GetAction` collapses all of these per action into final per-signal booleans (`buttons: { submit: true, cancel: false, … }`); the client renders dumb buttons. Same move Part 42 made for links (server collapses, client renders). This retires the client mirror and the build-time FSM `_ref` from the surfaces. It is the mechanism Part 40 was blocked on (its OQ4): there is **no** client button map (so review-2 #2's "read the map raw" is moot) and **no** cross-workflow `action.type` collision (review-2 #6) because the server resolves per workflow per action. Part 40 is re-sequenced to consume this contract — it is paused until this part lands (Ripples).

### D6 — Timeline lookup port is deferred

`timeline_action_lookup.yaml` (Part 42's events-timeline enrichment) is the fourth consumer of the read-side YAML stages. Porting it to an engine method is the same consolidation but expected to be hairy (events aggregation + action enrichment interleave). **Deferred to a separate follow-up step, not bundled with this part's definite work.** Consequence: `visible_verbs.yaml` and `resolve_action_link.yaml` stay alive *solely* for the timeline path and are deleted when that follow-up lands. Until then the verb/link logic exists in both YAML (timeline only) and the new plugin JS (everything else) — the **last** remaining duplication after this part retires the client mirror; accepted, flagged as debt.

### D7 — Dynamic (DB-stored, versioned) workflow config is out of scope, on the horizon

CMS-managed workflows and config versioning (in-flight workflows pinned to the config version they started under) are a real future direction at 100 workflows — versioning in particular solves a problem that exists today (config v2 deploys while v1 workflows are in flight). The realistic split when it comes: **structure is data** (actions, groups, titles, access, status_map, form field specs — DB, versioned, CMS-edited), **behavior is code** (hook routines, custom components — repo, referenced by name). Nothing in this part builds toward it except D2's seam choice. Recorded so the next design doesn't rediscover the fork.

### D8 — `GetAction`: consolidate the detail-page read; clients render dumb

`get_action` today is a trivial `$match` on `actions-collection` (`requests/get_action.yaml`); the "logic" on the detail path is **not** in MongoDB — it is the client `_js` mirror (`action_role_check.yaml`) plus the per-button visibility AND baked into the form templates (`enums/button_signal_sources.yaml` `_ref` + `action_allowed` + opt-out) and the Part 40 simple surface. Routing `get_action` through the `WorkflowAPI` connection (`GetAction`) lets the engine return the action doc **+ resolved `action_allowed`** (the per-verb bag) **+ resolved `buttons`** (per-signal booleans, D5). Consequences:

- The form per-instance opt-out migrates from baked generated pages into validated config (point 4).
- `action_role_check.yaml` is deleted; every `_state.action_allowed.*` consumer (button gates, edit-nav `Link`s, other gating) reads the response field instead — audit all consumers.
- The form templates (Part 39, shipped) have their button bars rewritten to consume `action.buttons.{signal}`; the Part 40 simple surface is built to consume them from the start.
- **Part 40 now depends on Part 46** and is paused until this lands (Ripples).
- Bespoke/custom action pages become trivial — call `GetAction`, render the resolved doc/access/buttons with zero client logic. This is a concrete present win, not just the dynamic-config seam.

## Current state — the readers (verified)

| Reader | What it carries / computes today | What it actually uses |
| ------ | -------------------- | --------------------- |
| `components/actions-on-entity.yaml:76` (on **every entity page**) | entire authored config as a `_js` arg | `{group_id: {order, title, icon}}` + group-overview links for the entity's workflows |
| `pages/workflow-group-overview.yaml:110` | entire authored config as a `_js` arg | one group title |
| `components/workflows_config.yaml` (titles map) → `actions-on-entity:38`, `workflow-overview:76`, `workflow-group-overview:87` | `{type: {title}}` for all workflows | the title of the workflow(s) on screen |
| `components/action_form_configs.yaml` → `workflow-overview:297`, `workflow-group-overview:333` | form field metadata for **all** form actions (keyed `action.type`, cross-workflow collision-prone) | the on-screen workflow's actions' field titles/keys, to render submitted form data inline |
| `components/action_role_check.yaml` (on every action detail page) | client `_js` mirror of `evaluateVerbGate.js`; computes `action_allowed: {view,edit,review,error}` from the action doc's `access` map + `_user` roles | the per-verb bag the templates/surface read for button gates and nav links — **retired (D8)** |
| form templates (`edit`/`view`/`review`/`error`) + Part 40 simple surface | per-button visibility AND: `button_signal_sources.yaml` `_ref` (build-time FSM stages) + `action_allowed` + opt-out | which signal buttons to show — **resolved server-side (D5/D8)** |
| `requests/get_action.yaml` | trivial `$match` by `_id` on `actions-collection` | the action doc for the detail pages — **routes to `GetAction` (D8)** |
| `workflow-overview` / `workflow-group-overview` `entity_back_button` | `_module.var: entities` (host-app routing map) + `workflow.{entity_collection, entity_id}` (response) | the entity view page's `{page_id, id_query_key, title}` to build the back-link — **resolved server-side as `workflow.entity_link`; `entities` moves to the connection (D8 / "The read methods")** |
| `connections/workflow-api.yaml:11` | validated config (pruned: no hooks/forms/events) | engine runtime — **server-side, stays (D3)** |
| `module.lowdefy.yaml` → `makeWorkflowApis` / `makeActionPages` | full config at build | generated endpoints/pages baking per-action slices — **build-time, stays** |

The three overview read APIs (`get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`) are MongoDB aggregations that already return exactly the right docs per page, including server-side verb filtering and link selection via the shared YAML stages (`api/stages/visible_verbs_filter.yaml` → `modules/shared/workflow/{visible_verbs,resolve_action_link}.yaml`). The display config rides separately, client-side, sized "all workflows". The overview pages render **navigation links** to the action pages (`actions_list.$.link_button` → `action.link`), **not** signal buttons — signal buttons live only on the detail surfaces fed by `get_action`, which is why button resolution attaches to `GetAction` and not the three overview methods.

## The read methods

Four connection methods, mirroring the write methods' structure (`createEngineContext` → load → respond). Each:

1. Runs the doc read (the existing pipelines' match/lookup/group logic, ported to JS-built aggregations or JS post-processing — implementer's choice per method).
2. Evaluates per-user verb access and link selection in **new plugin JS** (the ported `visible_verbs` four-key bag, the `edit > review > error > view` link collapse) — replacing the YAML stages for these reads.
3. Joins display config from `context.workflowsConfig`:
   - `workflow.title` on each workflow,
   - `{ id, order, title, icon, link }` per action group (link = `workflow-group-overview` + urlQuery, built with `entry_id` exactly as `computeEngineLinks` builds page links),
   - `form_meta` per form action (overview methods, for inline submitted-data rendering),
   - `workflow.entity_link` (`{ pageId, urlQuery, title }`) for back-to-entity navigation (overview methods), resolved from the connection's **`entities` map** — configured per host app alongside `entry_id`/`app_name` — keyed by the workflow's `entity_collection` and filled with `entity_id`. This replaces the client-side `_module.var: entities` construction on the overview pages; the entity pages are the host app's, but the connection is configured per host app, so the routing map belongs on it (same kind as `entry_id`/`app_name`).
4. **`GetAction` only**: resolves `action_allowed` (the per-verb bag) and `buttons` (per-signal booleans, D5) from the action's current stage, the engine FSM table, the verb gate, `allow_not_required`, and the form opt-out.

The user (id/roles) reaches each method via a **connection-level `user: { _user: true }` property** — resolved per-request in the request context, exactly as `changeLog.meta.user` already is (`workflow-api.yaml:24`) — exposed as `context.user` and read against `context.connection.app_name` (`workflow-api.yaml:13`). The verb gate needs the per-app roles (`apps.{app_name}.roles`), extracted server-side. (No per-method `checkRead`/`checkWrite` meta: that optional Lowdefy read/write toggle doesn't fit a single connection that serves both reads and writes — see review-1 #4.)

Method ↔ endpoint mapping (endpoint/request ids, routes, and payloads unchanged):

| Endpoint / request | Method | Response additions |
| -------- | ------ | ------------------ |
| `get-entity-workflows` | `GetEntityWorkflows` | `workflow.title`; groups become `{id, order, title, icon, link, …summary}` |
| `get-workflow-overview` | `GetWorkflowOverview` | `workflow.title`; `workflow.entity_link`; group display fields; `action.form_meta` |
| `get-action-group-overview` | `GetActionGroupOverview` | `workflow.title`; `workflow.entity_link`; `group.title`/`icon` (preserving existing `group.{id, status, summary}` and per-action `{type, status, message, link, visible_verbs}`; **no `group.link`** — back-nav is the resolved `entity_link`, not a group self-link) |
| `get_action` (request) | `GetAction` | action doc + `action_allowed` (per-verb bag) + `buttons` (per-signal booleans) |

## Validated config additions (`makeWorkflowsConfig.js`)

- `WORKFLOW_FIELDS` + `title`.
- Per-action computed `form_meta`: the projection `makeActionFormConfigs.js` does today (component/key/required/title/validate over `form`/`form_review`/`form_error`, recursing structural components) moves into `makeWorkflowsConfig` and lands on each validated action. Because `pick(action, ACTION_FIELDS)` already runs per-workflow per-action, `form_meta` lands on the right action with no global keying — this dissolves the cross-workflow `action.type` collision (review-2 #6 / stub OQ2).
- The **form** per-instance button opt-out (`page_config.buttons.{signal}.visible`) migrates into validated config so `GetAction` can apply it server-side (D5/D8). The **simple** kind has no opt-out map (Part 40 D3); `allow_not_required` is already validated (Part 40). `action_groups` already rides whole (title/icon included) — no change needed there.

The connection config grows slightly (display strings + form metadata + the form opt-out); it is server-side only.

## What gets deleted

- `components/workflows_config.yaml` (titles map) and its three `_ref`s.
- `components/action_form_configs.yaml` + `resolvers/makeActionFormConfigs.js` and both page `_ref`s (overview pages read `action.form_meta` off the response instead).
- `components/action_role_check.yaml` (the `evaluateVerbGate.js` client mirror); every `_state.action_allowed.*` consumer reads the `GetAction` response instead (D8).
- The build-time `enums/button_signal_sources.yaml` `_ref` from the form templates and the simple surface (the FSM source-stage check is server-side now; the enum survives only if the engine reads it server-side rather than deriving stages from its FSM table — implementer's choice).
- The `_js` config-derivation blocks: `actions-on-entity.yaml:67–99` (renders `group.{order,title,icon,link}` from the response instead) and `workflow-group-overview.yaml:102–119` (reads `group.title` from the response).
- The `_module.var: entities` reads + client-side entity back-link construction on the overview pages (`workflow-overview` / `workflow-group-overview` `entity_back_button`) — the pages read the resolved `workflow.entity_link` instead. The `entities` map moves onto the connection config (per host app).
- The three overview read APIs' aggregation routines (replaced by engine-method calls) and the `MongoDBAggregation` body of `requests/get_action.yaml` (now a `GetAction` call). `api/stages/visible_verbs_filter.yaml` goes with the overview routines; `modules/shared/workflow/visible_verbs.yaml` and `resolve_action_link.yaml` **stay** for the timeline path only (D6).

Net client result: zero `_module.var: workflows_config` reads and zero client access/visibility computation outside build-time resolvers (`makeWorkflowApis`, `makeActionPages`, `validated_workflows_config`).

## Ripples

- **Part 39 (form-action submit buttons, shipped).** Its form template button bars are rewritten to consume `action.buttons.{signal}` resolved booleans from `GetAction` instead of computing the visibility AND client-side; the per-instance opt-out map migrates from the generated pages into validated config (point 4). This touches shipped code — sequenced into this part's files-changed.
- **Part 40 (simple-action surfaces).** OQ4 is resolved here (D5). Its button design (D3's authored-map debate, D5, review-2 #2/#6) is **superseded** — the simple surface consumes `action.buttons`/`action_allowed` from the response. **Part 40 now depends on Part 46 and is paused until this lands**; on resume its surviving work (shared surface/modal, selector→signal migration, `allow_not_required` authoring + engine load-gate, error recovery, modal/timeline composition) builds on the clean contract and gets simpler. The `allow_not_required` **engine enforcement** stays in Parts 38/40 — only the client display read moves into `GetAction`'s button resolution.
- **Part 42 (timeline action cards).** Unaffected now; its YAML stages are the D6 deferred port.
- **Part 47 (per-workflow submit endpoints).** Independent sibling part split out of this exploration — see Related.

## Non-goals

- **Dynamic / DB-stored / versioned workflow config and a workflow CMS** (D7) — explicitly out of scope; this part only shapes the seam.
- **Porting the timeline lookup** (D6) — separate follow-up step.
- **Submit endpoint collapse** — Part 47.
- **Per-workflow overview pages, per-workflow Start/Cancel/Close endpoints, config off the connection** — considered and rejected (D3, D4).

## Related

- [Part 47 — Per-workflow submit endpoints](../47-per-workflow-submit-endpoints/design.md) — sibling part from the same exploration; server/build-side endpoint-count scaling.
- [Part 40 — Simple-action surfaces](../40-simple-action-surfaces/design.md) — paused; re-sequenced to depend on and consume this part's `GetAction` contract (D5/D8, Ripples).
- [Part 39 — Form submit buttons](../_completed/39-form-submit-buttons/design.md) — shipped; its form template button bars are rewritten here to consume server-resolved buttons (Ripples).
- [Part 42 — Timeline action cards](../_completed/42-timeline-action-cards/design.md) — the server-side selection precedent D1 extends; owner of the YAML stages D6 leaves in place.
- [Part 38 — Engine rebuild](../_completed/38-engine-rebuild/design.md) — `evaluateVerbGate` / `computeEngineLinks` / `gateAllows` and the FSM table the read methods reuse and port.
- [Part 34 — Action access model](../_completed/34-action-access-model/design.md) — verb vocabulary and access grammar the resolved buttons/access build on.
