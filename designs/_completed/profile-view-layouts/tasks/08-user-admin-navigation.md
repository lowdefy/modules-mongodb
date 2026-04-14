# Task 8: Wire User-Admin Table to View Page and Update Exports

## Context

After task 6, the user-admin view page (`users-view.yaml`) exists and expects a `user_id` URL query parameter.

Currently, clicking a row in the user-admin table (`modules/user-admin/components/table_users.yaml`) navigates directly to the edit page. The design changes this to navigate to the view page instead, matching the contacts pattern (list → detail → edit).

The user-admin module's `module.lowdefy.yaml` needs to be updated to export the new view page and document the new module vars.

## Task

### 1. Update `modules/user-admin/components/table_users.yaml`

The AgGrid table has an `onRowClick` event (or similar row click handler) that links to `users-edit` with the user's `_id`. Change the link target to `users-view`.

Search for the row click event in `table_users.yaml`. It likely uses a pattern like:

```yaml
events:
  onRowClick:
    - id: go_to_user
      type: Link
      params:
        pageId:
          _module.pageId: users-edit
        urlQuery:
          user_id:
            _event: row._id
```

Change `users-edit` to `users-view`:

```yaml
pageId:
  _module.pageId: users-view
```

Keep the URL query parameter the same (`user_id` with `_event: row._id`).

**Important:** Read the full `table_users.yaml` file to find the exact event handler syntax. The AgGrid component may use `onRowClick` or a cell renderer with link. Adjust the change accordingly.

### 2. Update `modules/user-admin/module.lowdefy.yaml`

#### Add users-view page export

In the `exports.pages` array, add:

```yaml
- id: users-view
  description: Read-only user detail with profile, attributes, and access sidebar
```

#### Add page reference

In the `pages` array, add:

```yaml
- _ref: pages/users-view.yaml
```

#### Update vars description

Update the `components` var description to include the new vars:

```yaml
components:
  description: "Component overrides: profile_fields, profile_set_fields, profile_view_config, attributes_view_config, view_extra, view_access_tile, global_attributes_fields, app_attributes_fields, table_columns, download_columns, filters"
```

Add a new var for the view access tile:

```yaml
view_access_tile:
  description: Override for the access sidebar card on the view page
```

## Acceptance Criteria

- Clicking a user row in the user-admin table navigates to `users-view` (not `users-edit`)
- The `user_id` URL query parameter is passed correctly
- The view page loads and displays the user's information
- The Edit button on the view page links back to `users-edit` (wired in task 6)
- `module.lowdefy.yaml` exports `users-view` as a page
- `module.lowdefy.yaml` references `pages/users-view.yaml` in the pages array
- Module var descriptions include the new vars (profile_view_config, attributes_view_config, view_extra, view_access_tile)
- Lowdefy build succeeds with no errors

## Files

- `modules/user-admin/components/table_users.yaml` — **modify** — change row click link from users-edit to users-view
- `modules/user-admin/module.lowdefy.yaml` — **modify** — add users-view page export, page ref, and updated var descriptions

## Notes

- Read the full `table_users.yaml` to find the row click handler. The file was only partially read during design research (first 50 lines showed column definitions but not the event handlers).
- The navigation flow after this change: users list → users-view (read-only) → users-edit (form). Users can still navigate directly to edit via the Edit button on the view page.
- The `users-invite` page is unaffected — the "New Invite" button on the list page still goes directly to the invite flow.
