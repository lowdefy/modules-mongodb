# Part 46 — Debundle workflows_config (client-side)

Several client surfaces embed workflow config into their built page JSON at build time — two of them embed the **entire authored config** (forms, hook routines, access maps, all workflows) just to display a few titles and icons. At the target scale (~100 workflows in a production app) this puts the whole config on every entity page in the app. This part moves all client config reads server-side: new read methods on the `workflow-api` connection return display-ready data, and every client config embed is deleted.

**Layer:** engine plugin (new read methods) + module read APIs + the pages/components that embed config. **Size:** M–L. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Proposed change

1. **Three engine read methods** on the `WorkflowAPI` connection — `GetEntityWorkflows`, `GetWorkflowOverview`, `GetActionGroupOverview` — replace the raw MongoDB aggregations behind the module's three read APIs. Each runs the doc read and joins display config (workflow title, group display fields, per-action form metadata, resolved button visibility) in JS from the connection's `workflowsConfig`.
2. **The module's three read API endpoints keep their ids and contracts** (`get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`); each routine becomes a single engine-method call. Responses are extended with the display fields clients currently derive from embedded config.
3. **All client config embeds are deleted**: the raw `_module.var: workflows_config` reads in `actions-on-entity.yaml` and `workflow-group-overview.yaml`, the all-workflows titles map (`components/workflows_config.yaml`), and the all-workflows form-metadata component (`components/action_form_configs.yaml` + `makeActionFormConfigs.js`, whose projection logic moves into `makeWorkflowsConfig`).
4. **The validated config gains three fields**: workflow-level `title` (added to `WORKFLOW_FIELDS`), per-action `buttons` (added to `ACTION_FIELDS`), and per-action computed `form_meta` (the `makeActionFormConfigs` projection, computed during validation).
5. **Button visibility is resolved server-side**: read methods return final per-signal booleans (`action.buttons.{signal}: true|false`) combining the authored opt-outs with the user's visible verbs — this is the mechanism Part 40's simple surface was blocked on (OQ4), and it overrules Part 40 review-2 #2/#6's proposed client-side read.

After this part, **no client artifact carries any workflow config** — pages render purely from API responses, and the rule for every future config crumb is: *if a page needs config at runtime, the API that feeds the page returns it.*

## Key decisions

### D1 — Server-side read-time config, not build-time projections or render-on-write

Three mechanisms were considered for getting display config (titles, group icons/order, form metadata, button visibility) to clients:

- **Build-time projection components** (extend the titles-map pattern): small all-workflows maps embedded in pages. Rejected: still ships *all* workflows' crumbs to every page (~20–40KB at 100 workflows, growing with each one), and keeps the per-crumb fork ("raw embed vs curated slice") alive for every future read.
- **Render-on-write** (extend the `message`/`status_title`/`links` precedent): engine stamps display data onto docs at write time. Rejected: a config edit (rename a group title, change an icon) doesn't propagate to live docs without a data migration; every future display field becomes an engine write change + migration.
- **Server-side at read time** (extend the Part 42 `resolve_action_link` precedent): the APIs that already return exactly the right workflows/actions attach the display fields. **Chosen**: payload is right-sized automatically (an entity page with 2 workflows gets 2 workflows' display data, never 100), config changes propagate on rebuild with no migrations, and it closes the fork permanently.

### D2 — Engine read methods, not pipeline-baked maps

The display join could have stayed in the YAML aggregations (a build-time `$literal` config map `_ref`'d into each pipeline). Chosen instead: **connection methods in JS**, because:

- The connection **already holds the validated config** (`workflow-api.yaml:11`) and the entry id for building page links (`entry_id`, `workflow-api.yaml:6`) — no map duplication across three pipelines.
- The read-side YAML stages (`visible_verbs.yaml`, `resolve_action_link.yaml`) are **re-implementations in aggregation YAML of logic the plugin already has in JS** (`evaluateVerbGate.js`, `computeEngineLinks.js`). Moving reads into the engine consolidates verb/link/button policy to one implementation. ("One correct way.")
- **The connection is the future seam for dynamic config.** DB-stored, versioned, CMS-managed workflow config is on the horizon (see Non-goals). With every client read going through engine methods, swapping the config source (build-baked YAML → versioned collection) is a change *inside the connection* — zero client surfaces, zero API contracts touched. This part does nothing for dynamic config except deliberately not foreclosing it.

### D3 — The connection keeps the full validated config (the stub's Direction 2 is dropped)

The exploration stub proposed moving config off the connection onto per-endpoint properties. Verified facts killed it:

- The connection copy is **server-side only and already pruned** — `makeWorkflowsConfig.js` picks `ACTION_FIELDS`/`WORKFLOW_FIELDS`; authored hook routines, forms, events never reach it (the stub's exposure claim was wrong for the connection; it is only true for the client raw embeds). The one routine class that does ride it is group `on_complete` (inside `action_groups`, picked whole) — server-side, by design.
- The submit "slice" is irreducibly the whole workflow: `planSubmit`/`planAutoUnblock`/`planWorkflowRecompute` need every sibling action's `blocked_by`/`action_group` plus `action_groups` for group-completion fixpoints.
- `StartWorkflow`/`CancelWorkflow`/`CloseWorkflow` ride generic endpoints called with `workflow_type` in the payload by data-driven callers; per-workflow variants would force every generic caller to construct endpoint ids from runtime data.

Validate-once on the connection, look up per request, is the correct server-side shape — not a bundling smell. The stub's OQ6 (validation seam) dissolves: `validated_workflows_config.yaml` keeps riding the connection `_ref`.

### D4 — Shared overview pages stay (the stub's Direction 1 is dropped)

Per-workflow generated `{workflow_type}-overview` pages were proposed to shrink the shared pages' embeds. With D1/D2 the embeds die instead, and the shared `workflow-overview` / `workflow-group-overview` pages become config-free. Per-workflow pages would buy nothing while costing ~100 generated pages at scale, making every fixed-id link surface type-dependent (`computeEngineLinks` tracker links, `actions-on-entity`'s overview button, group back-links), and creating a persisted-`links` migration problem for live docs. The stub's OQ5 dissolves — links keep pointing at the fixed page ids. The per-*action* generated pages (`makeActionPages`) are genuinely per-action and stay as they are.

### D5 — Buttons resolved server-side to final booleans

The simple surface's "show this button?" answer combines authored opt-outs (`buttons.{signal}.visible`) with user access (visible verbs). The read methods return the combined answer per action — `buttons: { submit: true, cancel: false }` — rather than the raw authored map. Same move Part 42 made for links (server collapses, client renders). Policy lives in one JS function next to `evaluateVerbGate`; the cross-workflow `action.type` collision (Part 40 review-2 #6) can't occur because the server resolves per workflow.

### D6 — Timeline lookup port is deferred

`timeline_action_lookup.yaml` (Part 42's events-timeline enrichment) is the fourth consumer of the read-side YAML stages. Porting it to an engine method is the same consolidation but expected to be hairy (events aggregation + action enrichment interleave). **Deferred to a separate follow-up step, not bundled with this part's definite work.** Consequence: `visible_verbs.yaml` and `resolve_action_link.yaml` stay alive *solely* for the timeline path and are deleted when that follow-up lands. Until then the verb/link logic exists in both YAML (timeline only) and JS (everything else) — accepted, flagged as debt.

### D7 — Dynamic (DB-stored, versioned) workflow config is out of scope, on the horizon

CMS-managed workflows and config versioning (in-flight workflows pinned to the config version they started under) are a real future direction at 100 workflows — versioning in particular solves a problem that exists today (config v2 deploys while v1 workflows are in flight). The realistic split when it comes: **structure is data** (actions, groups, titles, access, status_map, form field specs — DB, versioned, CMS-edited), **behavior is code** (hook routines, custom components — repo, referenced by name). Nothing in this part builds toward it except D2's seam choice. Recorded so the next design doesn't rediscover the fork.

## Current state — the readers (verified)

| Reader | What it carries today | What it actually uses |
| ------ | -------------------- | --------------------- |
| `components/actions-on-entity.yaml:76` (on **every entity page**) | entire authored config as a `_js` arg | `{group_id: {order, title, icon}}` + group-overview links for the entity's workflows |
| `pages/workflow-group-overview.yaml:110` | entire authored config as a `_js` arg | one group title |
| `components/workflows_config.yaml` (titles map) → `actions-on-entity:38`, `workflow-overview:76`, `workflow-group-overview:87` | `{type: {title}}` for all workflows | the title of the workflow(s) on screen |
| `components/action_form_configs.yaml` → `workflow-overview:297`, `workflow-group-overview:333` | form field metadata for **all** form actions (keyed `action.type`, cross-workflow collision-prone) | the on-screen workflow's actions' field titles/keys, to render submitted form data inline |
| `connections/workflow-api.yaml:11` | validated config (pruned: no hooks/forms/events) | engine runtime — **server-side, stays (D3)** |
| `module.lowdefy.yaml` → `makeWorkflowApis` / `makeActionPages` | full config at build | generated endpoints/pages baking per-action slices — **build-time, stays** |

The three read APIs (`get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`) are MongoDB aggregations that already return exactly the right docs per page, including server-side verb filtering and link selection via the shared YAML stages (`api/stages/visible_verbs_filter.yaml` → `modules/shared/workflow/{visible_verbs,resolve_action_link}.yaml`). The display config rides separately, client-side, sized "all workflows".

## The read methods

Three connection methods, mirroring the write methods' structure (`createEngineContext` → load → respond). Each:

1. Runs the doc read (the existing pipelines' match/lookup/group logic, ported to JS-built aggregations or JS post-processing — implementer's choice per method).
2. Evaluates per-user visible verbs and link selection with the existing JS (`evaluateVerbGate`, the `edit > review > error > view` collapse) — replacing the YAML stages for these three reads.
3. Joins display config from `context.workflowsConfig`:
   - `workflow.title` on each workflow,
   - `{ id, order, title, icon, link }` per action group (link = `workflow-group-overview` + urlQuery, built with `entry_id` exactly as `computeEngineLinks` builds page links),
   - `form_meta` per form action (see below),
   - `buttons` per action — resolved per-signal booleans (D5).

The user (id/roles) reaches the method via endpoint properties (`_user`), as `changeLog.meta.user` already does on the connection.

Method ↔ endpoint mapping (endpoint ids, routes, and payloads unchanged):

| Endpoint | Method | Response additions |
| -------- | ------ | ------------------ |
| `get-entity-workflows` | `GetEntityWorkflows` | `workflow.title`; groups become `{id, order, title, icon, link, …summary}`; `action.buttons` |
| `get-workflow-overview` | `GetWorkflowOverview` | `workflow.title`; group display fields; `action.form_meta`; `action.buttons` |
| `get-action-group-overview` | `GetActionGroupOverview` | `workflow.title`; `group.title`/`icon`; `action.form_meta`; `action.buttons` |

## Validated config additions (`makeWorkflowsConfig.js`)

- `WORKFLOW_FIELDS` + `title`.
- `ACTION_FIELDS` + `buttons` (Part 40's authored opt-outs; validate shape: `{signal}: { visible: boolean }` against known signals).
- Per-action computed `form_meta`: the projection `makeActionFormConfigs.js` does today (component/key/required/title/validate over `form`/`form_review`/`form_error`, recursing structural components) moves into `makeWorkflowsConfig` and lands on each validated action. `action_groups` already rides whole (title/icon included) — no change needed there.

The connection config grows slightly (display strings + form metadata); it is server-side only.

## What gets deleted

- `components/workflows_config.yaml` (titles map) and its three `_ref`s.
- `components/action_form_configs.yaml` + `resolvers/makeActionFormConfigs.js` and both page `_ref`s (overview pages read `action.form_meta` off the response instead).
- The `_js` config-derivation blocks: `actions-on-entity.yaml:67–99` (renders `group.{order,title,icon,link}` from the response instead) and `workflow-group-overview.yaml:102–119` (reads `group.title` from the response).
- The three read APIs' aggregation routines (replaced by engine-method calls). `api/stages/visible_verbs_filter.yaml` goes with them; `modules/shared/workflow/visible_verbs.yaml` and `resolve_action_link.yaml` **stay** for the timeline path only (D6).

Net client result: zero `_module.var: workflows_config` reads outside build-time resolvers (`makeWorkflowApis`, `makeActionPages`, `validated_workflows_config`).

## Ripples

- **Part 40 (simple-action surfaces).** OQ4 is resolved: the surface reads `action.buttons.{signal}` resolved booleans from the API response. This **overrules review-2 #2's recommendation** (read `_module.var: workflows_config` raw in the surface — the exact pattern this part deletes) and moots review-2 #6 (type-collision). Part 40's design needs a ripple edit citing this part; this part should land its read methods before Part 40's surface implementation.
- **Part 42 (timeline action cards).** Unaffected now; its YAML stages are the D6 deferred port.
- **Part 47 (per-workflow submit endpoints).** Independent sibling part split out of this exploration — see Related.

## Non-goals

- **Dynamic / DB-stored / versioned workflow config and a workflow CMS** (D7) — explicitly out of scope; this part only shapes the seam.
- **Porting the timeline lookup** (D6) — separate follow-up step.
- **Submit endpoint collapse** — Part 47.
- **Per-workflow overview pages, per-workflow Start/Cancel/Close endpoints, config off the connection** — considered and rejected (D3, D4).

## Related

- [Part 47 — Per-workflow submit endpoints](../47-per-workflow-submit-endpoints/design.md) — sibling part from the same exploration; server/build-side endpoint-count scaling.
- [Part 40 — Simple-action surfaces](../40-simple-action-surfaces/design.md) — review-2 #2/#6 resolved by D5 (see Ripples).
- [Part 42 — Timeline action cards](../_completed/42-timeline-action-cards/design.md) — the server-side selection precedent D1 extends; owner of the YAML stages D6 leaves in place.
- [Part 38 — Engine rebuild](../_completed/38-engine-rebuild/design.md) — `evaluateVerbGate` / `computeEngineLinks`, the JS logic the read methods reuse.
- [Part 34 — Action access model](../_completed/34-action-access-model/design.md) — verb vocabulary and access grammar the resolved buttons build on.
