# Task 11: Cross-Module Exports — `activity-selector` + `activities-timeline`

## Context

After Tasks 7 + 9, requests and internal display components exist. This task builds two cross-module components — both exported in the manifest's `exports.components` list (already declared in Task 1):

- `activity-selector` — Selector/MultipleSelector for picking activities from elsewhere (future deals/tickets modules).
- `activities-timeline` — content-only block (list + filters + "View all" link, **no card**) embedded by consumers' local `tile_activities.yaml` wrappers (Tasks 15 + 16).

Reference shapes:
- `modules/companies/components/company-selector.yaml` — template for `activity-selector`.
- `modules/events/components/events-timeline.yaml` — template for `activities-timeline`. The timeline is the closest analogue: a content-only cross-module block parameterised by reference field/value.

Both go in `modules/activities/components/`.

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

Content-only block — no `layout.card` wrapper. The local `tile_activities.yaml` in companies/contacts wraps this in a card (Tasks 15 + 16).

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

The `reference_field` and `reference_value` vars are set by the embedding consumer (companies' `tile_activities.yaml` will pass `reference_field: company_ids, reference_value: { _url_query: _id }`). The component reads them from `state` (set via SetState on init from vars) or directly from `_state.reference_field` / `_state.reference_value`.

The "View all" link's URL param name varies by `reference_field` — `contact_id` for contacts-side embed, `company_id` for companies-side. The `_if` chain above resolves the right param at runtime; the list page (Task 14) reads `_url_query: contact_id` and `_url_query: company_id` on init.

### Manifest update

Both `activity-selector` and `activities-timeline` are already declared in `exports.components` from Task 1. The manifest's `components:` list (lower in the file) needs `_ref` entries:

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
```

## Acceptance Criteria

- `activity-selector` renders as a dropdown when embedded in a test page. Typing filters the options. Single-select returns one ID, multi-select returns an array.
- `activities-timeline` renders an empty state when no activities link to the parent entity. With activities present, it renders one row per activity sorted by `updated.timestamp desc`, type icon visible, current-stage chip visible, "View all" link present.
- "View all" link navigates to `pageId: all, module: activities` with `urlQuery: { contact_id: <id> }` when `reference_field: contact_ids`, or `company_id: <id>` when `reference_field: company_ids`.
- Both components appear in the build output's exports list and can be `_ref`'d cross-module.
- Build is clean.

## Files

- `modules/activities/components/activity-selector.yaml` — create — selector/picker.
- `modules/activities/components/activities-timeline.yaml` — create — content-only timeline block.
- `modules/activities/module.lowdefy.yaml` — modify — add the two component `_ref` entries to the `components:` list.

## Notes

- **`activities-timeline` has no card.** This is the key architectural decision from review-5 #4. The `layout.card` wrapper, the title, the header buttons (capture activity), and the consumer-specific `on_created` refetch all live in each consumer's local `tile_activities.yaml` — see Tasks 15 and 16. This file is **content-only**: list + filters + View-all link.
- **Don't embed `capture_activity` here.** That's the consumer's responsibility — they put `capture_activity` in their card's `header_buttons` and wire it to refetch this timeline's request.
- **The timeline's list refetch hook.** Consumers wiring `capture_activity`'s `on_created` to refetch the timeline pass the request id (`get_activities_for_entity`) — that's the request the timeline uses on mount. Make sure the request id is exactly that string so consumers can target it.
- **Empty state matters.** A contact with zero activities should show a friendly "No activities yet" message, not a blank list. Mirror how `events-timeline` handles its empty case.
- **Verify `_state` access pattern** for the embedded vars (`reference_field`, `reference_value`). Component vars passed via `_ref { vars: { ... } }` may or may not surface as `_state.<var>`. Check `events-timeline.yaml`'s pattern — it uses `reference_field` / `reference_value` the same way. If state access isn't direct, use the var pattern that file uses.
