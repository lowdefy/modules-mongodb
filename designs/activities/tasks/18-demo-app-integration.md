# Task 18: Demo App Integration

## Context

After Tasks 1–17, the activities module is fully built and the `tile_events` rename has landed in companies + contacts. This final task integrates the module into the demo app at `apps/demo/`:

1. Register the `activities` module in `apps/demo/modules.yaml` with deps wired (layout, events, contacts, companies, files).
2. **Wire `tile_activities` into companies' and contacts' sidebar slots via app-level vars overrides** — the demo is the working reference for consumers wiring activities-on-companies/contacts. Companies and contacts don't depend on activities at module level (per `decisions.md` §7 / Sam's PR-32 #4 review); apps wire the tile themselves.
3. Wire any required vars (likely just `s3_region` if it inherits, or activities' own minimal var defaults).
4. Add nav link to the activities list (the module exports a `default` menu — verify it's auto-included or needs explicit reference).
5. Drop a reference `capture_activity` on the demo app's home page so consumers have a working example of out-of-tile usage.

Reference: `apps/demo/modules.yaml` — current shape. `apps/demo/menus.yaml` — current nav config. `apps/demo/pages/` — home page.

## Task

### `apps/demo/modules.yaml` (modify)

Add the activities module entry. Follow the existing pattern for other modules:

```yaml
- id: activities
  source: "file:../../modules/activities"
  vars:
    _ref: modules/activities/vars.yaml
```

Or if using inline vars (no separate vars file):

```yaml
- id: activities
  source: "file:../../modules/activities"
  vars: {}    # empty — relies on the module's defaults
```

If a `modules/activities/vars.yaml` file is the convention (companies/contacts use this — verify), create it with empty defaults that the demo doesn't need to override. Otherwise omit.

The activities entry can go anywhere in the list, but conventionally near contacts/companies (the entity-modules block).

### Slot wiring: `apps/demo/modules/companies/vars.yaml` (modify or create)

Demo's companies vars override needs `tile_activities` slotted into the sidebar. If the file already exists, add to its `components.sidebar_slots`; otherwise create it.

```yaml
components:
  sidebar_slots:
    - _ref:
        module: activities
        component: tile_activities
        vars:
          reference_field: company_ids
          reference_value:
            _url_query: _id
          prefill:
            company_ids:
              - _url_query: _id
```

### Slot wiring: `apps/demo/modules/contacts/vars.yaml` (modify or create)

Same shape, swapping `company_ids` → `contact_ids`:

```yaml
components:
  sidebar_slots:
    - _ref:
        module: activities
        component: tile_activities
        vars:
          reference_field: contact_ids
          reference_value:
            _url_query: _id
          prefill:
            contact_ids:
              - _url_query: _id
```

### `apps/demo/vars.yaml` or wherever menus are configured (if needed)

If the app's `menus.yaml` aggregates module menus by explicit declaration, add an entry pointing at activities' `default` menu. If menus are auto-loaded from each module's exported menu, no change needed. Verify the demo app's pattern.

### `apps/demo/pages/home.yaml` (modify)

Add a `capture_activity` block on the home page as a reference placement. Goal: show consumers what an out-of-tile capture button looks like.

```yaml
# inside the home page's blocks list, somewhere prominent (e.g., a header card or dashboard tile)
- _ref:
    module: activities
    component: capture_activity
    vars:
      label: New activity
      icon: AiOutlinePlus
      button_type: primary
      size: middle
      mode: modal
      # No prefill — global capture, user picks contacts/companies inside the modal
```

This is the reference example. Consumers landing on the demo see a "New activity" button on the home page; clicking opens the modal.

## Acceptance Criteria

- `apps/demo/modules.yaml` declares activities with deps wired.
- Build (`pnpm ldf:b`) succeeds end-to-end.
- Running the demo app, the nav menu shows an "Activities" link going to the list page.
- The home page shows a "New activity" button. Clicking opens the capture modal. Submitting creates an activity.
- Navigating to a contact's or company's detail page shows the new "Activity" sidebar tile alongside the renamed "History" tile.
- The activities list page loads and displays the activity created via the home-page button.

## Files

- `apps/demo/modules.yaml` — modify — register activities module.
- `apps/demo/modules/companies/vars.yaml` — modify or create — slot `tile_activities` into companies' sidebar.
- `apps/demo/modules/contacts/vars.yaml` — modify or create — slot `tile_activities` into contacts' sidebar.
- `apps/demo/menus.yaml` — modify (if needed) — wire nav link.
- `apps/demo/pages/home.yaml` — modify — add reference `capture_activity`.
- `apps/demo/modules/activities/vars.yaml` — create (if convention requires) — minimal vars override file.

## Notes

- **Verify the demo's vars-file convention.** Companies/contacts each have a `modules/companies/vars.yaml` referenced from the modules.yaml. If activities follows the same, create the file (likely empty or with one-or-two override values like a custom `label`). If activities can be registered with inline `vars: {}` without a separate file, skip the vars file.
- **Atlas Search index** is needed for the list page to work (per design's Indexes section). The demo's MongoDB setup needs to apply the index — this might happen via `splice-indexes` or a manual setup step. Verify how companies' Atlas index gets applied in the demo and follow the same path.
- **No reverse-denormalization to update on companies/contacts.** Activities deliberately don't denormalize — see `decisions.md` "Non-questions worth recording." Demo data isn't affected.
- **Home-page placement** is a stylistic choice. The design says "left to the consuming app — it drops `capture_activity` wherever makes sense, usually a prominent dashboard tile or header action." The demo's choice signals one good placement to consumers; it doesn't constrain them.
