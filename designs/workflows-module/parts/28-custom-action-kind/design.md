# Custom action kind

Adds a fourth action `kind:` to the workflows module — `custom` — for actions whose status lifecycle is identical to `check` but whose working surface lives on app-owned pages rather than the module's shared `workflow-action-*` pages. A custom action behaves exactly like a check action — same FSM, same nullary signals, same `fields:` channel, same per-workflow `{type}-submit` endpoint — with one difference: **its working surface is app-owned.** The author writes a `link:` cell (and optionally a `view_link:`) in `status_map` pointing at app pages; the engine routes those authored links into the per-verb link map by stage — the working `link` into the stage's active verb slot, and `view_link` (or the shared `workflow-action-view` page as a fallback) into the `view` slot — so an observer without working access always lands on a read-only status surface.

This unblocks workflows where the per-action UX is dictated by an existing app page (a domain document editor, a multi-screen wizard, an external-system mirror) that doesn't fit the shared check page and shouldn't be forced into a `form:` block.

## Proposed change

1. Add `kind: custom` as the fourth value of `ACTION_KINDS` in [makeWorkflowsConfig.js](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js). It rejects `form:` and `tracker:` (the kind-shape blocks, exactly as `check` does) and accepts everything `check` accepts: `key`, `hooks`, `event`, `status_map`, `access`, `action_group`, `blocked_by`, `required_after_close`, `allow_not_required`, and the universal fields.
2. Add a `custom: form` alias to `FSM_TABLES` in [fsm/tables.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js) (by object identity, exactly as `check: form` is aliased today) so submit signals resolve through the same table as form/check.
3. **Route the authored links into the per-verb link map** in [computeEngineLinks.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js). Today it returns `{}` for `kind: custom`, and every live display surface — `collapseLink` in [resolveActionAccess.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js), read by `GetEntityWorkflows`, both overviews, and the events timeline — reads only the per-verb `links` map. So an authored cell `link` (which renders to the singular `doc[slug].link`) would never reach a card (review-1 #1). Change the `kind: custom` branch so that, instead of returning `{}`, it reads the rendered cell's `link`/`view_link`, substitutes the `action_id`/`entity_id` sentinels (via the shared helper extracted from the tracker arm — see §Links and review-1 #2), and writes them into the per-verb `links` map by stage: the working `link` lands in the stage's active working verb slot (`edit` at action-required/in-progress/changes-required, `review` at in-review, `error` at error, `view` at done), and `view_link` — or the entry-scoped shared `workflow-action-view` page as a fallback — lands in the `view` slot. The map is the shape `collapseLink` already reads, so the authored link surfaces and the existing edit→review→error→view collapse routes each user to the right page (a working user to the app page, an observer to the view page). `validateStatusMapCells` already permits `link:` for `kind: custom`; extend it to permit `view_link:` and validate both cells' shape by reusing `validateTrackerStartLink`'s logic (review-1 #6).
4. No change to [makeActionPages.js](../../../../../modules/workflows/resolvers/makeActionPages.js) (its `if (action.kind !== "form") return []` guard already excludes custom — it emits no per-action pages), [makeWorkflowApis.js](../../../../../modules/workflows/resolvers/makeWorkflowApis.js) (custom is submittable like check, so it rides the per-workflow `{type}-submit` / `{type}-update-fields` endpoints and `render_config` with no skip), or [handleSubmit.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) (the handler is signal-driven and keys on no `kind`).
5. Document the kind in the concept specs and the module README: the `custom`/`check` distinction (engine-computed vs author-authored links), the recommended submit path (the app page calls the module's `{type}-submit` endpoint), and the `status_map.{stage}.{app}.link` cell convention.
6. **Add an end-to-end Playwright spec in the `workflows-test` app** (not `demo`). Add a `custom-action` workflow config under `apps/workflows-test/modules/workflows/workflow_config/custom-action/`, an app-owned page the custom action's `link:` cell points at, and `apps/workflows-test/e2e/workflows/custom-action.spec.js`. The spec's load-bearing assertion is the **click-through**: the rendered action card's link carries the concrete action `_id` (not the literal `true` sentinel) and navigates to the app page — the single assertion that catches the #1/#2 class of defect (review-1 #7). Also assert the observer path: a view-only user lands on the shared `workflow-action-view` page, not the working page.

## What `custom` means: `check` with author-owned links

The four kinds occupy distinct slots on two axes — _who owns the working-surface page_ and _who owns the navigation link the engine writes onto the action doc_:

| Kind      | Working-surface page                                                              | Navigation `link` on the action doc                                                                              | Submit endpoint / status source                                     |
| --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `form`    | Module per-action pages `{type}-{action}-{verb}`                                  | Engine-computed (`computeEngineLinks`) → the derived form pages                                                  | `{type}-submit`, signal → FSM                                       |
| `check`   | Module shared pages `workflow-action-{verb}`                                      | Engine-computed (`computeEngineLinks`) → the shared check pages                                                  | `{type}-submit`, signal → FSM                                       |
| `tracker` | Inline in `actions-on-entity`                                                     | Engine-computed (child overview / `tracker.start_link`)                                                          | None — engine writes via the `internal_mirror_child_*` subscription |
| `custom`  | **App-owned pages** (working) + shared `workflow-action-view` (observer fallback) | Engine-routed from author's `link:`/`view_link:` cells → app pages (working slots), shared view page (view slot) | `{type}-submit`, signal → FSM (`custom: form` alias)                |

Everything else is identical to `check`. Custom uses the same eight-status FSM (aliased to `form`), the same nullary submit signals (`submit`, `progress`, `not_required`, `approve`, `request_changes`, `resolve_error`), the same `fields:` payload channel, the same per-workflow `{type}-submit` and `{type}-update-fields` endpoints, and the same `hooks:`/`event:` machinery. The single difference is link _source_: for the three built-in kinds `computeEngineLinks` derives the per-verb link map from module page ids; for `custom` it derives the same per-verb map from the author's `status_map` `link:`/`view_link:` cells. It writes that map in the shape the display layer reads — so the authored working link reaches the card for users who can act, while observers fall back to the shared `workflow-action-view` status page. The engine still owns the read-only view fallback; the author owns the working surface (and, optionally, an app-owned in-flight view page).

The motivating shape is "the action represents a piece of work, the user does that work on a page the app already owns, and we want the workflow's status array, group rollup, `blocked_by`, and tracker fan-up to keep working." Custom is exactly that: a check action whose card on the entity page links to an app page instead of the shared check page.

## Why a fourth kind, not a flag on `check`

The engine keys link source on `kind` in `computeEngineLinks` (and `validateStatusMapCells` keys cell permissions the same way). Encoding "author owns the links" as a flag on `check` (e.g. `check.author_links: true`) would mean every one of those branches becomes `check && author_links` — which is just `custom` spelled awkwardly. Kinds are the discriminator the resolvers and renderers already switch on (CLAUDE.md "one correct way"). The alternatives:

- **A `form` action with an empty `form:` block, linking to an app page via the cell.** Rejected: still emits the per-action `{type}-{action}-{verb}` pages (none of which the app uses), and `computeEngineLinks` would overwrite the author's cell links with computed links to those dead pages.
- **A `check` action linking to the app page.** Rejected: `validateStatusMapCells` rejects `link:` for `check` (it's engine-managed), and `computeEngineLinks` overwrites the doc's link map with links to the shared `workflow-action-{verb}` pages. The author cannot redirect a check action's navigation to an app page — that redirection _is_ what `custom` provides.
- **A `check.author_links` flag.** Rejected: the encoding-as-a-flag problem above.

## What the kind means at each layer

### Build-time validation (`makeWorkflowsConfig`)

- Add `"custom"` to `ACTION_KINDS` and update the unknown-kind error message (currently `"expected form, check, or tracker"`).
- In `validateAction`, reject the kind-shape blocks exactly as `check` does: `kind: custom` with `form:` or `tracker:` hard-errors. Concretely, extend the existing check guard (`makeWorkflowsConfig.js:535`, currently `action.kind === "check" && (action.form || action.tracker)`) to `(action.kind === "check" || action.kind === "custom") && (action.form || action.tracker)`.
- `hooks:`, `event:`, `key:`, `status_map`, `access`, `universal_fields`, `blocked_by`, `action_group`, `required_after_close`, and `allow_not_required` are all accepted — custom is validated by the same per-field validators as check (`validateHooks`, `validateEvent`, `validateActionAccess`, `validateUniversalFields`, `validateStatusMapCells`). No custom-specific rules beyond the kind-shape rejection.
- `validateStatusMapCells` already branches on `isCustom = action.kind === "custom"` to permit `link:` cells. The branch is currently unreachable (the unknown-kind check in `validateAction` fires first); adding `custom` to `ACTION_KINDS` makes it live. Extend the branch to also permit `view_link:`, and validate the internal shape of both cells (`{ pageId: non-empty string, urlQuery?: object }`, with `action_id`/`entity_id` sentinel-only and other `urlQuery` values strings). Don't write a parallel checker — `validateTrackerStartLink` (`makeWorkflowsConfig.js:361`) already enforces exactly this shape for tracker `start_link`; extract its link-shape logic into a shared validator and call it from both sites ("one correct way"). Add the `kind: custom` cell tests (valid `link`/`view_link` pass; missing `pageId`, a non-`true` sentinel, and a built-in kind's `link:` still reject).

The kind passes through into the runtime `workflowsConfig` via the existing `ACTION_FIELDS` pick — no schema-shape change, only a new enum value.

> **Decision (re-aligned 2026-06):** the parked version of this design rejected `hooks:`, `event:`, and `interactions:` for custom on the rationale that "the app owns the submit endpoint." That rationale is void post-Part 48: the submit endpoint is the module's per-workflow `{type}-submit`, and per-action `hooks:`/`event:` overrides ride it for every submittable kind. Custom therefore accepts them on the same terms as check. (`interactions:` no longer exists anywhere — Part 38 / state-machine removed the interaction→target table in favour of the signal FSM — so there is nothing to reject.)

### FSM (`fsm/tables.js`)

`resolveSignal.js` looks up `FSM_TABLES[action.kind]`. The table set is `{ form, tracker, check: form }`. Add `custom: form` (object-identity alias, matching the `check: form` comment's "never a copy" rationale) so a custom action resolves submit signals through the same eight-status machine as form/check. Without this alias a custom submit throws on an undefined table.

### Links (`computeEngineLinks`) — engine routes authored cell links

This is the one substantial engine change (review-1 #1). The display layer is per-verb: every read surface (`GetEntityWorkflows`, `GetWorkflowOverview`, `GetWorkflowActionGroupOverview`, `GetEventsTimeline`) calls `collapseLink({ links: action[slug].links, allowed })`, and `collapseLink` ([resolveActionAccess.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js)) reads only `links.{edit,review,error,view}` — it has no concept of a singular `link`. The planner renders the author's cell to `doc[slug].link`/`doc[slug].view_link` (`renderStatusMap` → deep-merge, `planActionTransition.js:240–245`) and then calls `computeEngineLinks` (line 248) to populate `doc[slug].links`. If `computeEngineLinks` keeps returning `{}` for custom, the authored link never reaches `links` and the card is unclickable. So:

`computeEngineLinks` stops short-circuiting custom. For `kind: custom` it reads the rendered `doc[slug].link` / `doc[slug].view_link`, substitutes the `action_id`/`entity_id` sentinels, and builds the per-verb `links` map for each declared slug.

**Sentinel substitution — one shared mechanism (review-1 #2).** The `{ action_id: true }` / `{ entity_id: true }` sentinel swap already lives inline in the tracker `start_link` arm of `computeEngineLinks` (it walks the cell `urlQuery`, replacing `action_id: true` → `action._id` and `entity_id: true` → `action.entity.id`, passing static keys through). Extract that into one small shared helper (a flat-`urlQuery` substitution over both sentinels) and call it from both the tracker arm and the new custom branch, so every engine-routed link resolves sentinels the same way. **Delete the orphaned `substituteActionIdSentinel.js`** — it is dead Part-30 code (no production caller; only its own def + test), and weaker than the live path (it handles only `action_id`, not `entity_id`). With the helper in place the per-verb map is built as:

- The working `link` lands in the stage's single active working verb slot, reusing the existing `STAGE_VERB_PAGE` table: `edit` at `action-required` / `in-progress` / `changes-required`, `review` at `in-review`, `error` at `error`. At `done` (a view-only stage) there is no working verb, so `link` lands in the `view` slot — `done: { link: ... }` reads naturally. At `blocked` / `not-required` no slot is exposed, so the cell renders message-only.
- The `view` slot is filled by the author's `view_link` if present, else by the entry-scoped shared `workflow-action-view` page (`{ pageId, urlQuery: { action_id } }`) wherever the stage exposes `view`. This is the observer fallback — a viewer is never dropped onto the working page.

`collapseLink`'s `edit > review > error > view` priority then routes each user correctly: a user holding the stage's working verb gets the app page; everyone else with `view` gets `view_link` or the shared status page. The cell shape is `{ message?, link?: { pageId, urlQuery? }, view_link?: { pageId, urlQuery? } }`, deep-merged onto the doc and sticky across transitions like the built-in display fields. Add the worked-example tests.

### Page emission (`makeActionPages`) — no change

`emitForAction` returns `[]` for any non-`form` kind. Custom emits no per-action module pages — the app supplies the pages, and the cell `link.pageId` points at them. Add a test asserting custom emits no pages.

### Endpoint emission (`makeWorkflowApis`) — no change

Custom is a submittable kind. The per-workflow loop skips only `kind: tracker`; custom falls through, marks the workflow as having a submittable action, and so the workflow gets its `{type}-submit` and `{type}-update-fields` endpoints plus `render_config` (which carries every action's `status_map`, including the custom action's link cells). `emitHooks` is gated on `action.hooks`, so a custom action with hooks emits its hook `InternalApi`s the same as check; one without emits none. No skip, no special case.

### Engine (`handleSubmit` and phases) — no change

The handler is a signal-driven phase pipeline (`load → preHook → planSubmit → commitPlan → trackerCascade → postHook`). No phase branches on `kind` for the submit path; `planSubmit` resolves the target stage via `resolveSignal` (the FSM table), which step 2 makes valid for custom. The `current_status`/`interaction`/`submit_edit` channel the parked design relied on no longer exists.

## App-side shape

A custom action in workflow YAML, plus the app-owned page and the submit call. The cell links point at app page ids; the engine renders them onto the action doc at each transition.

```yaml
# workflows_config/account-review/review-document.yaml
type: review-document
kind: custom
action_group: review
description: Review the proposed contract document and either approve or request revisions.
blocked_by: [collect-requirements]
access:
  my-team-app:
    view: true
    edit: [account-manager]
    review: [account-manager]
status_map:
  blocked:
    my-team-app: { message: Awaiting requirements. }
  action-required:
    my-team-app:
      message: Review the contract document.
      link: # the working page — routed to the `edit` slot at this stage
        pageId: contract-review # app-owned page id (not a module page)
        urlQuery: { action_id: true } # sentinel → substituted with the action _id
      view_link: # optional in-flight observer page; omit to fall back to the shared status page
        pageId: contract-view
        urlQuery: { action_id: true }
  in-review:
    my-team-app: { message: In review. } # no link → observers get the shared status page; reviewers get the in-review working link if set
  done:
    my-team-app:
      message: Document approved.
      link: # view-only stage → routed to the `view` slot
        pageId: contract-view
        urlQuery: { action_id: true }
```

The app supplies `pages/contract-review.yaml`. It loads the contract (reading `?action_id=<id>` from the cell link), lets the user edit it, and on save advances the workflow by calling the module's per-workflow submit endpoint with the action id and a signal:

```yaml
# inside the app page's save event
- id: save_contract
  type: Request
  requestId: update_contract # app-owned domain write

- id: submit_review
  type: CallApi
  params:
    endpointId:
      _module.endpointId: { id: account-review-submit, module: workflows }
    payload:
      action_id: { _url_query: action_id }
      signal: approve # or: submit, request_changes, not_required, …
      fields: # universal-fields update channel (same as check)
        description: { _state: review_summary }
      comment: { _state: review_note }
```

The recommended submit path is the **module's `{type}-submit` endpoint**, because it carries the baked-in `render_config` (which renders the cell `message`/`link` onto the action doc) and any declared `hooks:`/`event:` overrides. The page composes whatever buttons it needs; each button calls the endpoint with a different nullary `signal`, and the FSM resolves the target stage exactly as it does for a check action.

**Atomicity.** The domain write and the workflow write above are two requests and are not atomic — the same posture as a check action whose pre-hook does an entity write. If the two must be atomic-ish, move the domain write into a **`hooks.submit.pre` routine** on the custom action (now permitted): the engine runs it inside the submit handler's flow, before the status commit.

## What's still wired up automatically

Custom is "app-owned working page + author-owned link" — every other engine feature works as for check:

- **Status array + FSM.** Writes go through the normal submit path; the FSM gates transitions (a `done` action only re-opens via the signals the `done` row allows).
- **`blocked_by` fan-out.** Other actions may list a custom action in `blocked_by`; when it reaches a terminal status they auto-unblock.
- **Group rollup.** Custom actions belong to `action_groups` and contribute to group-status computation.
- **`required_after_close: true`.** Survives a `CloseWorkflow` sweep unless blocked, same as check/form.
- **`{type}-update-fields`.** The independent universal-fields edit endpoint covers custom actions like any other submittable kind.
- **Tracker fan-up.** A custom action's terminal write propagates to a parent tracker if it changes the containing workflow's status. (Custom actions cannot _be_ trackers — they carry no `tracker:` block.)
- **Log events and notifications.** The submit handler dispatches the default log event and notifications; `event:` overrides shape the per-app display, same as check.
- **`workflow-overview` page.** Renders one card per action; the custom action's card uses the per-verb `links` map the engine routes from the author's cells — the app working page for a user who can act, the `view_link` or shared status page for an observer (resolved by `collapseLink` against the user's access).

## What's deliberately not provided

- **No per-action module pages.** The whole point is "app owns the working surface." Apps wanting a shared shape across many custom actions should use `check` and customise the shared check page via the existing template-composition patterns.
- **No module working pages.** The author owns the working surface via cell `link:` (and an optional `view_link:`); `computeEngineLinks` routes those authored links into the per-verb map rather than computing module page ids for the working slots. The engine still supplies the shared `workflow-action-view` page as the observer fallback for the `view` slot — so a custom action always has a read-only status surface even when the author authors only a working `link`. This author-owned working surface is the defining property of the kind.
- **No build-time validation of `link.pageId` against the host app's page tree.** Module resolvers have no view of host-app page ids. A typo surfaces at click time as a 404, the same as any free-form Lowdefy page reference. (Built-in kinds' links resolve through module page ids and _are_ build-validated; app page ids are not.)

## Files changed

| File                                                                                                                                                                            | Change                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [modules/workflows/resolvers/makeWorkflowsConfig.js](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)                                                         | Add `"custom"` to `ACTION_KINDS`; update the unknown-kind message; reject `form:`/`tracker:` for `kind: custom` (mirror the check branch). Add test cases.                                                                                                                                                                                                                                                     |
| [plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js)                     | Add `custom: form` to `FSM_TABLES` (object-identity alias). Add a resolveSignal test for `kind: custom`.                                                                                                                                                                                                                                                                                                       |
| [modules/workflows/resolvers/makeWorkflowsConfig.js](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) (`validateStatusMapCells`)                              | **Code change.** Extend the `isCustom` branch to also permit `view_link:` and validate both cells' shape by reusing `validateTrackerStartLink`'s link-shape logic (extract into a shared validator). Add `kind: custom` cell tests (valid pass; missing `pageId` / bad sentinel / built-in `link:` reject).                                                                                                    |
| [modules/workflows/resolvers/makeActionPages.js](../../../../../modules/workflows/resolvers/makeActionPages.js)                                                                 | No code change; add a test asserting `kind: custom` emits no pages.                                                                                                                                                                                                                                                                                                                                            |
| [modules/workflows/resolvers/makeWorkflowApis.js](../../../../../modules/workflows/resolvers/makeWorkflowApis.js)                                                               | No code change; add a test asserting a `kind: custom` action is submittable (emits `{type}-submit` + `{type}-update-fields`, carries its `status_map` in `render_config`).                                                                                                                                                                                                                                     |
| [plugins/.../shared/render/computeEngineLinks.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js)                           | **Code change.** Replace the `kind: custom` `return {}` short-circuit with routing: read the rendered cell `link`/`view_link`, substitute sentinels via the shared helper, write the per-verb `links` map by stage (working verb slot + `view` fallback to shared `workflow-action-view`). Extract the inline tracker-arm sentinel swap into a shared helper used by both arms. Add `kind: custom` test cases. |
| [plugins/.../shared/render/substituteActionIdSentinel.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/substituteActionIdSentinel.js)           | **Delete.** Orphaned Part-30 dead code (no production caller; handles only `action_id`). Superseded by the shared helper extracted from the tracker arm. Remove it and its `.test.js`.                                                                                                                                                                                                                         |
| [plugins/.../WorkflowAPI/SubmitWorkflowAction/handleSubmit.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) | No code change; covered by an end-to-end custom submit test (signal → FSM → committed status + rendered cell link).                                                                                                                                                                                                                                                                                            |
| [designs/workflows-module-concept/action-authoring/spec.md](../../../../workflows-module-concept/action-authoring/spec.md)                                                      | Add `custom` to the kind list and the mutual-exclusion line; add a "Custom action" subsection (check semantics + author-owned links). Note `custom: form` FSM aliasing.                                                                                                                                                                                                                                        |
| [designs/workflows-module-concept/submit-pipeline/spec.md](../../../../workflows-module-concept/submit-pipeline/spec.md)                                                        | Note that `custom` rides the per-workflow `{type}-submit` endpoint with the same nullary signals as check; its `link` cells are author-authored.                                                                                                                                                                                                                                                               |
| [designs/workflows-module-concept/ui/spec.md](../../../../workflows-module-concept/ui/spec.md)                                                                                  | Add `custom` to the page-generation note ("none — app supplies pages; navigation via author `link:` cells").                                                                                                                                                                                                                                                                                                   |
| [modules/workflows/README.md](../../../../../modules/workflows/README.md)                                                                                                       | Add a "Custom actions" section: the app-side page + submit-call shape and the `status_map.{stage}.{app}.link` convention.                                                                                                                                                                                                                                                                                      |

## Open questions

1. **End-to-end Playwright spec.** Should this part add a `custom-action.spec.js` with an app-side page in `apps/demo/` exercising the kind? Part 22 owns the e2e suite. Defer to whoever picks this up to scope alongside.

## Related

- Action kinds and resolver behaviour: [action-authoring/spec.md](../../../../workflows-module-concept/action-authoring/spec.md), [submit-pipeline/spec.md](../../../../workflows-module-concept/submit-pipeline/spec.md), [state-machine/design.md](../../../../workflows-module-concept/state-machine/design.md) (the signal FSM that replaced the interaction/`current_status` model).
- Custom-kind touch points: [computeEngineLinks.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js) (gets the routing change), `validateStatusMapCells` in [makeWorkflowsConfig.js](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) (already permits `link:`; gains `view_link:` + shape validation), and the sentinel substitution (a shared helper extracted from the tracker arm; the orphaned [substituteActionIdSentinel.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/substituteActionIdSentinel.js) is deleted — review-1 #2).
- Architecture this design was re-aligned to: [Part 38 — engine rebuild](../_completed/38-engine-rebuild/design.md) (signal FSM), Part 48 (per-workflow endpoints), [Part 34 — action access model](../_completed/34-action-access-model/design.md) (the per-verb `links` map this design routes into), [Part 30 — engine-managed display](../_rejected/30-status-map-rendering/design.md) (rejected as a whole; its single-`link`/sentinel model is the source of the stale "already shipped" premise this design corrected).
- Workflows module tracker: [designs/workflows-module/design.md](../../design.md). Lands as a follow-on: the FSM alias, the `computeEngineLinks` custom routing + sentinel substitution, the `validateAction` custom rejection arm, the `view_link` permit + cell-shape validation, plus the concept specs and README.
