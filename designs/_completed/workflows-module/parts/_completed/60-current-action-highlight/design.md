# Part 60 — Current-action highlight in action steps

On a three-tier action page (Part 56), the left column (`actions-on-entity`) lists the entity's workflows and every action as a clickable step row, but nothing marks **which** of those rows is the action the user is currently looking at. This part highlights the current action's row with a subtle background tint so the user stays oriented as they move between actions in the left panel.

This resolves the "Current-action highlight" open question Part 56 deferred (`designs/workflows-module/parts/56-three-tier-action-pages/design.md` open questions): "`ActionSteps` has no `active`/`selected` prop today … Lean: add a minimal `activeActionId` prop; defer if it slips scope."

## Proposed change

1. **`ActionSteps` gains an optional `activeActionId` prop** (string). When it equals an action's `_id`, that action's badge row renders with a subtle "current" background tint. Omitted (or non-matching) ⇒ no highlight — every existing caller is unaffected.
2. **The highlight is a single action row**, not the enclosing step/group. "Current action" is one action; the tint marks exactly the badge row whose `_id` matches.
3. **Styled in `style.css` with the antd selected-item token** `var(--ant-control-item-bg-active)`, plus a small radius and horizontal padding so the tint reads as a calm "you are here" band rather than an edge-to-edge fill. Theme-aware, matching the block's existing CSS-variable approach (`--ant-color-text-tertiary`).
4. **`actions-on-entity.yaml` takes a new optional `active_action_id` var** (default `null`) and forwards it to the block's `activeActionId`. The workspace shell supplies the value; entity-view callers pass nothing.
5. **The shell (`action-workspace.yaml`) supplies `_url_query: action_id`** — the action page's own address — as `active_action_id`. No new normalized state, no template change.

## Key decisions

### D1 — The active id comes from the URL `?action_id`, threaded as a var

Every action page (form templates _and_ the per-workflow check page) is addressed by `?action_id=…`: the templates read `_url_query: action_id` in their onMount guard (`templates/view.yaml.njk:84`) and `computeEngineLinks` builds each link with `urlQuery: { action_id }`. So "which action is on screen" is already the page's address — there is nothing to derive or store.

This is unlike `entity_id`, which Part 56 had to normalize into `_state.entity_id` because it comes from the loaded action **response** (`get_workflow_action.entity.id`), not the URL. The active action id needs no such normalization: a new `_state.active_action_id` scalar would just re-copy what `_url_query: action_id` already holds. So the shell reads `_url_query: action_id` directly and passes it down as a var. **No template change** — the templates already put `action_id` in the URL.

**Threaded as a var, not read inside the component.** `actions-on-entity` is a general component, reused on entity-view pages (Part 50) as well as inside the workspace shell. Reading `_url_query: action_id` _inside_ it would bake a workspace-specific URL convention into a general component. Instead the component declares an optional `active_action_id` var; the **shell** — which owns the action-page/URL contract — supplies `_url_query: action_id`, and entity-view callers omit it (default `null` ⇒ no highlight). The URL-convention knowledge stays at the workspace layer, and the component stays a pure "render these workflows, optionally mark one active" block. This matches the existing pattern, where the shell already reads normalized state and passes `entity_id` / `entity_connection_id` into `actions-on-entity` as vars.

### D2 — Match on `action._id`, the field the data already carries

`GetEntityWorkflows` emits each action with `_id` (`GetEntityWorkflows.js:119`), and the page URL's `action_id` is that same `_id` (the links are built as `urlQuery: { action_id: _id }`). So the match is `action._id === activeActionId` — no new field on the envelope, no mapping.

(Note: `ActionSteps.js:201` currently keys the rendered badge on `action.id ?? actionIdx`, and the data has `_id` not `id`, so the React key silently falls back to the array index today. That is a pre-existing, unrelated quirk in the `key` only; the active-match reads `action._id` explicitly and is independent of it. Left as-is — out of scope.)

### D3 — Highlight intensity and target: a subtle row-background via the selected-item token

The user's bar is "subtle background color." The target is the action's `<Badge>` row (`.action-steps-badge`, already `width: 100%`), so the tint spans the row the action occupies inside the step description. The colour is antd's `controlItemBgActive` token (`var(--ant-control-item-bg-active)`) — the same token antd uses for selected `Menu`/list items, so it is semantically "selected row", theme-aware, and light by construction.

A small `border-radius` and horizontal padding keep the tint from running edge-to-edge. This is deliberately _not_ the app `colorPrimary`: Part 56's `ActionSteps` already scopes a neutral `colorPrimary` onto the `Steps` rail connector (`ActionSteps.js:107-108`) precisely because these steps use enum-coloured icons rather than the app primary. The highlight is a separate concern (selection, not step progress) and uses the selection token, so it does not reintroduce the primary into the step rail.

## Config / API shape

`ActionSteps` schema (`schema.json`) gains one property:

```json
"activeActionId": {
  "type": "string",
  "description": "The _id of the action currently being viewed (the action page's ?action_id). When it matches an action's _id, that action's row renders with a subtle 'current' background highlight. Omit for no highlight (e.g. entity-view pages)."
}
```

`actions-on-entity.yaml` — new optional var, forwarded to the block:

```yaml
# Vars:
#   entity_id            — (required) the entity whose workflows render.
#   entity_connection_id — (required) the entity's connection id.
#   active_action_id     — (optional) the _id of the action currently on screen;
#                          highlights its row. Omit on entity-view pages.
...
- id: entity_workflows.$.action_steps
  type: ActionSteps
  properties:
    activeActionId:
      _var:
        key: active_action_id
        default: null
    # ...existing direction / actionStatusConfig / actionGroupConfig / items
```

Shell (`action-workspace.yaml`) — supplies the URL query into the existing `actions-on-entity` `_ref`:

```yaml
- _ref:
    path: components/actions-on-entity.yaml
    vars:
      entity_id:
        _state: entity_id
      entity_connection_id:
        _var: entity_connection_id
      active_action_id:
        _url_query: action_id
```

## Data flow

```
action page URL  ?action_id=<id>
        │  (already the page's address — templates read it at :84)
        ▼
action-workspace.yaml   _url_query: action_id ──► var active_action_id
        ▼
actions-on-entity.yaml  _var active_action_id (default null) ──► prop activeActionId
        ▼
ActionSteps.js          action._id === activeActionId ? add .action-steps-badge-active
        ▼
style.css               subtle var(--ant-control-item-bg-active) row tint
```

## Files changed

- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js` — read `activeActionId` from `properties`; per action compute `const isActive = activeActionId != null && action._id === activeActionId;` and add `isActive && "action-steps-badge-active"` to the `<Badge>` `className` (alongside the existing `"action-steps-badge"` / `classNames.badge`).
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/schema.json` — add the optional `activeActionId` string property (above).
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/style.css` — add `:global(.action-steps-badge-active)` rule: `background: var(--ant-control-item-bg-active);` + small `border-radius` and horizontal padding.
- `modules/workflows/components/actions-on-entity.yaml` — add the optional `active_action_id` var (default `null`) to the header comment and forward it to the `ActionSteps` block's `activeActionId` property.
- `modules/workflows/components/action-workspace.yaml` — pass `active_action_id: { _url_query: action_id }` into the `actions-on-entity` `_ref` vars.
- `docs/plugins/action-steps.md` — document the new `activeActionId` property in the block reference. (No `module.lowdefy.yaml` var change — this is a block property, not a module var.)

No changes to: the templates (the URL already carries `action_id`), `GetEntityWorkflows` (it already emits `_id`), `computeEngineLinks`, the engine, or the connection schema.

## Verification

- On a form action page, the action matching `?action_id` shows a subtle background tint in the left panel; the other rows do not.
- On a check action page, the same — the check action's row is highlighted (check links carry `?action_id` too).
- Navigating to another action via the left panel (a full page load per Part 56 D4) lands on the new page with the new action highlighted — the highlight tracks the URL.
- On an entity-view page (Part 50) where `actions-on-entity` renders without `active_action_id`, no row is highlighted (the var defaults to `null` ⇒ `activeActionId` undefined ⇒ no match).
- The highlight tint is theme-aware (light/dark) via `--ant-control-item-bg-active` and does not colour the step rail connector with the app primary (Part 56's neutral-`colorPrimary` scoping is untouched).
- `pnpm ldf:b` (demo build) compiles with the new var/property wired.

## Non-goals

- **A `selected`/`active` concept on the antd `Steps` step itself** — the highlight is the action row, not the step/group container (proposed change 2).
- **Highlighting on entity-view pages** — those callers pass no `active_action_id`; the workspace is the only context with a "current action".
- **A new normalized `_state.active_action_id` scalar** — rejected in D1; the URL `?action_id` already holds it.
- **Reworking the `ActionSteps` badge `key`** — the pre-existing `action.id ?? actionIdx` key quirk (D2 note) is unrelated and left as-is.

## Related

- **Part 56 three-tier action pages** — this part resolves Part 56's deferred "Current-action highlight" open question. The shell (`action-workspace.yaml`) and `actions-on-entity.yaml` are Part 56 artefacts; the `_url_query: action_id` source and the `entity_id` normalization precedent are both Part 56 (D-state-contract, D4).
- **Part 55 / Part 42** — `actions-on-entity` + `check-action-click`; the highlight rides the same component, adding only a display prop.
