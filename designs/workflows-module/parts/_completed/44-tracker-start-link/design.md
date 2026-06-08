# Tracker `start_link` — give pre-child tracker actions a navigation target

A tracker action that is unblocked but whose child workflow hasn't been started yet (`action-required`, `child_workflow_id: null`) currently renders as a dead row — there is nothing to click until the child exists. This part adds an optional `start_link:` field to the `tracker:` block: an author-declared link to the page where the child gets created (typically an app new-entity page). The engine emits it as the action's `edit`-verb link while the child is missing; the destination page calls the existing `start-workflow` API with the tracker action's `_id` (passed as a URL param) as `parent_action_id`, and the existing engine machinery — bidirectional link write, `in-progress` transition, tracker subscription — takes over unchanged.

## Proposed change

1. **`tracker.start_link`** — optional field in the `tracker:` block, shape `{ pageId, urlQuery? }`. `pageId` is used verbatim (an app page id, or a module page via its build-resolved scoped id — `_module.pageId` in the app's `workflow_config` resolves before the engine sees it).
2. **Engine link emission** — the tracker branch of `computeEngineLinks` gains a second arm: when the action's stage is `action-required`, `child_workflow_id` is null, `start_link` is declared, and the app slug declares the `edit` verb in `access.{slug}`, emit `links.edit = start_link` with URL-query sentinels substituted. The existing arm (child exists → `view` link to the child's `workflow-overview`) is unchanged; `blocked` stays linkless.
3. **The `edit` verb on trackers acquires meaning** — "may start the child." The access validator already accepts any verb on any kind; no schema change. Per Part 34 D7, verb *presence* gates emission and per-verb *role gates* filter `visible_verbs` at read time — both apply to the start link exactly as to form/check edit links. View-only trackers stay display-only.
4. **Two `urlQuery` sentinels** — `action_id: true` → the tracker action's `_id` (this is the `parent_action_id` the destination page hands to `start-workflow`); `entity_id: true` → the tracker action's `entity_id` (the parent workflow's entity, for prefilling the child doc's parent reference). All other string values pass through verbatim as static params.
5. **Config validation** in `makeWorkflowsConfig` — `start_link` must be `{ pageId: string, urlQuery?: object }` with no other keys (in particular `title:`, familiar from custom-kind cell links, is not part of the engine-link shape and is rejected). The two reserved `urlQuery` keys `action_id` / `entity_id` are **sentinel-only**: if present, their value must be exactly `true` — a static string there is never legitimate authoring intent (the keys exist solely to carry runtime values), and a stale `action_id` literal would silently hand the wrong `parent_action_id` to `start-workflow`, cross-linking the child onto the wrong tracker. All other keys must carry string values, passed through verbatim as static params (`true` on any other key would silently ship the literal `true` into a URL; non-string statics like `count: 3` are rejected for the same reason). An author who wants a static param simply names it something other than the reserved keys.
6. **No new APIs, no FSM change, no state change on click.** Clicking the link navigates; the tracker stays `action-required` until the destination page's save flow calls `start-workflow`. Abandoning the page abandons nothing.

## Problem

The only authored path to start a tracked child today is the **paired trigger + tracker pattern** ([action-authoring Decision 5](../../../../workflows-module-concept/action-authoring/design.md)): a separate `form` action whose pre-hook creates the child entity and calls `start-workflow` with `parent_action_id`. That's the right shape when child creation *is* workflow form work. But two common cases don't fit:

- **The child entity is created on an ordinary app page** (a new-ticket page, a new-order page) that already exists and does the job better than a workflow form ever would. Routing creation through a trigger action duplicates the app page inside the workflow config.
- **The child workflow just needs starting on an existing entity** — there's no form to fill at all; the only work is one `start-workflow` call from wherever the user lands.

In both cases the tracker row is where the user *sees* "this needs to happen" — `status_map.action-required` says "Create the installation ticket" — but the row offers no way to get there. `computeEngineLinks.js:68-79` emits a tracker link only when `child_workflow_id != null`, and that link points at the *child's* overview. Before the child exists: nothing.

## Authoring shape

```yaml
type: track-installation
kind: tracker
action_group: setup
sort_order: 40
description: Tracks the device-installation workflow on the linked installation ticket.
blocked_by: [schedule-followup]
access:
  my-team-app:
    view: true # everyone sees the row
    edit: [account-manager] # only AMs get the start link
tracker:
  workflow_type: device-installation
  start_link:
    pageId: ticket-new # app page, used verbatim
    urlQuery:
      action_id: true # → tracker action _id (the parent_action_id)
      entity_id: true # → parent entity _id (prefill the ticket's lead ref)
      source: onboarding # static params pass through
status_map:
  action-required:
    my-team-app: { message: Create the installation ticket }
  in-progress:
    my-team-app: { message: Installation in progress. }
  done:
    my-team-app: { message: Installation completed. }
```

And the destination page's save flow (app-side, unchanged machinery):

```yaml
- id: create_ticket
  type: MongoDBInsertOne
  connectionId: tickets-collection
  properties:
    lead_id:
      _url_query: entity_id # parent reference prefilled from the link
    # ...

- id: start_child_workflow
  type: CallAPI
  params:
    endpointId:
      _module.endpointId: { id: start-workflow, module: workflows }
    payload:
      workflow_type: device-installation
      entity_id:
        _step: create_ticket.insertedId
      entity_collection: tickets-collection
      parent_action_id:
        _url_query: action_id
```

`start-workflow` with `parent_action_id` already writes both sides of the link and the tracker's `in-progress` transition in one server-side call; the subscription mirrors the child's lifecycle thereafter. This part adds nothing to that path.

## Key decisions

### D1 — Declared in the `tracker:` block, emitted by the engine (not a `status_map` cell link)

Part 34 D7 moved links for built-in kinds out of `status_map` cells into engine computation; `makeWorkflowsConfig.js:258-263` hard-errors a `link:` in any built-in kind's cell. The start link follows the same model: declared once on the `tracker:` block, emitted into the per-slug `links` map by `computeEngineLinks`, role-filtered at read time like every other link. The rejected alternative — author the link in the `status_map.action-required` cell, custom-kind style — would reverse that move for one kind and force per-app repetition of the same link.

`computeEngineLinks` reads `action.tracker.start_link` off the composed doc — but the planner must put it there: the insert path narrows the persisted `tracker` field to `{ workflow_type }` only (`planActionTransition.js:156-159`; the legacy `createAction.js` path is gone — deleted by Part 38 task 15). The planner therefore refreshes the tracker block on every plan, joining the existing denormalisation at `planActionTransition.js:182` (`doc.access = actionConfig.access` — the one pattern by which `computeEngineLinks` gets config-derived fields: off the composed doc, never a synthesized view): `doc.tracker = actionConfig.kind === 'tracker' ? { workflow_type, start_link } : null`. This refresh is a denormalisation detail, **not** a config-versioning mechanism — edits to `start_link` on deployed workflows remain external-migration territory like every other config change. The typedef widens to `{ workflow_type: string, start_link?: { pageId: string, urlQuery?: object } } | null`.

### D2 — Gated by the `edit` verb

Starting the child mutates workflow progress; `edit` means "may act" everywhere else in the access model. Trackers that declare only `view` keep today's display-only behaviour. The existing Part 34 lint-warn (edit-without-view) covers the misconfiguration where someone grants the start link to users who can't see the row.

Rejected: hanging the start link on `view` (no role distinction between "can watch" and "can start"), and a new verb (`start`) — the verb vocabulary is closed in v1 (Part 34 D4) and `edit` carries the right meaning.

### D3 — Sentinels: `action_id` + `entity_id`, not `entity_collection`

`action_id` is the load-bearing param — it's the `parent_action_id` for `start-workflow`, and the existing sentinel convention (`substituteActionIdSentinel.js`, built for custom-kind cell links) already establishes `action_id: true` as the spelling.

`entity_id` is included because it's a **runtime value the destination page cannot get any other way**: the child doc almost always needs a parent reference (the ticket's `lead_id`), and there is no app-callable "get action by id" API to resolve it from `action_id` server-side.

`entity_collection` is excluded as YAGNI: the workflow YAML statically declares `entity_collection`, so the author already knows it when writing `start_link` — a static param covers the rare page that needs it.

Substitution happens where the engine builds the link (inside `computeEngineLinks`'s new arm), mirroring how the existing arms construct `urlQuery` directly with concrete values.

### D4 — Link only; no direct start button

The "existing entity, just start the workflow" case also goes through a link to an app page — the page decides whether to create a doc first or call `start-workflow` immediately. One mechanism. An inline "Start" button would need entity-resolution config on the tracker (which entity is the child's?) and a new button surface in `ActionSteps`; no concrete need for that exists yet.

### D5 — Stage-gated to `action-required` with null child

- `blocked` — linkless, consistent with `STAGE_VERB_PAGE` (blocked exposes nothing for any kind).
- `action-required` + `child_workflow_id: null` — `links.edit = start_link`.
- child exists (`in-progress` / `done` / `not-required`) — today's `links.view` to the child's `workflow-overview`. The null-child guard also covers the degenerate state where a child exists while the stage reads `action-required` (shouldn't occur — `start-workflow` writes `in-progress` in the same call that sets `child_workflow_id` — but the guard makes the precedence explicit).

Links are persisted per-slug on the action doc at transition time (`planActionTransition.js:196-199`), so the start link materialises when the tracker is seeded at or unblocked into `action-required`, and is replaced by the child-overview view link when `start-workflow` writes the `in-progress` transition. No backfill concern — the module is pre-production.

### D6 — Division of labour with the paired trigger + tracker pattern

The trigger and tracker are two genuinely different lifecycles, not two views of one thing. A **trigger** is a one-shot human task — it has an assignee, a due date ("create the ticket by Friday"), a form, and completes the moment it's submitted. A **tracker** is a long-running mirror — no assignee, no deadline of its own, never touched by a human, alive as long as the child is. Folding child-creation into the tracker itself would muddle the universal fields (would `due_date` mean "start the child by" or "child must finish by"? would `assignees` name the creator or nobody?) and hybridize the kind taxonomy across every kind-branching resolver, template, and FSM table.

What the pair *was* guilty of is UX noise in the dominant case: when the child entity is created on a real app page, the in-workflow trigger form is the wrong home for that work, and its row lingers as `done` clutter. `start_link` removes exactly that case — one tracker row, linking to the page that owns creation. The paired pattern remains the right shape for the narrower case where creation is a small inline form and no app page exists: it composes two existing kinds at zero new machinery. The README documents the split this way: **app page owns creation → `start_link`; inline form owns creation → paired trigger + tracker.**

### D7 — No server-side `edit`-verb enforcement in `StartWorkflow`

Considered and rejected: having `StartWorkflow` check the parent tracker's `access.{app}.edit` gate whenever `parent_action_id` is supplied. The `edit` verb on a tracker gates **link visibility only**; the page that calls `start-workflow` and the API itself own their own auth, like every other page/API pair in consuming apps. Enforcement would also couple the trigger-action pattern to tracker access declarations — the pre-hook's `start-workflow` call runs as the submitting user, who passed the *trigger* action's gate, not the tracker's, so every `view`-only tracker linked via a trigger pre-hook would start rejecting mid-submit. Trust level is unchanged from the trigger pattern; revisit only if the module's overall trust model tightens.

## Files changed

| File | Change |
| --- | --- |
| `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` | Tracker branch: second arm emitting `links.edit = start_link` (sentinels substituted) when stage is `action-required`, child null, `start_link` declared, slug declares `edit`. Header table updated. |
| `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` | Refresh `doc.tracker` (now incl. `start_link`) from config on every plan, joining the existing `doc.access` refresh. |
| `plugins/modules-mongodb-plugins/src/connections/shared/types.js` | Widen the `tracker` typedef with optional `start_link`. |
| `modules/workflows/resolvers/makeWorkflowsConfig.js` | Validate `start_link` shape per proposed change 5 (inside the existing `kind: tracker` arm of `validateAction`). |
| Read APIs | No change — Part 42's shared `resolve_action_link.yaml` surfaces `links.edit` for pre-child tracker rows; Part 44 creates `resolve_action_link.test.js` with the tracker-row cases (see note below). |
| `modules/workflows/README.md` + concept docs ([action-authoring Decision 5](../../../../workflows-module-concept/action-authoring/design.md)) | Document `start_link`; position it as the recommended shape when an app page owns child creation, with paired trigger + tracker remaining for form-driven creation. |
| Tests | `computeEngineLinks` + `makeWorkflowsConfig` test cases. No demo edit — the current demo config is deleted by [Part 45](../45-demo-rebuild/design.md), whose `track-company-setup` exercises `start_link` with both sentinels. |

**Read-side dependency (Parts 38 + 42) — landed.** `planActionTransition` persists the per-verb map `{slug}.links` (Part 34 D7), and the verb-selection step (per-verb `links` + `visible_verbs` → the one rendered `link`) now exists: Part 38's shared `modules/shared/workflow/visible_verbs.yaml` compute stage is on disk (ref'd from `api/stages/visible_verbs_filter.yaml:16`), and [Part 42 D5](../42-timeline-action-cards/design.md)'s shared `modules/shared/workflow/resolve_action_link.yaml` stage does the priority pick over non-null link cells ∩ `visible_verbs`, adopted by all three link-projecting read APIs (`get-entity-workflows.yaml:38`, `get-workflow-overview.yaml:52`, `get-action-group-overview.yaml:33`). Part 44 needs **no read-API change of its own** — for a pre-child tracker the start link is the only link the engine emits, so the generic pick surfaces it. Part 42 shipped the stage without a test file, so Part 44's read-side contribution is creating `modules/shared/workflow/resolve_action_link.test.js` with the tracker-row cases (task 4).

## Worked example — end to end

1. `schedule-followup` completes; `blocked_by` re-evaluation fires `unblock` against `track-installation` → `action-required`. The transition's `planActionTransition` pass persists `my-team-app.links.edit = { pageId: ticket-new, urlQuery: { action_id: <tracker_id>, entity_id: <lead_id>, source: onboarding } }`.
2. On the lead page, an account-manager sees the tracker row "Create the installation ticket" as a live link; a viewer-role user sees the same message, no link (`visible_verbs.edit` false).
3. The AM clicks through to `ticket-new?action_id=<tracker_id>&entity_id=<lead_id>&source=onboarding`, fills the ticket form (lead reference prefilled from `entity_id`), saves. The page's save flow inserts the ticket and calls `start-workflow` with `parent_action_id: <tracker_id>`.
4. The engine writes the child workflow (parent back-references), its starting actions, and the tracker's `child_workflow_id` / `child_entity_id` / `child_entity_collection` + `in-progress` transition — recomputing the tracker's links to the child-overview `view` link.
5. The subscription mirrors the child's lifecycle to the tracker from here on — unchanged Part 10 behaviour.

If the AM abandons the ticket-new page at step 3, nothing happened: the tracker is still `action-required`, the link still renders.

## Known limitation — cancelled child is a dead end

If the child workflow is cancelled, the tracker lands `not-required` with its `child_workflow_id` still set, and `StartWorkflow` rejects a second link to the same tracker (`StartWorkflow.js:137-142` throws when `child_workflow_id != null`). The start link does not reappear — it's gated on a null child — so a mistakenly-created-then-cancelled child leaves the tracker permanently dark. Recovery paths: the child workflow uncancelling (`internal_mirror_child_active` fires from `not-required` → `in-progress`), or an out-of-band admin write. This dead end pre-dates this part (no retry path existed under the trigger-action pattern either); the start link just makes it user-visible. Accepted for v1 — a retry/unlink mechanism (clear the stale child link + re-arm the tracker) is its own part if a concrete need surfaces.

The mirror-image gap on the **parent** side: `StartWorkflow` checks only kind / null child / `workflow_type` match (`StartWorkflow.js:119-149`), not the parent tracker's stage. If the parent workflow is cancelled, Cancel sweeps the pre-child tracker to `not-required` (child still null), but a stale tab on the destination page can still call `start-workflow` with the old `action_id` — `internal_mirror_child_active` fires from `not-required` → `in-progress` (`fsm/tables.js:130-131`), resurrecting the tracker under a cancelled workflow. Same trust posture as D7 (the gap pre-exists under the trigger pattern), but the start link makes long-lived stale tabs the normal case rather than the exception. A stage precondition in `StartWorkflow` is its own decision, out of v1 per D7's reasoning.

## Non-goals

- **Direct start button / engine-driven child creation** — no entity-resolution config on trackers; the destination page owns creation (D4).
- **An `entity_collection` sentinel** — statically known at authoring time (D3).
- **Per-app `start_link` variants** — one link shape shared by all slugs; per-app gating is the `edit` verb's job. Revisit only if two apps concretely need different create pages for the same tracker.
- **Auto-starting the child when the tracker unblocks** — a different feature (and most children need a human-created entity first).
