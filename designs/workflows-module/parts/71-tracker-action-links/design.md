# Tracker action links

A `kind: tracker` action lives on a parent workflow and mirrors a child workflow running on a related entity. Its card links a user to two different places over its life: **before** the child exists, "go create it"; **after**, "go look at it". Today those two links are computed by a bespoke arm — the post-child link is hardcoded to the child's _workflow-overview_ page (almost never what you want), and the pre-child link is authored in a one-off `tracker.start_link` field instead of alongside every other authorable link. This part makes the post-child link default to the **child entity page**, moves both authorable links into `status_map` using the same grammar custom actions already use, and — in the process — deletes the redundant URL-sentinel mechanism in favour of the Nunjucks templating that already renders every other cell value.

## Proposed change

1. **Post-child `view` defaults to the child entity page.** Remove the `view → {entry}/workflow-overview` arm. Once the child exists, the tracker `view` link is engine-built as `{ pageId: child_entity.page_id, urlQuery: { [child_entity.id_query_key]: child_entity.id } }` — no author config. This mirrors exactly how `GetWorkflowOverview` builds its `entity_link`.

2. **Denormalize the child entity page at child creation.** `StartWorkflow`'s parent-tracker mirror fire already carries `child_entity: { connection_id, id }`. Extend it to `child_entity: { connection_id, id, page_id, id_query_key }`, read from the child's materialized `workflowConfig.entity`. Written once at creation; the low-risk staleness (child later moving its entity page) is accepted rather than moving link computation to read time.

3. **All authorable tracker links move into `status_map`, with the same keys custom actions use:**
   - `status_map[stage][slug].link` — the **pre-child start link**, routed to the `edit` slot (working verb at `action-required`).
   - `status_map[stage][slug].view_link` — the **post-child view override**, routed to the `view` slot; when authored it beats the entity default.

4. **`tracker.start_link` is removed** (breaking). The `tracker:` block carries only structural config (`child_workflow_type`). The build validator rejects a leftover `start_link` with a message pointing at its new home.

5. **Authored link cells are no longer persisted on the action doc.** They are rendered, fed to `computeEngineLinks` as an input, and dropped. Only the computed `links` map (and `message` / `status_title`) remains on the doc.

6. **URL-query sentinels are deleted; `urlQuery` values become Nunjucks templates.** `action_id: true` → `"{{ _id }}"`, `entity_id: true` → `"{{ entity.id }}"`, plus `"{{ child_entity.id }}"` / `"{{ child_workflow_id }}"` and **arbitrary param names** (`ticket_id: "{{ child_entity.id }}"`). One substitution mechanism, applied uniformly to custom and tracker links.

## Key decisions and rationale

### Authored links are per-stage inputs, not persisted state

Today `planActionTransition` deep-merges the rendered `status_map` cell — `message`, `link`, `view_link` — onto `doc[slug]`, **then** stamps the computed `doc[slug].links` map beside it. Every read path (`GetWorkflowOverview`, `GetEntityWorkflows`, `GetEventsTimeline`, `GetWorkflowAction`, `GetWorkflowActionGroupOverview`) reads only `doc[slug].links` (via `collapseLink`) and `doc[slug].message`. **Nothing reads `.link` / `.view_link`** — they are consumed once, in the same transition that wrote them, then persist as dead weight.

So the raw link cells become an **argument** to `computeEngineLinks`, not doc state. `planActionTransition` renders the cell, hands the link cells to the engine, and merges only the display copy (`message` / `status_title`) onto the doc. The only link data persisted is the computed `links` map.

A consequence worth stating plainly: **links become per-stage** (computed from the current stage's cell), no longer sticky across stages. This is already how the one real custom config authors — `apps/workflows-test/.../review-thing.yaml` repeats its `link:` on every working stage rather than relying on stickiness. And it dissolves the tracker slot-collision problem for free (below).

### Two roles, two keys, routed by child presence — no stickiness gymnastics

The tracker's two links serve mutually-exclusive lifecycle halves:

- **Pre-child** (`child_workflow_id == null`): the `.link` cell → `edit` slot, at `action-required` only, gated on the `edit` verb. "Go create the child."
- **Post-child** (`child_workflow_id != null`): the `.view_link` override (else the entity default) → `view` slot, gated on the `view` verb. "Go look at the child."

Because links are now per-stage inputs, there is **no sticky value to leak**: post-child we render the `in-progress` / `done` / `not-required` cell, which carries no start `link`, so nothing can be misrouted into a post-child slot. `collapseLink` (priority `edit > review > error > view`) can't mis-pick either, because the losing slot is always `null` — the arm never populates `edit` post-child. The disambiguation is structural (distinct keys × child-presence branch), not a fight against merge semantics.

This also makes the tracker arm a near-mirror of the custom arm — `.link` → the active/working slot, `.view_link` → the view slot — which is the consistency the requirement asks for. The differences that keep it a separate arm: the post-child **default** (child entity page vs. custom's `{workflow_type}-action` observer page) and the pre-child/post-child gate.

### Default view = child entity, not child overview

The old default sent users to the child's _workflow-overview_ page (`?workflow_id=<child>`). In practice the useful destination is the child **entity** — the company you just set up, the ticket you're tracking — which is where `GetWorkflowOverview` already points its breadcrumb. The child workflow config already declares this page (`entity.page_id` + `entity.id_query_key`, default `_id`); we just need those two values on the tracker doc, captured at child creation alongside the id already denormalized there. Authors who genuinely want the child overview (or an escalation page, or a workflow-specific view) author a `.view_link` override — the escape hatch is the same grammar as everything else.

### One substitution mechanism: Nunjucks, not sentinels

Every string in a `status_map` cell is **already** rendered through Nunjucks against the action doc (`renderStatusMap` → `renderTree`) — that is how `{{ physical_id }}` works in a `message`. The URL sentinels (`action_id: true` → `action._id`, `entity_id: true` → `action.entity.id`) are a **second, narrower layer** applied on top of that same render, in `computeEngineLinks.substituteSentinels`. Two mechanisms for one job, and the sentinel one can only ever produce a param whose **name equals the sentinel** — which is exactly why `?ticket_id=<child id>` was impossible.

Dropping sentinels collapses this to one rule: **a `urlQuery` value is a Nunjucks template.** It is strictly more capable (any doc field, any param name), consistent with `message`, and lets us delete `substituteSentinels` entirely — `computeEngineLinks` becomes pure slot-routing. The migration is mechanical:

| Old (sentinel)    | New (Nunjucks)                                         |
| ----------------- | ------------------------------------------------------ |
| `action_id: true` | `"{{ _id }}"`                                          |
| `entity_id: true` | `"{{ entity.id }}"`                                    |
| — _(impossible)_  | `"{{ child_entity.id }}"`, `"{{ child_workflow_id }}"` |
| — _(impossible)_  | arbitrary name — `ticket_id: "{{ child_entity.id }}"`  |

Two caveats, both acceptable:

- **Autoescaping is on** (as for `message` / `description`). Nunjucks HTML-escapes the rendered value. Entity and workflow ids in this system are plain consecutive-id strings, so escaping never alters them — but a value containing `&`/`<` would be escaped, unlike raw sentinel injection.
- **Engine-built links are unaffected.** The `check` / `form` per-verb pages and the tracker child-entity **default** are constructed in code directly from doc fields (`action._id`, `child_entity.id`) — they never used sentinels or Nunjucks and don't now.

### Breaking removal of `tracker.start_link`, with a signpost

Per requirement, `start_link` is removed outright — no shim, no fallback. Rather than let a leftover `start_link` be silently ignored (the `tracker:` block isn't strict-keyed today), the validator rejects it explicitly: _"`tracker.start_link` is removed — author the pre-child navigation as `status_map.action-required.{slug}.link` instead."_ Same posture as the existing `tracker.workflow_type` → `child_workflow_type` rename error.

### Scope: this touches custom actions too

Deleting sentinels and un-persisting raw link cells is a uniform change to the authored-link pipeline, not a tracker-only one. The custom-action test app (`review-thing.yaml`) and its e2e migrate off `action_id: true` to `"{{ _id }}"`. This is the cost of "one correct way"; keeping sentinels alive only for custom would defeat the consolidation.

## Current state

`computeEngineLinks.js` — the `tracker` arm:

```js
// Arm 1: child exists → view to child workflow-overview.
if ("view" in verbsDeclared && action.child_workflow_id != null) {
  links.view = {
    pageId: scoped(entryId, "workflow-overview"),
    urlQuery: { workflow_id: action.child_workflow_id },
  };
}
// Arm 2: pre-child at action-required + declared start_link → edit.
const startLink = action.tracker?.start_link;
if (
  "edit" in verbsDeclared &&
  stage === "action-required" &&
  action.child_workflow_id == null &&
  startLink != null
) {
  links.edit = resolveCellLink(startLink, action);
}
```

- `substituteSentinels(urlQuery, action)` resolves `action_id`/`entity_id`; shared by the tracker arm and the custom branch.
- `planActionTransition.js` deep-merges the rendered cell (incl. `link`/`view_link`) onto the doc, then reads it back via `computeEngineLinks`, then stamps `links`. It also denormalizes `tracker.start_link` onto the doc when declared.
- `StartWorkflow.js` `trackerFires[].payload.fields.child_entity = { connection_id, id }`.
- `makeWorkflowsConfig.js`: `validateTrackerStartLink` validates `tracker.start_link`; `validateStatusMapCells` accepts `link`/`view_link` only for `kind: custom` (`isCustom`); `validateEngineLinkShape` treats `action_id`/`entity_id` as sentinel keys (value must be `true`), all other `urlQuery` values must be strings.

Tracker stages (`fsm/tables.js`): `blocked` → `action-required` (pre-child), then `in-progress` → `done` | `not-required` (post-child). `none` is the FSM creation row, never stored.

## Proposed authoring grammar

**Tracker** — start link and (optional) view override, both in `status_map`:

```yaml
type: track-company-setup
kind: tracker
access:
  demo:
    view: true
    edit: true # gates the pre-child start link
tracker:
  child_workflow_type: company-setup # structural config only
status_map:
  blocked:
    demo: { message: Convert the lead once the PO is uploaded. }
  action-required:
    demo:
      message: Convert the lead to a customer.
      link: # pre-child start link → edit slot
        pageId:
          _module.pageId: { id: new, module: companies }
        urlQuery:
          action_id: "{{ _id }}" # tracker action _id → parent_action_id
          entity_id: "{{ entity.id }}" # parent (lead) _id
  in-progress:
    demo: { message: Company setup in progress. }
    # no view_link → default view → companies/view?_id=<child company id>
  done:
    demo: { message: Company setup complete. }
  not-required:
    demo: { message: Conversion skipped. }
```

Optional post-child override (e.g. an escalation page keyed by an arbitrary param):

```yaml
in-progress:
  demo:
    message: Company setup in progress.
    view_link:
      pageId: support/ticket-view
      urlQuery:
        ticket_id: "{{ child_entity.id }}" # → support/ticket-view?ticket_id=<child id>&wf=<child wf>
        wf: "{{ child_workflow_id }}"
```

**Custom** (migration — `action_id: true` → `"{{ _id }}"`):

```yaml
status_map:
  action-required:
    test:
      message: Review the thing on the app page.
      link:
        { pageId: custom-thing-review, urlQuery: { action_id: "{{ _id }}" } }
```

## Engine changes

**`computeEngineLinks({ action, renderedCells, entry_id })`** — new `renderedCells` input (the rendered `status_map` cell for the target stage, per slug); authored links are read from it, never from `action[slug]`.

- `substituteSentinels` — **deleted**. `resolveCellLink` collapses to passing `{ pageId, urlQuery? }` through verbatim (already Nunjucks-rendered).
- `check` / `form` arm — unchanged (engine pages built from `STAGE_VERB_PAGE`, `urlQuery: { action_id: action._id }` in code).
- `custom` arm — reads `renderedCells[slug]?.link` (→ `STAGE_WORKING_VERB[stage]` slot) and `renderedCells[slug]?.view_link` (→ `view` slot, else the `{workflow_type}-action` observer default). No substitution.
- `tracker` arm — rewritten:
  ```js
  const cell = renderedCells[slug] ?? {};
  if (action.child_workflow_id == null) {
    // pre-child: start link → edit slot
    if (
      "edit" in verbsDeclared &&
      stage === "action-required" &&
      cell.link != null
    ) {
      links.edit = resolveCellLink(cell.link);
    }
  } else if ("view" in verbsDeclared) {
    // post-child: view override else child-entity default
    links.view =
      cell.view_link != null
        ? resolveCellLink(cell.view_link)
        : {
            pageId: action.child_entity.page_id,
            urlQuery: {
              [action.child_entity.id_query_key]: action.child_entity.id,
            },
          };
  }
  ```

**`planActionTransition.js`** — render → compute → merge-display → stamp:

```js
const rendered = renderStatusMap({
  cell,
  plannedActionDoc: doc,
  mergedMetadata: doc.metadata,
});
const linksMap = computeEngineLinks({
  action: doc,
  renderedCells: rendered,
  entry_id,
});
doc = deepMerge(doc, stripLinkCells(rendered)); // drop link/view_link; keep message/status_title
for (const [slug, links] of Object.entries(linksMap)) {
  doc[slug] = { ...doc[slug], links };
}
```

`stripLinkCells` removes `link` / `view_link` from each slug sub-object before the merge. The `tracker.start_link` denormalization block is removed; `doc.tracker` carries only `child_workflow_type`.

**`StartWorkflow.js`** — the mirror fire denormalizes the child entity page:

```js
child_entity: {
  connection_id: plannedWorkflowDoc.entity.connection_id,
  id: plannedWorkflowDoc.entity.id,
  page_id: workflowConfig.entity.page_id,
  id_query_key: workflowConfig.entity.id_query_key, // materialized default "_id"
},
```

**`makeWorkflowsConfig.js`** —

- `validateStatusMapCells`: accept `link`/`view_link` for `kind: custom` **and** `kind: tracker` (`isCustom || isTracker`); still reject on `form`/`check`.
- `validateEngineLinkShape`: drop the sentinel special-case; **all** `urlQuery` values must be strings. A leftover `X: true` fails with a hint (_"urlQuery values are Nunjucks templates, e.g. `\"{{ _id }}\"`; the `action_id` / `entity_id` sentinels were removed"_).
- Remove `validateTrackerStartLink`; add an explicit rejection of `tracker.start_link`.

## Files changed

- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — `renderedCells` input, tracker-arm rewrite, delete `substituteSentinels`, simplify `resolveCellLink`, header docstring.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — render→compute→merge-display→stamp; `stripLinkCells`; drop `start_link` denormalization; `doc.tracker` = `{ child_workflow_type }`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — add `page_id` + `id_query_key` to the mirror fire's `child_entity`.
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — validator changes above.
- Tests: `computeEngineLinks.test.js`, `planActionTransition.test.js`, `StartWorkflow.test.js`, `makeWorkflowsConfig.test.js`.
- Docs: `docs/workflows/how-to/track-a-child-workflow.md`, `docs/workflows/reference/authoring-grammar.md` (tracker block drops `start_link`; `status_map` `link`/`view_link` documented for custom + tracker; `urlQuery` reserved-keys/sentinel tables replaced with the Nunjucks rule).
- Demo: `apps/demo/modules/workflows/workflow_config/onboarding/track-company-setup.yaml` — `start_link` → `status_map.action-required.demo.link` with `{{ _id }}` / `{{ entity.id }}`; no `view_link` (verify the card lands on `companies/view`).
- Test app: `apps/workflows-test/modules/workflows/workflow_config/custom-action/review-thing.yaml` — `action_id: true` → `"{{ _id }}"` (e2e assertions on the concrete `_id` still hold).

## Non-goals

- No read-time recomputation of the child entity link — the denormalized page is written once at child creation; staleness if the child later moves its entity page is accepted.
- No `title` field on the engine-link shape — button labels come from the verb defaults (`collapseLink` / `labelledLink`), unchanged.
- No change to the tracker FSM, the mirror signals, or `runTrackerCascade`.
