# Review 2

Scope: `designs/workflows-module/parts/56-three-tier-action-pages/design.md` (post-review-1 rewrite). Review 1's nine findings are all annotated resolved/rejected and folded into the current text; this pass does **not** repeat them. Verified the new/load-bearing claims against source: the resolver (`makeActionPages.js`), the engine config builder (`makeWorkflowsConfig.js`), the connection schema (`schema.js`), the envelope builder (`GetWorkflowAction.js` + siblings), the form templates (`templates/view.yaml.njk`), the layout chrome (`modules/shared/layout/title-block.yaml`, `modules/layout/components/page.yaml`), the three shell dependencies, and `workflow-overview.yaml`.

Most of the design verifies cleanly (see **Confirmed sound** at the end). Two findings are substantive; the rest are accuracy fixes.

## Correctness / blast radius

### 1. `entities[collection].name_field` (D10) is rejected by the connection schema — `schema.js` is not in Files changed

> **Resolved (reshaped via Part 57).** The reviewer's fix was correct for the current model (the strict connection `entities` schema), but Part 57 (inline-entity-config — a prerequisite that lands before this part) removes the connection `entities` map and moves routing onto a per-workflow `entity:` block validated by `makeWorkflowsConfig`. So `name_field` becomes an optional flat field on that block (`entity.name_field`), read from the resolved `wfConfig.entity.name_field`; it reaches the connection via the `additionalProperties: true` `workflowsConfig` (`schema.js:87,100`), so **no connection `schema.js` change is needed** — the asymmetry the reviewer flagged dissolves. Updated D10, §7, the config-shape example, the `GetWorkflowAction` / `module.lowdefy.yaml` files-changed lines, the verification bullet, D1's stale `entities`-var reference, and the dependency bullets (dropped Part 17's `name_field` clause, added an explicit Part 57 prerequisite). Optional validation of `name_field` is folded into the `makeWorkflowsConfig` files-changed line (see #4).

D10 adds an optional `name_field` to each `entities[collection]` entry, and the envelope (`GetWorkflowAction`) reads it. But `entities` is a **connection property**, validated by `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`, where the per-collection object is **strict**:

```js
entities: {
  type: 'object',
  additionalProperties: {
    type: 'object',
    additionalProperties: false,        // ← strict
    properties: { page_id, id_query_key, title },   // only these three
  },
}
```

With `additionalProperties: false` and only `page_id` / `id_query_key` / `title` declared, an app that sets `name_field` makes the connection fail schema validation — every `WorkflowAPI` request on that connection (not just the breadcrumb) errors. The design routes the `name_field` addition through the **module var docs** (`module.lowdefy.yaml`) and the **Part 4 "config schema"** dependency, but neither is `schema.js`: `schema.js` is a third validation layer (the engine connection's own JSON schema), and it is **absent from "Files changed."**

**Fix:** add `plugins/.../WorkflowAPI/schema.js` to Files changed — extend the `entities.additionalProperties.properties` with `name_field: { type: 'string' }`. Note the asymmetry that makes this easy to miss: `entity_view` is UI-only and never reaches the connection (it's baked into pages and excluded from the materialized config), so it needs **no** `schema.js` change — but `entities`/`name_field` _does_ flow to the connection, so it does. The design should state this distinction explicitly.

### 2. D8 contradicts itself on the title-bar's _title_ value: baked action title vs runtime `message`

> **Resolved (reshaped).** The contradiction is real, resolved by separating the two slots: the **title** is the baked action title (`page_config.title`, the existing wiring + ASCII) and the **subtitle** is the action's `message` (which is not generally empty — it's the human-readable label that renders in action steps and the events timeline). This needs a small additive change to the shared `modules/shared/layout/title-block.yaml`: a new optional `description` var rendered in the subtitle slot (in place of the change-stamp line when set). Updated D8 (opening + "title content" para), §7, the Verification bullet, the Files-changed templates lines + new `title-block` line, and the Layout-module dependency (softened "no layout change" to one additive var). The "fallback to assignees if the message reads poorly" is recorded as an open question, decided at the screen — not spec'd now.

D8 and the Verification section state "the title is the action's `message`" / "the title reads `message`." But "Files changed → templates" says to **"keep the existing `title` / `status` / `status_enum` wiring,"** and the existing wiring is the **build-time-baked action title**, not `message`:

- `templates/view.yaml.njk:21-24` — `title: { _var: { key: page_config.title, default: null } }`.
- `makeActionPages.js:94-98` bakes `page_config.title = action.pages?.[verb]?.title ?? actionTitle`, where `actionTitle = action.title ?? humanizeSlug(action.type)` (`:77`).
- The envelope's `message` is a **different** field: `action[app_name]?.message ?? null` (`GetWorkflowAction.js:230,253`) — per-app, runtime, and frequently `null`.

So the two statements can't both hold. The ASCII mockups ("Collect Documents", "RCA Acceptance") are action **titles**, matching the baked wiring — which is also what "keep existing wiring" says. Three signals (the ASCII, "keep existing wiring", and the existing code) point to the baked action title; only D8's prose says `message`.

This matters beyond wording: if the title really should switch to `message`, the template must **rewire** `title` from `page_config.title` to `_state.{action|current_action}.message` (contradicting "keep existing wiring"), and `message` has no default (`?? null`) — the layout page's `title` var is required, so a null `message` (the common case: no per-app message authored) yields a blank title on a full-width header.

**Fix:** drop the "title is the action's `message`" claim from D8 and the Verification bullet; the title bar shows the baked action title (`page_config.title`), consistent with the ASCII and the unchanged wiring. (If `message` genuinely is wanted, say so, list the template rewire, and specify a non-null fallback — but the rest of the design assumes the baked title.)

## Accuracy / stale Files-changed lines

### 3. "Add optional `title` to the workflow grammar" (Part 4 amends, D9) is already done

> **Resolved (auto).** Verified `title` already ships: in `WORKFLOW_FIELDS` (`makeWorkflowsConfig.js:33`, materialized through), validated on workflows (`:591`) and actions (`:532`). Trimmed the `title` clause from the Part 4 amends bullet and added a note that it needs no schema change.

The "Depends on / amends → Part 4 config schema" bullet lists "optional `title` to the workflow grammar (D9)" as a new addition. It already exists:

- `makeWorkflowsConfig.js:33` — `'title'` is in `WORKFLOW_FIELDS` (materialized through).
- `makeWorkflowsConfig.js:591` — `validateWorkflow` validates `workflow.title` when present.
- `makeWorkflowsConfig.js:532` — `validateAction` validates `action.title` when present.
- `makeActionPages.js:77` already resolves `action.title ?? humanizeSlug(...)`; `module.lowdefy.yaml` documents the optional `title` on workflows/actions.

Only `entity_view` (workflow grammar) and `name_field` (entities, see #1) are genuinely new schema surface. **Fix:** trim the `title` clause from the Part 4 amends bullet — claiming it adds something already shipped misleads the implementer into editing a validator that's already correct.

### 4. `makeWorkflowsConfig` needs no "strip `entity_view`" edit — `pick()` already excludes it

> **Resolved.** Verified `entity_view` is not in `WORKFLOW_FIELDS`, so `pick(workflow, WORKFLOW_FIELDS)` (`:104-109,770`) excludes it automatically — no strip needed. Reworded the Files-changed line: the real change is validation (a new `entity_view` check validating `slot` is a block ref, alongside `validateWorkflow`/`validateAction`, plus the optional `entity.name_field` validation from #1), which is the validation Part 4 owns.

Files changed says: "`makeWorkflowsConfig.js` — strip `entity_view` from the materialised engine config (build-time UI field, not engine input)." But the materializer is allow-list based: `pick(source, WORKFLOW_FIELDS)` (`makeWorkflowsConfig.js:104-109`) copies **only** the listed fields, and `entity_view` is not among them — so it is excluded automatically, with zero code change. (Belt-and-suspenders confirmed downstream: the engine's `workflowsConfig` schema is `additionalProperties: true` at both the workflow and action levels, `schema.js`, so even an un-stripped `entity_view` wouldn't break the engine.)

The _real_ `makeWorkflowsConfig` change this part needs is the **validation** Part 4 owns ("validate `slot` is a block ref"), via a new `validateEntityView`-style check alongside the existing `validateAction`/`validateWorkflow` validators. **Fix:** reword the Files-changed line — `makeWorkflowsConfig` gets a new `entity_view` validator (or defer wholly to Part 4), and the "strip" is a no-op `pick()` already performs. As written it implies an edit that isn't needed and omits the edit that is.

## Minor

### 5. A lone History tab still renders a tab bar

> **Accepted.** Keeping the single-tab `Tabs` wrapper is intentional: the lone tab doubles as a "History" section heading, and holding the same `Tabs` structure whether or not Details is present keeps the RHS layout stable (no shift navigating form↔check or when a workflow has no `entity_view`). Documented the rationale on the `details_slot` shell-var entry.

The shell wraps the RHS in `Tabs` so `details_slot` can sit beside History as a Details tab; when `entity_view` is omitted on a form page (or always, on check pages) the Details tab is dropped, "leaving History as the sole tab" (§2, shell-var list, config-shape prose). A `Tabs` block with a single tab still renders a one-item tab header — a small visual wart (a tab strip with nothing to switch to). Consider: when only History remains, render `workflows-events-timeline` bare (no `Tabs` wrapper) rather than as a single tab. Cheap `_if` on the tab count; worth one line in the shell description so it isn't discovered as a UI nit at implementation. (Defer-acceptable, but decide it here rather than at code time.)

## Confirmed sound

- **D9 link target** — `workflow-overview.yaml:3,39,50-51` reads `_url_query: workflow_id`, so the breadcrumb's `{ pageId: workflow-overview, urlQuery: { workflow_id } }` (D9) addresses it correctly; and `workflow_id` is genuinely absent from the envelope today (`GetWorkflowAction.js:233-260`) though `action.workflow_id` exists and drives the workflow lookup (`:162`) — the one-line allowlist add is sound.
- **`entity_link` shape + name source** — built identically in all three readers (`GetWorkflowAction.js:217-227`, `GetEntityWorkflows.js:171-179`, `GetWorkflowOverview.js:184-191`) as `{ pageId, urlQuery, title }`; `entity_id` is on the action doc (`action.entity_id`), so the proposed projected `findOne` for `name_field` has its key available, and no entity read exists today (the new one is genuinely additive). The "shared `buildEntityLink` later" open question correctly spots the triplication.
- **Layout chrome** — `modules/shared/layout/title-block.yaml` renders back button / status pill (from `status` + `status_enum`) / `type` eyebrow / title / `page_actions`; `modules/layout/components/page.yaml` accepts `breadcrumbs` (`:30`), `type`, `title`, `status`, `status_enum`, `hide_title`, `content_width`, `page_actions`. D8's "the header is the layout page's native chrome, add only `breadcrumbs` + `type`" holds — those vars already exist, none are passed by today's templates.
- **Breadcrumb item spread + `home: true`** — `@lowdefy/blocks-antd` `Breadcrumb.js` spreads an item object onto `Link` (`...isObject(link) ? link : {}`), so `{ label, pageId, urlQuery }` per item works (D9/D10); `- home: true` is the standard first-segment convention across `contacts`, `user-admin`, `companies`, etc. module pages.
- **Resolver mechanics** — `makeActionPages` reads the **raw** `workflows` var (`:105`, `module.lowdefy.yaml:203-204`), already bakes `entity_collection` (`:86`) and resolves `workflow_title` via the imported `humanizeSlug` (`:1,77`), and emits nothing for check actions today (`:54`, `if (action.kind !== "form") return []`) — so D3's per-workflow check emission is net-new with no collision, and baking `entity_view.slot` + `reference_field` into the same vars bag is mechanically trivial. `check.yaml.njk` confirmed not to exist (new file, as stated).
- **Shell-dependency contracts** — `actions-on-entity.yaml` requires `entity_id` + `entity_collection` and fires onMount off `entity_id` (`:15-16,27-28`), baking `check-action-click` (`:92`) → D4 degrade path intact; `workflows-events-timeline.yaml` requires `reference_field` + `reference_value` (`:13-15,44-48`); `universal-fields.yaml` takes `state_path` (default `fields`, `:18-20`) with `current_action.fields` already used by the surface (`:145`) → D2's RHS recomposition is a placement change, not new component work. The leaves the design wants to extract from `check-action-surface.yaml` (signal buttons `:296-581`, comment `:272-291`, status-history `:176-269`) are currently inline in one file, matching D6's "extract the shared leaves."
- **Mount gate** — gating columns on `visible: _ne [_state.entity_id, null]` so their onMount fires post-load is standard Lowdefy: a `visible: false` block is unmounted and mounts (firing onMount) when the condition flips. The mechanism is sound for the one-time, full-page-load navigation model (D4).
