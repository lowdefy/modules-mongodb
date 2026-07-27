# Review 2

Review-1's findings are all resolved/rejected and the design now reflects them (the `entity: { id, ...routineResult }` merge, the dropped `GetEntityWorkflows` call, the narrowed shell gate, the enumerated template edit sites). This pass verifies the rewritten design against the codebase and finds a correctness bug in the merge order, a docs gap, and two accuracy issues.

## Correctness

### 1. The `entity` merge order contradicts the "module-injected `id` wins" guarantee — a host that returns `id` clobbers the instance id and regresses `set_entity_id`

> **Resolved (auto).** Confirmed: JS object-spread lets later keys win, so `{ id, ...data }` lets a host-returned `id` override the instance id — contradicting the design's own "injects it last and it wins" guarantee and re-opening the review-1 #1 shell-regression class. Reordered the code literals (line 134 → `{ ...(data ?? {}), id: <doc>.entity.id }`; line 202 → `entity: { ...routineResult, id }`) and rewrote the reserved-keys prose (line 42) so the module mechanically wins and "hosts must not author `id`" becomes a non-issue rather than a rule to remember.

The design states the module's injected `id` is authoritative:

> line 42: "Hosts must not author their own `id` — the module injects it **last** and it wins."

But every code literal injects `id` **first** and spreads the routine result **last**:

- line 134: `return { …action, entity_link, entity: { id: <doc>.entity.id, ...(data ?? {}) } }`
- line 202: "`GetWorkflowAction` returns `entity: { id, ...routineResult }`"

In JS object-spread, later keys win. `{ id: X, ...data }` means **`data.id` overrides `X`** — the opposite of the stated guarantee. So if a host's routine returns an `id` key (accidentally, or because they `:return` the whole entity doc whose `_id`/`id` they aliased), `get_workflow_action.entity.id` becomes the host's value, not `<doc>.entity.id`. That feeds `set_entity_id` (`view.yaml.njk:131-135` and the other templates) and the ~9 `entity.id` reads in `action.yaml.njk` — i.e. it re-opens exactly the shell-regression class review-1 #1 worked to close, just through a different door.

This is the single most load-bearing invariant in the part (the whole resolution of review-1 #1 rests on `entity.id` always being the instance id), and the spec as written ships it wrong.

**Fix:** reorder so the injected `id` genuinely comes last: `entity: { ...(data ?? {}), id: <doc>.entity.id }`. Update lines 134 and 202 (and the prose at line 13 / line 42 so prose and code agree). This also makes "hosts must not author `id`" a _non-issue_ rather than a _rule the host must remember_ — the module mechanically wins, matching the "one correct way / enforce it mechanically" principle.

## Docs

### 2. `name_field` and the breadcrumb-name behavior are documented in two hand-authored docs the design never updates

> **Resolved.** Confirmed `name_field` is described in `authoring-grammar.md:32` and `action-pages.md:55`/`:78`, none of which `pnpm docs:gen` regenerates. Added both files to the files-changed list with the specific edits (drop `name_field`, document `entity.data` + its reserved `name` key, update the slot example to read `get_workflow_action.entity.<field>`), and expanded the "Manifest & docs" section to call out the hand-authored pages explicitly since `docs:check` won't catch them.

The "Manifest & docs (Part 20)" section (line 192) and the files-changed entry (line 204) only touch `module.lowdefy.yaml` + the **generated** `vars.md`. But `name_field` and the instance-name breadcrumb behavior — both removed/replaced by this part — are documented in **hand-authored** pages that `pnpm docs:gen` does not regenerate:

- `docs/workflows/reference/authoring-grammar.md:32` — the `entity:` block lists `name_field: <dot-path> # ... adds "· {name}" to the breadcrumb`.
- `docs/workflows/concepts/action-pages.md:55` — the `entity_view` slot example shows `name_field: company_name # breadcrumb shows "Lead · Acme Co"`.
- `docs/workflows/concepts/action-pages.md:78` — Breadcrumbs section: "when the workflow's `entity.name_field` is set, the instance name is appended after a `·`."

Per CLAUDE.md, `docs/` is the source of truth for consumer-observable behavior; leaving these describing a deleted field is stale-doc drift, and `pnpm docs:check` won't catch it (it only enforces `vars.md` + front-matter). These pages must be updated to: drop `name_field`, document `entity.data` (optional inline routine; reserved `name` key drives the breadcrumb instance name), and — for the slot example — note that slot blocks now read `get_workflow_action.entity.<field>` rather than the (deleted) baked entity request.

**Fix:** add `docs/workflows/reference/authoring-grammar.md` and `docs/workflows/concepts/action-pages.md` to the files-changed list with the specific edits above.

### 3. DataDescriptions `entity.*` field keys are **not** "unchanged" — they take the same `.0`-drop migration the design prescribes for the slot

> **Resolved (auto).** Verified: `get_entity` is a `MongoDBAggregation` (array), and `DataDescriptions` resolves keys via `get(data, item.key)` (dot-path), so a working entity field key today is `entity.0.<field>`. Against the new object it becomes `entity.<field>` — the same `.0`-drop migration as the slot. Replaced "resolve unchanged" at consolidation §2 with the explicit `.0`-drop note, matching §3.

Line 155 says of the `DataDescriptions` summary: "Field configs keyed `entity.<field>` resolve **unchanged** against that object." That's inconsistent with line 156, which correctly says the slot's reads change shape ("the result is now an **object**, not a single-element array, so authors drop the `.0`"). Both consume the _same_ array→object change, so both migrate the same way.

Verified: `DataDescriptions` resolves a field by `get(data, item.key)` (`plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/helpers/processConfigItems.js:75`), a dot-path lookup. Today `data.entity` = `_request: get_entity`, and `get_entity` is a `MongoDBAggregation` (`requests/get_entity.yaml.njk`) → an **array** `[{…}]`. So a working entity field key today must be `entity.0.<field>` (`get(data, "entity.email")` on an array is `undefined`). After the change `data.entity` is the object `{ id, ...routineResult }`, so the key becomes `entity.<field>` — a real change, identical to the slot's.

The demo has no `entity.*` DataDescriptions field keys (only `form.*`), so the demo migration won't surface this — but the consumer contract does change, and the design currently tells hosts the opposite.

**Fix:** replace "resolve unchanged" at line 155 with the same `.0`-drop note as the slot (any pre-existing `entity.0.<field>` DataDescriptions key drops the `.0` → `entity.<field>`), so §2 and §3 of "Action-page consolidation" describe one consistent migration.

## Accuracy / specification

### 4. There is no "second DataDescriptions read in `view`/`review`"

> **Resolved (auto).** Confirmed each of `view`/`review` has exactly one DataDescriptions entity read and `edit`/`error`/`action` have zero. Dropped the "(and the second read in `view`/`review`)" parenthetical at line 200 and noted the repoint applies only to `view`/`review` (edit/error/action carry the entity via the slot).

The templates files-changed bullet (line 200) says to "repoint the `DataDescriptions` `data.entity` read **(and the second read in `view`/`review`)**". There is no second read: `view.yaml.njk` has exactly one (`:200`) and `review.yaml.njk` has exactly one (`:208`); `edit`/`error`/`action` have **zero** DataDescriptions entity reads (verified: `grep -c '_request: get_entity$'` → view 1, review 1, edit 0, error 0, action 0). The parenthetical will send the implementer hunting for an edit site that doesn't exist.

**Fix:** drop the "(and the second read in `view`/`review`)" parenthetical. While there, note the DataDescriptions repoint applies **only to `view` and `review`** (edit/error/action carry the entity surface via the slot, not DataDescriptions) — consistent with consolidation §2 ("`view`/`review` templates").

### 5. Re-source the breadcrumb `entity_name` var; don't hard-code a state path inside the shared component

> **Resolved.** Confirmed `action-breadcrumbs.yaml` takes `entity_name` as an injected `_var` (sibling to `entity_title`/`entity_page_id`/`entity_url_query`) with an `entity_name`-or-`entity_title` fallback. Resolved as recommended: each template re-sources the `entity_name` var from `_request: get_entity.0.{name_field}` to `_state: action.entity_link.name` (mirroring `entity_title`), and the component takes **no functional change** (just a stale header-comment refresh). Note: the review's secondary justification ("keeps it reusable by the Part 63 overview pages") was dropped — Part 63's open question #1 leans toward a **separate runtime breadcrumb fragment** for the overview pages (build-time-baked + `_build.if` action trail vs runtime `_array.concat`/`_if` overview trail), so this component is not shared with them. The resolution stands purely on the `_var` contract across the five action-page templates that do share it.

Line 201 says `action-breadcrumbs.yaml`'s "entity-crumb name reads `entity_link.name` (no longer an `entity_name` var)", and line 200(c) deletes the templates' `entity_name` var block. But `action-breadcrumbs.yaml` is a **shared component whose contract is that each template supplies its own state-path operators via `_var`** (component header, `action-breadcrumbs.yaml:20-21`): the entity crumb already takes `entity_title`, `entity_page_id`, `entity_url_query`, `entity_name` as injected operators, with the templates sourcing e.g. `entity_title: { _state: action.entity_link.title }` (`view.yaml.njk:46-47`). Hard-coding `_state: action.entity_link.name` _inside_ the component breaks that decoupling (and ties it to the `action` state shape), for no benefit — every consumer already has `action` state and already injects the sibling crumb fields.

The change that preserves the established pattern is to **keep `entity_name` as a var** and only change its _source_ in each template from `_request: get_entity.0.{{ name_field }}` (`view.yaml.njk:48-50`) to `{ _state: action.entity_link.name }` — exactly mirroring how `entity_title` is sourced from `action.entity_link.title`. Then `action-breadcrumbs.yaml` needs **no** edit at all (its `entity_name`-or-`entity_title` fallback at `:56-65` already does the right thing), which also keeps it reusable by the Part 63 overview pages (whose `entity_link` lives at a different state path).

**Fix:** rephrase line 200(c)/line 201 to "re-source the `entity_name` var in each template from `entity_link.name`; `action-breadcrumbs.yaml` is unchanged."

## Verified correct (no action)

- `emitEntityDataApi` body and the `InternalApi` pattern match `emitHookApi`/`emitGroupOnCompleteApi` (`makeWorkflowApis.js:16-22`, `:296-303`); `InternalApi` HTTP-blocking is real (`@lowdefy/api/.../callEndpoint.js:37-38`).
- The id-collision argument holds: hook/group/lifecycle ids cannot equal `{type}-entity-data`.
- Wholesale entity carry at `makeWorkflowsConfig.js:1030-1035` (`{ ...workflow.entity, id_query_key }`) is the right hook point for stripping `data` and adding `data_endpoint`; the hook-string hard-error message exists (`:165-169`); `validateWorkflow` exists and is the right place to call `validateEntityData`; the `name_field` validation block to remove is at `:791-799`.
- `callApi({ endpointId, payload })` is threaded onto every engine context (`createEngineContext.js:47,65`) and the three calling handlers each resolve a single `wfConfig` via `workflowsConfig.find(...)` and build `entity_link` identically, so the per-handler `name`-lift is sound. Review-1 #5's point stands (first read-path `callApi` use; try/catch is the guardrail) and the design already specifies the try/catch.
- `_module.endpointId` resolution and the `workflow-api.yaml` `endpoints:` precedent (`new_event`/`send_notification`) are exactly as described.
- The check page (`action.yaml.njk`) fetches `get_workflow_action` (`:123`) and already reads `get_workflow_action.entity.id` (`:198`), so the slot migration works there too.
