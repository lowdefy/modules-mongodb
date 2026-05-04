# Task 14: Pages — `view` + `all`

## Context

After Tasks 9 + 11, internal display components and the timeline export exist. This task adds the two read-side pages:

- `pages/view.yaml` — detail (resolves activity by `_url_query: _id`).
- `pages/all.yaml` — list (with URL hydration for `contact_id` / `company_id` filter pre-population).

Reference shapes:
- `modules/companies/pages/view.yaml` — template for `view.yaml`.
- `modules/companies/pages/all.yaml` — template for `all.yaml`.

Both consume layout's `components.main_slots` and `components.sidebar_slots` vars for app-level extensibility.

## Task

### `modules/activities/pages/view.yaml`

Detail page. Resolves the activity by `_url_query: _id`, renders `view_activity` in main column, sidebar tiles (files, linked entities, events). Header actions: Edit, Mark done / Reopen / Cancel, Delete.

Layout mirrors `modules/companies/pages/view.yaml`. Two-column layout: main + sidebar.

**Main column blocks:**
1. `_ref: ../components/view_activity.yaml` — SmartDescriptions of the activity.
2. Status history timeline (reads `state.<doc>.status` array, shown newest-first).
3. Events timeline scoped to this activity:
   ```yaml
   - _ref:
       module: events
       component: events-timeline
       vars:
         reference_field: activity_ids
         reference_value:
           _url_query: _id
   ```

**Sidebar tiles:**
- Files: `_ref: ../components/tile_files.yaml` (Task 10's local wrapper).
- Linked contacts tile (custom block reading `state.<doc>.contacts`, rendered via `contact_list_items`).
- Linked companies tile (custom block reading `state.<doc>.companies`, rendered via `company_list_items`).
- Plus consumer hook: `_module.var: components.sidebar_slots`.

**Header actions** (placed in the page header bar):
- Edit button → Link to `pageId: edit` with `?_id=<id>`.
- Mark done / Reopen / Cancel — conditional buttons using the action wrappers from Task 4. Visibility: "Mark done" if `current_stage === 'open'`; "Reopen" if `done`/`cancelled`; "Cancel" if `open` or `done` (not already cancelled).
- Delete button → CallApi to `delete-activity` with `?_id=<id>`. Confirmation dialog (use Lowdefy's confirm-modal pattern from companies' delete flow if such exists).

**Page-level requests + state:**

```yaml
requests:
  - _ref: ../requests/get_activity.yaml
events:
  onMountAsync:
    - id: fetch
      type: Request
      params: get_activity
    - id: hydrate
      type: SetState
      params:
        doc:
          _request: get_activity.0
```

After fetch, `state.doc` holds the activity (with derived fields and looked-up contacts/companies from the request). Components read `state.doc.*`.

### `modules/activities/pages/all.yaml`

List page. AgGrid table + filter panel + Excel download + pagination. URL hydration on `?contact_id=<uuid>` and `?company_id=<uuid>` pre-populates filter state.

Mirror `modules/companies/pages/all.yaml`. Page state:

```yaml
events:
  onInit:
    - id: init_filter
      type: SetState
      params:
        filter:
          search: null
          type: null
          stage: null
          date_from: null
          date_to: null
          contact_id:
            _url_query: contact_id    # from tile "View all" link
          company_id:
            _url_query: company_id
        sort:
          by: updated.timestamp
          order: -1
        pagination:
          skip: 0
          pageSize: 50
  onMountAsync:
    - id: fetch
      type: Request
      params: get_activities
```

**Page blocks:**
1. Filter panel: `_ref: ../components/filter_activities.yaml`.
2. Excel download: `_ref: ../components/excel_download.yaml`.
3. Table: `_ref: ../components/table_activities.yaml`.
4. Pagination block (mirror `companies/pages/all.yaml`'s pagination shape).
5. Consumer hook: `_module.var: components.main_slots`.

**Header**: "New Activity" button or `capture_activity` block (in `mode: page`) that links to `pageId: new`.

### Manifest update

Add `_ref` entries for both pages:

```yaml
pages:
  # existing from Task 13: new, edit
  - _ref: pages/view.yaml
  - _ref: pages/all.yaml
```

## Acceptance Criteria

- `pageId: view?_id=<uuid>` renders the activity's detail with main + sidebar layout. Status history timeline shows entries newest-first. Events timeline shows lifecycle events (create, update, complete, etc.) scoped to this activity.
- Header actions render conditionally based on `current_stage`. Edit links correctly. Delete prompts confirmation, then soft-deletes.
- `pageId: all` renders the list table. Pagination + filter + Excel download all work.
- `pageId: all?contact_id=<uuid>` loads the list with the contact filter pre-applied (filter panel reflects the URL state, table shows only activities linked to that contact).
- `pageId: all?company_id=<uuid>` does the same for company filter.
- Build is clean.

## Files

- `modules/activities/pages/view.yaml` — create — detail page.
- `modules/activities/pages/all.yaml` — create — list page with URL hydration.
- `modules/activities/module.lowdefy.yaml` — modify — add the two page `_ref` entries to `pages:` list.

## Notes

- **URL hydration on `pageId: all`** is the contract that makes `tile_activities`'s "View all" link work. The link from a contact's `tile_activities` goes to `pageId: all?contact_id=<that-contact-uuid>`. The list page's `onInit` reads `_url_query: contact_id` into `state.filter.contact_id`, and the request's `match_filter` stage uses that filter.
- **Detail page's events timeline** uses `events-timeline` with `reference_field: activity_ids, reference_value: _url_query: _id`. This is the lookup that finds events emitted by the four activities APIs — they all set `references.activity_ids: [<self>]`, so the timeline finds them via that reference.
- **Status history timeline vs events timeline.** They're different blocks: status history reads the activity's own `status` array; events timeline reads the events collection filtered by `activity_ids`. Both exist on the detail page main column.
- **Header actions are stage-conditional.** Use `_state: doc.current_stage` (set during the page's `onMountAsync` from the request's derived fields) to drive button visibility. Render via `_if` chains on each button's `visible:` prop.
- **Delete confirmation.** Don't soft-delete on a single click. Verify the Lowdefy confirmation pattern — likely a Modal trigger before the actual `CallApi`. Mirror whatever companies/contacts use (if they have soft-delete; if not, this might be a new pattern for activities).
- **Pagination shape.** Companies' list uses a particular pagination pattern (offset/limit, page count, etc.). Copy that shape — don't invent a new pagination.
