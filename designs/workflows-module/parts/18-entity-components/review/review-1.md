# Review 1 — Part 18 entity-components

Critical review of [designs/workflows-module/parts/18-entity-components/design.md](../design.md). Verified against shipped code in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`, the shipped Part 16 templates under `modules/workflows/templates/`, the shipped Part 19 Apis under `modules/workflows/api/`, and adjacent unshipped designs (parts 17, 20, 24, 25). Concept-level findings already resolved in [workflows-module-concept/ui/review/review-1.md](../../../../workflows-module-concept/ui/review/review-1.md) are not repeated.

**Part 17 update (revisited during action-review).** Part 17's design has since expanded materially. The relevant new commitments that affect findings below: (1) `workflow-overview` page renders its header via `_ref` to part 18's `workflow-header`, passing the workflow doc returned by `get-workflow-overview` ([part 17 design.md:46](../../17-shared-pages/design.md)); (2) all three task pages call `action_role_check` at step 6 of the eight-step `onMount` sequence to write `_state.action_allowed`, then gate write buttons on it ([part 17 design.md:24,38,136,188](../../17-shared-pages/design.md)); (3) a new `vars.entities` module var maps `entity_collection` → `{ page_id, id_query_key, title }`, declared `required: true` at the part 20 manifest level — part 17 notes that "part 18's `workflow-header` may consume `title` for the entity-kind label" ([part 17 design.md:90](../../17-shared-pages/design.md)); (4) part 17 commits to tracker actions linking via `status_map` ([part 17 design.md:53](../../17-shared-pages/design.md)), strengthening finding #9's case for aligning to the concept spec. These updates have been folded into the findings below.

## Critical findings

### 1. `workflow-header`'s milestone label needs group `title`, but persisted `groups[]` doesn't carry it

> **Resolved with option (c) — client-side join.** Neither the engine's `recomputeGroups.js` nor the shipped `get-entity-workflows` / `get-workflow-overview` Apis change. `workflow-header` and `actions-on-entity` resolve group titles by joining `workflow.groups[i].id` against `_global.workflows_config[workflow.workflow_type].action_groups[]`. Added a "Group title resolution" subsection under `workflow-header`'s rendering rules in design.md spelling out the join path and the trade-off (client-side cost vs. shipped-code reopen). Updated the `workflow` vars description to commit to the `{ id, status, summary }` shape (no `title`). Updated `actions-on-entity`'s per-group section bullet to point at the same join. The milestone-label bullet now cites the join too. Chosen over (a) Api projection and (b) persisting on the doc because (c) doesn't reopen shipped engine or Api code; the marginal client-side cost is one `_global` chain per render. A bonus: titles always reflect the current YAML rather than the title in effect when the workflow started.

`design.md:30` commits: _"Current-phase milestone — the title of the lowest-ordered group whose `status !== done` (concept's group-based milestone rule)."_

But `recomputeGroups.js` writes the doc's `groups[]` as `{ id, status, summary }` only — no `title`:

```js
// plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js:14-29
return (declaredGroups ?? []).map((group) => {
  ...
  return { id: group.id, status, summary };
});
```

`StartWorkflow.js:74-91` confirms the workflow doc shape — `groups: []`, no `action_groups` field on the doc. Group titles live only in the build-time `workflowsConfig.{type}.action_groups[]`.

`get-entity-workflows.yaml` (shipped) projects the workflow doc straight through — no title enrichment. So a client component reading `workflow.groups[i].title` gets `undefined`.

Part 25 hit the same problem and resolved it by deriving the title from "the workflow's static `action_groups[]` (looked up by id)" — but it doesn't say *where* the client gets that static config from on the page (Part 25's title resolution is a single-group payload from the Api, distinct from Part 18's many-workflow client-side join).

Fix options, ordered by least disruption:

- **(a) Project group titles into `get-entity-workflows`** — amend the shipped Api: in the workflow-doc projection, lift each `groups[i].id` and look up the title from `workflowsConfig.{type}.action_groups[]` via a Lowdefy `_global` operator. The Api becomes `_module.var: workflows_config`-aware.
- **(b) Persist titles on `groups[]`** — change `recomputeGroups.js` to write `{ id, title, status, summary }`. Workflow doc grows slightly; titles are static post-StartWorkflow anyway.
- **(c) Client-side lookup in `actions-on-entity` / `workflow-header`** — pass `workflowsConfig` as a vars/global into the entity page; component does the join itself. Pushes more knowledge into every consuming entity page.

Recommendation: **(b)**. Titles are workflow-type config, not engine state, so persisting them is a minor cost. It also fixes the same gap for Part 17's `workflow-overview` reuse of `workflow-header`. Either way the design needs to spell out the resolution path.

### 2. `action_role_check`'s shape is described as "returns a boolean" but shipped Part 16 templates call it as a SetState action

> **Resolved.** Rewrote the `components/action_role_check.yaml` section in design.md to commit to the shipped contract — a `_ref`-able YAML file containing an action sequence, taking `action_config` as a var, that writes the role-intersection result to `_state.action_allowed`. Added a `vars:` table, an explicit `_ref` call example matching part 16's shipped usage, a step-by-step list of what the sequence does, and an explicit Consumers list naming part 16's four form-action templates, part 17's three task pages, and part 24's universal-fields component. Dropped the "returns boolean" framing. The verb-membership scope is left flagged as a forward reference to finding #7 since that's still open.

`design.md:34-39`: _"Reusable client-side access-check primitive. … Returns a boolean used by templates to conditionally render buttons."_

But the shipped Part 16 templates `_ref` it as a step inside the `onMount` action sequence, not as a block returning a value:

```yaml
# modules/workflows/templates/edit.yaml.njk:78-82
- _ref:
    path: ../components/action_role_check.yaml
    vars:
      action_config:
        _var: action_config
```

And [part 16 design.md:57](../../_completed/16-page-templates/design.md) is explicit:

> 6. **`action_role_check`** — **sets `_state.action_allowed`** based on the current user's roles vs. `access.{app_name}` (see part 18 for the shared primitive). Templates gate buttons on `_state.action_allowed === true`.

Part 24 (`design.md:73`) consumes the same `_state.action_allowed`. So `action_role_check.yaml` is an **action sequence that writes to page state**, not a primitive that returns a boolean. The behaviour is the same; the shape isn't.

Part 17 reinforces the contract: all three task pages call `action_role_check` at step 6 of the shared eight-step `onMount` sequence ([part 17 design.md:136](../../17-shared-pages/design.md)) and gate write buttons on `_state.action_allowed === true` ([part 17 design.md:24,38](../../17-shared-pages/design.md)). The primitive now has at least five consumer pages in flight (four part-16 form-action templates + three part-17 task pages — same primitive across all seven).

Fix: rewrite the description to commit to the shipped contract — a `_ref`-able action-sequence YAML, taking `action_config` as a var, that writes the role-intersection result to `_state.action_allowed`. Mention the consumers explicitly (part 16's four form-action templates step 6, part 17's three task pages step 6, part 24's universal-fields component reading `_state.action_allowed`). Drop the "returns boolean" framing.

### 3. `actions-on-entity` reads `workflow.groups[].status_map` per action — but `status_map` lives on action docs, not on groups

> **Resolved with option (c) — client-side grouping.** Same principle as finding #1's resolution: keep the shipped `get-entity-workflows` Api closed. Added a "Client-side grouping" subsection to `actions-on-entity` in design.md spelling out the bucketing: per group, filter `workflow.actions` by `action.action_group === group.id`, sort by `(sort_order ASC, _id ASC)` to match the shipped `get-workflow-overview` tie-breaker. Updated the runtime-behaviour preamble to note the Api returns a flat `actions[]` array and called out the per-group-section bullet as the client-side filter+sort site. The escape hatch (lift the `_group_index` sort from `get-workflow-overview` into `get-entity-workflows` if a future non-component consumer needs server-side bucketing) is documented inline.

`design.md:18-22` describes per-action rendering inside groups using `status_map.{current_stage}.{vars.app_name}.message`. This is correct — but the rendering path is muddled. The design says:

> "Renders per-group sections from the persisted `groups[]` array (positional — workflow's `action_groups[]` declaration order). … Within each group, renders actions sorted by `sort_order`."

The shipped `get-entity-workflows` Api returns each workflow with a flat `actions: [ <doc>, ... ]` array (every action, access-filtered, no group nesting in the response). The grouping is implicit: the component must filter `workflow.actions` by `action_group === workflow.groups[i].id` for each group section. The design doesn't say so.

Compare with the shipped `get-workflow-overview`, which adds a `_group_index` sort step in the `$lookup` pipeline to enforce cross-group ordering. `get-entity-workflows` does **not** apply that sort — it sorts only by `display_order` / `created.timestamp` on the workflow level, not on actions within.

Fix: spell out the client-side grouping step in `design.md:11-22`. Either:

- (a) Component iterates `workflow.groups[]` and filters `workflow.actions` by `action_group === group.id` for each section.
- (b) Server-side group nesting in `get-entity-workflows` (parallel to `get-workflow-overview`'s `_group_index` sort + post-process projection), so the Api returns `actions[]` grouped or sorted by group index. This is the more honest fix — the Api currently leaves the consumer to do the work.

Either way the design needs to commit; right now the contract is ambiguous.

### 4. `workflow-header` has a second consumer (Part 17's `workflow-overview` page) not mentioned

> **Resolved.** Rewrote the `components/workflow-header.yaml` section in design.md with the full contract: slot-driven collapse (caller passes `blocks:`, the toggle hides them), pass-the-workflow-doc as a var (no internal refetch), and a `collapsed_default` boolean so `actions-on-entity` can pre-collapse completed-workflow rows while `workflow-overview` stays expanded. Added explicit call-shape examples for both consumers (`actions-on-entity` iteration + `workflow-overview` single render), a `vars:` table covering `workflow` / `blocks` / `collapsed_default`, and a Consumers list naming both call sites. Pinned the title-resolution path: `_global: workflows_config[workflow.workflow_type].title` (workflow doc carries `workflow_type`, not `title`) — same indirection finding #1 will resolve for group titles. Component stays exported via `exports.components` so host apps can `_ref` it independently. Sub-decision C (entity-kind label via `vars.entities`) is left to finding #14.

`design.md:24-32` describes `workflow-header` as a per-workflow strip inside `actions-on-entity`. But [part 17 design.md:46](../../17-shared-pages/design.md) now commits the `workflow-overview` page to render its header via `_ref` to part 18's `workflow-header`, passing the workflow doc returned by `get-workflow-overview`:

> "Renders header via `_ref` to part 18's `workflow-header` component, passing the workflow doc returned by the Api. The component carries title, lifecycle stage badge (from `workflow.status.0.stage` + `global.workflow_lifecycle_stages`), summary counts (`workflow.summary.{done, not_required, total}`), and the current-phase milestone label. The collapse / expand toggle hides the action card list below (analogous to how it hides the group sections on the entity page). No `workflow-header` API changes needed for v1 — same data shape, same component."

Part 17 also introduces a new `vars.entities` module var (`entity_collection` → `{ page_id, id_query_key, title }`, declared `required: true` at the part 20 manifest level) and notes ([part 17 design.md:90](../../17-shared-pages/design.md)) that "part 18's `workflow-header` may consume `title` for the entity-kind label." So `workflow-header` has a potential third input on top of the workflow doc.

This affects Part 18's design in three ways:

- **`vars:` contract.** `workflow-header` must accept the workflow doc as a var (both `actions-on-entity` and `workflow-overview` pass the doc, not just the id). The current design doesn't specify any `vars:` interface for the component. If the component also reads `vars.entities` for an entity-kind title chrome, that's either an internal `_module.var: entities` read or an explicit caller-passed var — pick one.
- **Collapse toggle semantics.** Inside `actions-on-entity`, the toggle hides the group sections below; on `workflow-overview` it hides the action card list. Part 17 says "analogous to how it hides the group sections on the entity page" — implying the component's collapse covers content rendered _inside_ the component's slot, so callers should pass the collapsible content as a `blocks:` slot. Commit to this shape rather than two parallel implementations.
- **Contract surface.** "No `workflow-header` API changes needed for v1 — same data shape, same component" (part 17 design.md:46). That's a strong contract claim that pins Part 18's freedom to redesign. Whatever `vars:` shape lands has to satisfy both call sites simultaneously.

Fix: add a "Consumers" section listing `actions-on-entity` (this part) and `workflow-overview` (Part 17). Spell out the `vars:` contract for the shipped component (see finding #5). Commit to a slot-driven collapse (content passed in by caller) rather than two context-aware modes. Decide whether the entity-kind title reads `_module.var: entities` internally or comes through as a caller-passed var.

### 5. None of the three components have a `vars:` contract documented

> **Resolved.** All three components now carry an explicit `_ref` call example, a `vars:` table, and a "what it renders / does" section. `action_role_check` (`action_config: object, required`) and `workflow-header` (`workflow: object, blocks: array, collapsed_default: boolean`) were folded in by findings #2 and #4. `actions-on-entity`'s contract (`entity_id: string`, `entity_collection: string` — both required) was added in this resolution, along with a `collapsed_default` wiring rule that auto-collapses completed-workflow rows. Matches the convention used in parts 24 and 25.

Standard for every other component-shipping Part design (e.g. [part 24 design.md:17-29](../../24-universal-fields/design.md), [part 25 design.md:21-26](../../25-group-overview-page/design.md)) is to spell out the `_ref` call shape with `vars:` keys, types, and defaults. Part 18's design lists fields the components *read* (e.g. "Reads `_user: roles`", "Title from `workflow.title`") but never says what the caller passes in.

Inferred from shipped Part 16 templates and Part 17's commitments:

- `actions-on-entity` — `entity_id`, `entity_collection` (mandatory; passed to `get-entity-workflows`).
- `workflow-header` — `workflow` (the doc, per [part 17 design.md:46](../../17-shared-pages/design.md)); optionally a `blocks:` slot if the collapse-toggle hides caller-passed content (see finding #4). Internal reads include `_module.var: entities` if the entity-kind title is sourced from there rather than passed in.
- `action_role_check` — `action_config` (current shape from Part 16's `_ref` call at [edit.yaml.njk:78-82](../../../../modules/workflows/templates/edit.yaml.njk)), writes to `_state.action_allowed`.

Fix: add an `_ref` example block for each of the three components showing the call shape, matching the Part 24 / 25 convention. The shape is the externally-stable contract — leaving it implicit invites drift from the Part 16 / Part 17 callers.

## Important findings

### 6. Milestone-label all-groups-done fallback is dropped from the concept

> **Resolved.** Restored the concept's "workflow title if all groups done" fallback in the `workflow-header` description, with a back-link to ui/spec.md.

Concept [ui/spec.md:263](../../../../workflows-module-concept/ui/spec.md): _"milestone label = `title` of the lowest-ordered group whose `status !== done` (**workflow title if all groups done**)"_. Part 18 (`design.md:30`) drops the parenthetical — no rule for when every group is `done`.

Fix: restate the fallback. Either workflow title (concept's commitment), the literal string "Complete", or a hide-the-label rule. Pick one.

### 7. Verb gate on `action_role_check` is half-redundant with engine and resolver gates

> **Resolved — roles-only.** Confirmed against v0's `action_role_check.yaml` (pure roles intersection, no verb membership) and the engine's submit-time check ([`handleSubmit.js:115-124`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), also roles-only). Updated design.md's `action_role_check` "what the sequence does" section to drop the verb-membership claim and explain that per-app verb gating is enforced upstream at page emission (part 12) and query-time visibility (`access_filter.yaml`). Closes the forward reference left by finding #2's resolution.

`design.md:37-39`: _"Evaluates an action's `access.{vars.app_name}` verb membership + `access.roles` intersection with user roles."_

The verb membership check is meaningful at the page-resolver layer (Part 12's `makeActionPages` filters by `access.{app_name}` per verb). The engine's submit-time gate is **roles-only** ([`handleSubmit.js:115-124`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) — verb is implicit because the page wouldn't have been rendered. The query-time gate in `get-entity-workflows` does both ([`stages/access_filter.yaml`](../../../../modules/workflows/api/stages/access_filter.yaml)) but the verb side is "any of `view`/`edit`/`review`," not a specific verb.

Question for `action_role_check`: which verb is it checking against? The design implies "any of view/edit/review" but doesn't say. If templates call it from `edit.yaml.njk`, the relevant verb is `edit`. The shipped Part 16 call site passes `action_config` (which contains the full `access` map) — so the resolved verb selection is up to the component's internal logic, which the design needs to commit to.

Fix: either (a) commit to "verb is implicit from the calling page" and have the component read it from another var (e.g. `verb: edit` from the template), or (b) say the check is `access.{app_name}` non-empty + `access.roles` ∩ user roles non-empty (no specific verb), matching the Api-level gate. (b) is simplest and is what the engine does effectively.

### 8. Refresh-strategy open question contradicts shipped Part 16 behaviour

> **Resolved — commit to remount-on-back-navigation.** Replaced the dangling Open question with a "Refresh after submit" section in design.md committing to v1's de-facto mechanism: part 16's submit templates navigate to `-view` on success, entity-page back-navigation remounts the component, `onMount` re-fetches. Explicitly out of scope for v1: modal-flow submits or any "stay on entity page after submit" flow — these would need an additive refresh signal in v1.x. No contract surface added now; the extension path is documented.

`design.md:67-68` (Open questions): _"Refresh strategy after a submit. Page-level refetch on submit response, vs. component-internal refetch. Lean page-level (entity page owns the refresh trigger)."_

But Part 18's components live on entity pages owned by host apps — the workflows module doesn't ship the entity pages. The "page-level refetch" lean means **every host app's entity page** needs to know how to tell `actions-on-entity` to refetch after a submit. The component is fetching on `onMount` (single-shot). There's no documented signal between a submit on a child page (the action's `edit` page) and the parent entity page's `actions-on-entity` re-render.

Part 16's submit templates navigate to the action's `view` page on success — they don't return to the entity page. So a user who submits an action goes back via browser nav, and the entity page is whatever Lowdefy does with a fresh mount (the component re-fetches on entity-page mount). That works for back-nav but not for in-page modal flows or any "stay on entity page after submit" pattern.

Fix: either commit to "entity page handles re-mount on back-nav" (current de-facto behaviour, document it) and explicitly defer modal-flow refresh to v1.x, or design a refresh signal now (e.g. a `Reset`-style action the entity page can fire after a submit). Don't leave it hanging in Open questions when shipped code already implicitly resolves it.

### 9. Tracker action rendering decision needs concept alignment

> **Resolved — align with concept and part 17.** Dropped the inline-only restriction. Tracker actions in `actions-on-entity` now render with the same `status_map.{current_stage}.{vars.app_name}.link` rule as form and task actions (clickable card when configured, static text otherwise), citing concept ui/spec.md § Status-map binding and part 17 design.md:53. Removed the "Tracker action linking — inline-only in v1" bullet from "Out of scope / deferred". Part 17's lingering open question 182 ("Tracker action linking on overview — inline-only in v1 vs. linkable into child workflow") should be closed in the same direction during part 17's next consistency pass; logged here as a cross-design follow-up.

`design.md:22`: _"Tracker actions render inline (no link) using their `status_map` message."_
`design.md:46`: _"Tracker action linking — inline-only in v1."_

But concept [ui/spec.md:93](../../../../workflows-module-concept/ui/spec.md): _"Tracker actions render with a link target that points at the child workflow's `workflow-overview` page when configured by the action's `status_map`."_ And Part 17 design.md:53 now commits the same: _"Tracker actions link to the child workflow's `workflow-overview` page when configured."_ (Part 17's own open question 182 lingers on this — "lean inline; revisit if a real app needs" — so part 17 isn't fully consistent with itself either.)

The concept and Part 17 both allow tracker actions to link (via `status_map.{stage}.{app_name}.link`); Part 18 forbids it. Two ways to resolve:

- (a) Hold the design's line (inline-only in v1) and flag the divergence from concept + Part 17 — but Part 17's overview-page commitment makes this position increasingly costly to defend.
- (b) Align to concept and Part 17 — drop the "inline-only" restriction; let `status_map.link` work for trackers as it does for form / task actions. One consistent rule across `actions-on-entity` and `workflow-overview`. Cheaper for authors and avoids a special case.

Recommendation: **(b)**. The link mechanism is one path (`status_map.{stage}.{app_name}.link`); special-casing tracker actions adds engine-knowledge to the UI layer for no obvious benefit, and the special case now contradicts Part 17 too. Resolving here should close Part 17's lingering open question 182 in the same direction.

## Minor findings

### 10. `display_order` tie-break note is missing from the verification section

> **Resolved.** Added a demo step exercising two same-type workflows on one entity to the Verification section, citing the shipped `$sort: { display_order: 1, created.timestamp: -1 }`.

`design.md:14`: _"Iterates returned workflows by `display_order` ASC, with `created.timestamp` DESC as tie-break."_ This matches the shipped `get-entity-workflows` ([`$sort: { display_order: 1, created.timestamp: -1 }`](../../../../modules/workflows/api/get-entity-workflows.yaml)). Good.

But the verification section (`design.md:56-64`) doesn't test multi-workflow ordering — no demo step for two same-type workflows on one entity. Add one — it's a one-line addition and exercises the tie-breaker.

### 11. `action_role_check` reads `_user: roles` per `user_schema.roles_path` — but the var operator chain isn't right

> **Resolved.** Updated the `action_role_check` description to use `_user: { _module.var: user_schema.roles_path }`, matching the shipped `access_filter.yaml`.

`design.md:36`: _"Reads `_user: roles` (per `user_schema.roles_path` var)."_

The shipped `access_filter` stage does this correctly:

```yaml
# modules/workflows/api/stages/access_filter.yaml
_user:
  _module.var: user_schema.roles_path
```

The `_user: { _module.var: user_schema.roles_path }` form lets the host app rename the roles field. Part 18 should specify the same operator composition (not the literal `_user: roles`) — same fix as concept ui/review-1 #7's resolution, but Part 18 didn't carry it forward.

Fix: change to `_user: { _module.var: user_schema.roles_path }` in the design's `action_role_check` description.

### 12. `Verification` smoke claims an end-to-end flow that needs Part 16's pages live

> **Resolved.** Added part 16 to the "Depends on" line so the verification's claim is honest about what must be live.

`design.md:57-60` lists demo verifications that assume the `qualify` action's `-edit` page works (Part 16, shipped) and that submit re-renders the entity widget (refresh-strategy unresolved per finding #8). These are integration claims that touch multiple parts. The "depends on" line (`design.md:53`) only lists Parts 19 and 4 — missing Part 16 (the page emission the verification exercises).

Fix: add Part 16 to "Depends on" so the verification's claim is honest about what must be live.

### 13. Stale link to Part 19 — should point at `_completed/`

> **Resolved.** Fixed the inline link at design.md:13 from `../19-operational-apis/design.md` to `../_completed/19-operational-apis/design.md`.

`design.md:13`: _"via `CallApi` to `get-entity-workflows` ([part 19](../19-operational-apis/design.md))."_ Part 19 is shipped and lives at `parts/_completed/19-operational-apis/design.md`. The link as written is broken.

Fix: change to `[part 19](../_completed/19-operational-apis/design.md)`. (The "Depends on" line was updated for this; the inline reference at line 13 still needs it.)

### 14. `workflow-header` may need to consume `vars.entities` for the entity-kind title chrome

> **Deferred to v1.x.** No current consumer requires the entity-kind label. Part 17's "may consume" wording (design.md:90) is a soft suggestion, not a commitment. Adding the label later is purely additive — `_module.var: entities` is already required at the manifest level, so a future revision can read it from inside `workflow-header` without breaking the contract. Revisit when the demo or a real app surfaces the need.

[Part 17 design.md:90](../../17-shared-pages/design.md) introduces a new `vars.entities` map (`entity_collection` → `{ page_id, id_query_key, title }`, declared `required: true` at part 20's manifest) and notes that "part 18's `workflow-header` may consume `title` for the entity-kind label." Part 17 design.md:190 repeats this as a potential consumer.

Part 18's current design (`design.md:24-32`) makes no mention of `vars.entities` and shows no entity-kind chrome on `workflow-header`. Two ways to resolve:

- (a) Add the entity-kind label (e.g. `"Lead"` from `entities[workflow.entity_collection].title`) to `workflow-header`'s rendered surface, reading `_module.var: entities` internally. Single source of truth for the entity-kind word across the module.
- (b) Decline — `workflow-header`'s scope stays workflow-level only; the entity-kind label is the entity-page's job. Part 17's "may consume" is then a no-op.

Recommendation: light **(a)**, with the entity-kind title rendered next to the workflow title (e.g. `"Lead → Onboarding"`). Cheap, gives the overview-page header context for "what kind of thing is this workflow attached to," and uses the var that part 17 is already paying to require. But it's a UX choice — sensible to defer to "open question" if there's no demo asking for it.

## Open questions raised by this review

_All findings resolved during action review — see annotations on each finding above. No open questions remain._

Cross-design follow-up logged: part 17 design.md:182 ("Tracker action linking on overview — inline-only in v1 vs. linkable into child workflow") still contradicts part 17 design.md:53 and now part 18's resolution of finding #9. To be closed in part 17's next consistency-review pass.

## Next steps

Resolve via `/r:design-action-review workflows-module/parts/18-entity-components`. Substantive items are #1 (group title resolution — load-bearing), #2 (`action_role_check` shape — must match shipped Part 16 + Part 17 contract), #3 (grouping responsibility), #4 (workflow-header `vars:` contract for Part 17 reuse), and #5 (component `vars:` documentation). The rest are clarifications.
