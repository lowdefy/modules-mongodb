# Task 13: Pages — `new` + `edit`

## Context

After Tasks 8 + 12, `form_activity` and the capture-flow exports exist. This task adds the two form pages:

- `pages/new.yaml` — create (with URL prefill).
- `pages/edit.yaml` — edit existing.

Both wrap `form_activity` in a standard page layout. The difference: `new` initializes from `_url_query` (prefill contract), submits to `create-activity`. `edit` initializes from `get_activity` (loaded by `_url_query: _id`), submits to `update-activity`.

Reference shapes:
- `modules/companies/pages/new.yaml` — template for `new.yaml`.
- `modules/companies/pages/edit.yaml` — template for `edit.yaml`.

## Task

### `modules/activities/pages/new.yaml`

Create page with URL-prefill contract.

URL params accepted (all optional):
- `type` — pre-selects the type Selector.
- `title` — pre-fills the title field.
- `contact_id` (singular) — adds one contact to `contact_ids`.
- `contact_ids[]` — adds multiple contacts.
- `company_id` (singular) — adds one company to `company_ids`.
- `company_ids[]` — adds multiple companies.

`description` is **not** URL-prefillable (Tiptap HTML doesn't round-trip cleanly).

Shape:

```yaml
id: new
type:
  _ref:
    module: layout
    path: page  # or whatever the layout module's page-template path is — verify
properties:
  title:
    _string.concat:
      - "New "
      - _module.var: label
events:
  onInit:
    - id: prefill
      type: SetState
      params:
        # Build initial form state from URL query params
        values:
          _id:
            # Generate a UUID — Lowdefy operator? _uuid? verify pattern
            ...
          type:
            _url_query: type
          title:
            _if_none:
              - _url_query: title
              - ""
          contact_ids:
            _array.concat:
              - _if_none:
                  - _array.from:
                      - _url_query: contact_id
                  - []
              - _if_none:
                  - _url_query: contact_ids
                  - []
          company_ids:
            _array.concat:
              - _if_none:
                  - _array.from:
                      - _url_query: company_id
                  - []
              - _if_none:
                  - _url_query: company_ids
                  - []
          description: ""
          attributes: {}
blocks:
  - id: form_box
    type: Box
    blocks:
      - _ref:
          path: ../components/form_activity.yaml
  - id: submit_bar
    type: Box
    blocks:
      - id: submit_button
        type: Button
        properties:
          title: Create
          type: primary
        events:
          onClick:
            - id: create
              type: CallApi
              params:
                endpointId: create-activity
                payload:
                  _id:
                    _state: values._id
                  type:
                    _state: values.type
                  title:
                    _state: values.title
                  description:
                    _state: values.description
                  contact_ids:
                    _state: values.contact_ids
                  company_ids:
                    _state: values.company_ids
                  attributes:
                    _state: values.attributes
            - id: nav_to_view
              type: Link
              params:
                pageId:
                  _module.pageId: view
                urlQuery:
                  _id:
                    _state: values._id
```

### `modules/activities/pages/edit.yaml`

Edit page. Loads the activity by `_url_query: _id`, populates form state, submits to `update-activity` (sends `updated.timestamp` for optimistic concurrency).

```yaml
id: edit
type:
  _ref:
    module: layout
    path: page
properties:
  title:
    _string.concat:
      - "Edit "
      - _module.var: label
requests:
  - _ref: ../requests/get_activity.yaml
events:
  onMountAsync:
    - id: fetch
      type: Request
      params: get_activity
    - id: hydrate_form
      type: SetState
      params:
        values:
          _id:
            _request: get_activity.0._id
          type:
            _request: get_activity.0.type
          title:
            _request: get_activity.0.title
          description:
            _request: get_activity.0.description
          contact_ids:
            _if_none:
              - _request: get_activity.0.contact_ids
              - []
          company_ids:
            _if_none:
              - _request: get_activity.0.company_ids
              - []
          attributes:
            _if_none:
              - _request: get_activity.0.attributes
              - {}
          updated_timestamp:
            _request: get_activity.0.updated.timestamp
blocks:
  - id: form_box
    type: Box
    blocks:
      - _ref:
          path: ../components/form_activity.yaml
  - id: submit_bar
    type: Box
    blocks:
      - id: submit_button
        type: Button
        properties:
          title: Save
          type: primary
        events:
          onClick:
            - id: update
              type: CallApi
              params:
                endpointId: update-activity
                payload:
                  _id:
                    _state: values._id
                  updated:
                    timestamp:
                      _state: values.updated_timestamp
                  type:
                    _state: values.type      # included for completeness; API ignores
                  title:
                    _state: values.title
                  description:
                    _state: values.description
                  contact_ids:
                    _state: values.contact_ids
                  company_ids:
                    _state: values.company_ids
                  attributes:
                    _state: values.attributes
            - id: nav_to_view
              type: Link
              params:
                pageId:
                  _module.pageId: view
                urlQuery:
                  _id:
                    _state: values._id
```

### Manifest update

Add the page `_ref` entries (declared in Task 1's `exports.pages` already):

```yaml
pages:
  # existing
  - _ref: pages/new.yaml
  - _ref: pages/edit.yaml
```

## Acceptance Criteria

- `pageId: new` renders the form. With no URL params, fields are empty (or default to first type). With `?type=call&contact_id=<uuid>`, the type Selector is pre-set to "Call" and `contact_ids` includes the UUID.
- Submitting `new` calls `create-activity` and navigates to `pageId: view` with `?_id=<new-uuid>`.
- `pageId: edit` with `?_id=<existing-uuid>` loads the activity, populates the form. Submitting calls `update-activity` with the loaded `updated.timestamp` for optimistic concurrency. Navigates to `pageId: view` after save.
- Edit form's submit fails with stale-state if `updated.timestamp` is outdated; user must refetch and retry.
- Build is clean.

## Files

- `modules/activities/pages/new.yaml` — create — create page with URL prefill.
- `modules/activities/pages/edit.yaml` — create — edit page with optimistic concurrency.
- `modules/activities/module.lowdefy.yaml` — modify — add the page `_ref` entries to the `pages:` list.

## Notes

- **UUID generation client-side.** Activities use plain UUIDs (`_id` generated client-side, per `decisions.md` §2). Verify the Lowdefy operator for UUID generation — likely `_uuid` or similar. Check how files module generates ids since that's also UUID-based.
- **`description` not in URL prefill** for `new`. Don't try to support it. If a channel needs to seed description (calendar/email ingestion), they call `create-activity` directly with `source.raw` set, not via URL navigation.
- **`updated_timestamp` in form state.** Edit page reads this from the loaded request and passes it back in the update payload. The form fields don't show it; it's a hidden round-trip carrier.
- **Single-vs-array URL params.** `new`'s `onInit` should accept both `?contact_id=<uuid>` (single) and `?contact_ids[]=<uuid>&contact_ids[]=<uuid>` (multiple). The `_array.concat` + `_array.from` handles the merge — a single `contact_id` becomes a one-element array, multi-IDs come in as an array, both get concatenated. Empty params produce empty arrays.
- **Page layout wrapping.** Use `layout.page` (or whatever the layout module exports). The exact ref shape depends on the layout module — check companies' `pages/new.yaml` and copy the wrapping pattern.
- **Submit-bar navigation.** After successful create, navigate to the new activity's `pageId: view`. After successful edit, navigate back to `pageId: view`. Mirrors companies' edit/new flow.
