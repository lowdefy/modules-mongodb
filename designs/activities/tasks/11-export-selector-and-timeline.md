# Task 11: Cross-Module Exports — `activity-selector` + `activities-timeline` + `tile_activities`

## Context

After Tasks 7 + 9, requests and internal display components exist. This task builds three cross-module components — all exported in the manifest's `exports.components` list (already declared in Task 1):

- `activity-selector` — Selector/MultipleSelector for picking activities from elsewhere (future deals/tickets modules).
- `activities-timeline` — content-only block (list + filters + "View all" link, **no card**). Building block for power users wanting custom wrappers.
- `tile_activities` — self-contained tile (`layout.card` + `activities-timeline` content + `capture_activity` in header buttons). Apps drop this into companies'/contacts' sidebar slots.

Reference shapes:
- `modules/companies/components/company-selector.yaml` — template for `activity-selector`.
- `modules/events/components/events-timeline.yaml` — template for `activities-timeline`.

All three go in `modules/activities/components/`.

## Task

### `modules/activities/components/activity-selector.yaml`

Mirror `company-selector.yaml`'s shape. Single-or-multi-select picker over all active activities, fed by `get_activity_options` (Task 7).

Vars accepted (per `company-selector` convention — verify):
- `multiple: true | false`
- `value` — bound state path
- `title` — display label
- Plus whatever else companies'/contacts' selectors expose

Search inside the dropdown is wired to the request's payload so typing filters the list. Recent-first ordering comes from the request's default sort (`updated.timestamp: -1`).

The display shape per option: type icon + title + current-stage chip. Build the option label string at build time from the merged `activity_types` enum so each option shows "Call: Pricing follow-up" or similar.

### `modules/activities/components/activities-timeline.yaml`

Content-only block — no `layout.card` wrapper. Used as the body of `tile_activities` (this task) and available to apps wanting fully custom wrappers (different layout, custom filters, alternate header actions).

Shape:

```yaml
id: activities_timeline
type: Box
events:
  onMount:
    - id: fetch
      type: Request
      params: get_activities_for_entity
properties:
  # Pass reference_field + reference_value into request via state, set by the embedding component
blocks:
  - id: header
    type: Box
    blocks:
      - id: view_all_link
        type: Button
        properties:
          title: View all
          type: link
          size: small
        events:
          onClick:
            - id: go_activities
              type: Link
              params:
                pageId:
                  _module.pageId:
                    id: all
                    module: activities
                urlQuery:
                  # one of these — driven by reference_field
                  contact_id:
                    _if:
                      test:
                        _eq:
                          - _state: reference_field
                          - contact_ids
                      then:
                        _state: reference_value
                      else: null
                  company_id:
                    _if:
                      test:
                        _eq:
                          - _state: reference_field
                          - company_ids
                      then:
                        _state: reference_value
                      else: null

  - id: items
    type: Box
    blocks:
      _build.array.map:
        on:
          _request: get_activities_for_entity
        callback:
          # render one row per activity:
          # - type icon (looked up from merged enum)
          # - title (linkable to pageId:view)
          # - current-stage chip
          # - relative timestamp (updated.timestamp)
          ...

  # Empty state when no activities
  - id: empty_state
    visible:
      _eq:
        - _request: get_activities_for_entity.length
        - 0
    type: ...
    # Brief "No activities yet" message
```

The `reference_field` and `reference_value` vars are set by whoever embeds `activities-timeline` — typically `tile_activities` (in this task) or an app's custom wrapper. The component reads them from `state` (set via SetState on init from vars) or directly from `_state.reference_field` / `_state.reference_value`.

The "View all" link's URL param name varies by `reference_field` — `contact_id` for contacts-side embed, `company_id` for companies-side. The `_if` chain above resolves the right param at runtime; the list page (Task 14) reads `_url_query: contact_id` and `_url_query: company_id` on init.

### `modules/activities/components/tile_activities.yaml`

Self-contained tile combining `layout.card` + `activities-timeline` + `capture_activity` in `header_buttons`. Drop-in for app-level slot wiring on companies/contacts sidebars.

Shape:

```yaml
_ref:
  module: layout
  component: card
  vars:
    title:
      _if_none:
        - _state: vars.title
        - Activity   # default
    header_buttons:
      _if:
        test:
          _if_none:
            - _state: vars.show_capture
            - true   # default to showing the capture button
        then:
          - _ref:
              module: activities
              component: capture_activity
              vars:
                label: Log activity
                icon: AiOutlinePlus
                button_type: link
                size: small
                mode: modal
                prefill:
                  _state: vars.prefill   # forwarded from the host's slot ref
                on_created:
                  - id: refetch_activities
                    type: Request
                    params: get_activities_for_entity   # auto-wired refetch
        else: []
    blocks:
      - _ref:
          module: activities
          component: activities-timeline
          vars:
            reference_field:
              _state: vars.reference_field
            reference_value:
              _state: vars.reference_value
```

Vars (consumer-passed):

| Var | Required? | Default | Purpose |
| --- | --- | --- | --- |
| `reference_field` | yes | — | Filter field on activities (`contact_ids`, `company_ids`, future `deal_ids`). |
| `reference_value` | yes | — | The entity ID to filter on. Typically `{ _url_query: _id }` for detail-page hosts. |
| `title` | no | `Activity` | Card title override. |
| `prefill` | no | `{}` | Forwarded to the embedded `capture_activity`'s `prefill` var so logged activities pre-link to the host. |
| `show_capture` | no | `true` | Set `false` to hide the header capture button (read-only sidebar tile). |

Verify the `_state: vars.<X>` pattern resolves — Lowdefy's component-var passing might surface vars as `_state.vars.X` or directly as `_state.X`. Mirror whatever pattern other parameterised cross-module components in this codebase use.

### Manifest update

Three `_ref` entries in the manifest's `components:` list (declared in `exports.components` already from Task 1):

```yaml
components:
  # existing: activity_types
  - id: activity_types
    component:
      _build.object.assign:
        - _ref: enums/activity_types.yaml
        - _module.var: activity_types
  # add:
  - id: activity-selector
    component:
      _ref: components/activity-selector.yaml
  - id: activities-timeline
    component:
      _ref: components/activities-timeline.yaml
  - id: tile_activities
    component:
      _ref: components/tile_activities.yaml
```

## Acceptance Criteria

- `activity-selector` renders as a dropdown when embedded in a test page. Typing filters the options. Single-select returns one ID, multi-select returns an array.
- `activities-timeline` renders an empty state when no activities link to the parent entity. With activities present, it renders one row per activity sorted by `updated.timestamp desc`, type icon visible, current-stage chip visible, "View all" link present.
- "View all" link navigates to `pageId: all, module: activities` with `urlQuery: { contact_id: <id> }` when `reference_field: contact_ids`, or `company_id: <id>` when `reference_field: company_ids`.
- `tile_activities` renders as a `layout.card` titled "Activity" (or consumer-overridden title), with a "Log activity" button in the header that opens the capture modal pre-filled with whatever `prefill` the consumer passes. After successful capture the timeline refetches automatically and the new activity appears in the list.
- Setting `show_capture: false` hides the header button and renders the tile read-only.
- All three components appear in the build output's exports list and can be `_ref`'d cross-module.
- Build is clean.

## Files

- `modules/activities/components/activity-selector.yaml` — create — selector/picker.
- `modules/activities/components/activities-timeline.yaml` — create — content-only timeline block.
- `modules/activities/components/tile_activities.yaml` — create — self-contained tile drop-in.
- `modules/activities/module.lowdefy.yaml` — modify — add three component `_ref` entries to the `components:` list.

## Notes

- **`tile_activities` is the integration surface for companies/contacts.** Per `design.md`'s Linking section and `decisions.md`, activities is an optional dep for those modules — they don't ship local wrappers, they don't embed activities tiles in `view.yaml`. Apps that want activities surfacing on companies/contacts wire `tile_activities` into the parent module's `components.sidebar_slots` from app config. Tasks 15 + 16 (companies/contacts wiring) reflect this — they're now just the `tile_events` "Activity" → "History" rename, no new files.
- **`activities-timeline` stays a separate export** for power users — apps wanting custom wrappers (different card style, custom filters, alternate header buttons, etc.) ref `activities-timeline` directly. Pattern mirrors files' `file-card` (drop-in) plus `file-manager` (content-only).
- **Don't embed `capture_activity` directly inside `activities-timeline`.** That's `tile_activities`' responsibility. Apps using `activities-timeline` raw (the power-user case) wire their own `capture_activity` if they want one.
- **The timeline's list refetch hook.** `tile_activities` auto-wires `on_created: [{ type: Request, params: get_activities_for_entity }]`. Make sure the request id matches exactly so the refetch lands.
- **Empty state matters.** A contact with zero activities should show a friendly "No activities yet" message, not a blank list. Mirror how `events-timeline` handles its empty case.
- **Verify component-var access pattern** for `tile_activities`'s `_state.vars.<X>` reads. Lowdefy's component-var passing might surface vars at `_state.vars.X`, `_state.X`, or via a different mechanism. Check `events-timeline.yaml`'s pattern (it accepts `reference_field` / `reference_value` similarly) and mirror it. If access isn't via state, restructure to the working pattern.
