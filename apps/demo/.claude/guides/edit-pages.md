# Edit/Create Pages

How to build form pages for editing existing records and creating new records.

## Pattern

Edit and create pages share the same layout structure: a centered Card containing a `_ref`'d form component, with a `floating-actions` bar pinned to the bottom for Cancel and Save buttons. The key difference is that edit pages fetch and populate state on mount, while create pages start with empty state.

**Page wrapper** uses the layout page component with `hide_title: true` — the card provides its own title. The card uses `width: 700` for centered forms.

**Edit page onMount sequence** (order matters):

1. `Request` — fetch the record using `_url_query: _id`
2. `Link` with `skip` — redirect if not found: `skip: _ne: [_request: get_{entity}.0, null]`
3. `SetState` — copy the record into state for form binding

Some edit pages add a pre-check before the fetch: redirect back if the URL has no `_id` param at all. Complex edit pages may add additional guards (e.g., redirect if the record is a user managed elsewhere).

**Create pages** skip the entire onMount fetch/redirect sequence. If the form needs selector data (e.g., company dropdown), load it in `onMountAsync` to avoid blocking the initial render. Some create pages use `onInit` to seed state from `_user` (e.g., the user-account `new` page populates name/email from the logged-in user).

**Form component** is always a separate `_ref`'d file (`components/form_{entity}.yaml`). The same form component is shared between edit and create pages. Differences between modes are handled via `_var` (e.g., `email_disabled: true` on edit, `enable_email: true` on create). For module-provided pages, the module owns the form layout directly (no wholesale `form_fields` override var); consumers extend via `_module.var: fields.*` field-array slots (e.g. `fields.profile`, `fields.attributes`).

**Save flow** is always: `Validate` -> `CallAPI` (or `Request`) -> `Reset` -> `Link`.

- **Validate** scopes to the entity's fields with `params: regex: ^entity\.` — this prevents validating unrelated state (selectors, UI flags).
- **CallAPI** (module pages) sends state via `payload` to a server-side API routine. The endpoint is referenced via `_module.endpointId`.
- **Request** (app-specific pages) calls a direct MongoDB request defined on the page. The request receives state via `payload`.
- **Success message** on the save action confirms the operation.
- **Reset** clears form state.
- **Link** navigates away — edit pages go `back: true`, create pages go to the newly created record's detail page (using the response ID) or back to the list.

**Card metadata**: edit pages pass `doc: _request: get_{entity}.0` to the card component, which renders "Last modified by X on DATE" above the form. Create pages omit this since there's no existing record.

## Data Flow

```
Edit:
  URL contains ?_id=xxx
  → onMount: Request fetches record → Link redirects if null → SetState populates form
  → User edits fields (state updates under entity.* namespace)
  → Save button: Validate (regex: ^entity\.) → CallAPI with payload: { entity: _state: entity }
  → API routine: updates DB, logs event, returns response
  → Reset clears state → Link navigates back

Create:
  → onMountAsync: Request loads selector options (if needed)
  → User fills fields (state updates under entity.* namespace)
  → Save button: Validate (regex: ^entity\.) → CallAPI with payload: { entity: _state: entity }
  → API routine: inserts to DB, logs event, returns { entityId: insertedId }
  → Reset clears state → Link to detail page with _id from response
```

## Variations

**Simple edit page** — the canonical pattern. Fetch, populate, card with form, floating-actions:

```yaml
# Card with doc metadata and form
- _ref:
    module: layout
    component: card
    vars:
      title: "Edit {Label}: ..."
      doc:
        _request: get_{entity}.0
      width: 700
      blocks:
        - _module.var: components.form_fields
# Floating actions with Cancel + Save
- _ref:
    module: layout
    component: floating-actions
    vars:
      width: 700
      actions:
        - id: cancel_button
          ...
        - id: save_button
          ...
```

**Edit page with multiple sections** — dividers separate sections, multiple form components. Used when an entity has distinct sections (profile, access, attributes):

```yaml
blocks:
  - id: card
    type: Card
    layout:
      gap: 16
    blocks:
      - _ref: components/form_profile.yaml
      - id: divider
        type: Divider
        properties:
          title: Access
      - _module.var: components.form_global_attributes
      - _module.var: components.form_app_attributes
      - _ref: components/form_access_edit.yaml
```

**Edit page with extra action buttons** — floating-actions can include additional buttons alongside Save/Cancel. Use `visible` for conditional display:

```yaml
actions:
  - id: resend_invite_button
    type: Button
    visible:
      _ne:
        - _state: user.is_user
        - true
    properties:
      disabled:
        _ne:
          - _state: user.invite.open
          - true
      title: Resend Invite
    events:
      onClick:
        - id: resend
          type: CallAPI
          ...
  - id: save_button
    ...
  - id: cancel_button
    ...
```

**Create page with redirect to new record** — after saving, navigate to the detail page using the response ID:

```yaml
- id: go_detail
  type: Link
  params:
    pageId:
      _module.pageId: view
    urlQuery:
      _id:
        _actions: create_{entity}.response.response.{idField}
```

> CallAPI double-wraps the API's return value: `_actions: <id>.response.response.<field>`. Plain `Request` actions use a single `_actions: <id>.response.<field>` (or `.response.0.<field>` for find arrays).

**content_width instead of card width** — when the page layout should constrain width (not just the card), pass `content_width` to the page component. This affects the entire page content area:

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: edit
    content_width: 600
```

## Anti-patterns

- **Don't skip Validate before CallAPI** — always validate first. Without `params: regex: ^entity\.`, validation may catch unrelated state.
- **Don't use `onInit` for fetch** — `onInit` fires before the page has URL query params. Use `onMount` for fetching records by `_url_query: _id`. Only use `onInit` for seeding state from `_user` or constants.
- **Don't inline form fields in the page** — extract to `components/form_{entity}.yaml` so the same form is shared between edit and create pages.
- **Don't omit the redirect guard on edit pages** — without the "redirect if not found" step, users see a blank form when navigating to a deleted or non-existent record.
- **Don't use `_state` inline in request properties** — pass state via `payload` mapping on the `CallAPI` action. The API routine reads from `_payload`.
- **Don't load selectors on `onMount`** — use `onMountAsync` for selector data so the page renders immediately while selectors load in the background.

## Reference Files

- `modules/contacts/pages/edit.yaml` — canonical edit page: fetch → redirect → card + floating-actions with CallAPI
- `modules/contacts/pages/new.yaml` — canonical create page: card + floating-actions, redirect to detail on success
- `modules/contacts/components/form_contact.yaml` — shared form with `_build.if` for edit/create differences and `_module.var` injection points
- `modules/contacts/api/update-contact.yaml` — API routine with optimistic concurrency (`updated.timestamp` filter), event logging, `_module.var` extension stages
- `modules/contacts/api/create-contact.yaml` — API routine with duplicate check, upsert, `$ifNull` for insert-only fields
- `modules/user-admin/pages/edit.yaml` — multi-section edit: dividers, extra floating-action buttons (resend invite), `content_width`
- `modules/user-admin/pages/new.yaml` — create variant with pre-check (`_input: email`)
- `modules/user-account/pages/edit.yaml` — simple edit using `onInit` for `_user` state
- `modules/user-account/pages/new.yaml` — create with `onInit` seeding from `_user`, hidden menu/profile
- `modules/shared/layout/floating-actions.yaml` — sticky Affix + Card, blocks injected via `_var: actions`
- `modules/shared/layout/card.yaml` — card with loading skeleton, doc metadata, header buttons, footer buttons

## Template

### Edit Page

```yaml
# pages/edit.yaml
_ref:
  module: layout
  component: page
  vars:
    id: edit
    title:
      _string.concat:
        - "Edit "
        - _module.var: label
        - ": "
        - _if_none:
            - _request: get_{entity}.0.{name_field}
            - ""
    hide_title: true
    events:
      onMount:
        - id: fetch
          type: Request
          params:
            - get_{entity}
        - id: redirect_if_not_found
          type: Link
          skip:
            _ne:
              - _request: get_{entity}.0
              - null
          params:
            pageId:
              _module.pageId: all
        - id: set_state
          type: SetState
          params:
            {entity}:
              _request: get_{entity}.0
    requests:
      - _ref: requests/get_{entity}.yaml
    blocks:
      - _ref:
          module: layout
          component: card
          vars:
            title:
              _string.concat:
                - "Edit "
                - _module.var: label
                - ": "
                - _if_none:
                    - _request: get_{entity}.0.{name_field}
                    - ""
            doc:
              _request: get_{entity}.0
            width: 700
            blocks:
              - _module.var:
                  key: components.form_fields
                  default:
                    _ref: components/form_{entity}.yaml
      - _ref:
          module: layout
          component: floating-actions
          vars:
            width: 700
            actions:
              - id: spacer
                type: Box
                layout:
                  flex: 1 0 auto
              - id: cancel_button
                type: Button
                layout:
                  flex: 0 1 auto
                properties:
                  title: Cancel
                  icon: AiOutlineCloseCircle
                  type: default
                events:
                  onClick:
                    - id: back
                      type: Link
                      params:
                        back: true
              - id: save_button
                type: Button
                layout:
                  flex: 0 1 auto
                properties:
                  title: Save
                  icon: AiOutlineSave
                events:
                  onClick:
                    - id: validate
                      type: Validate
                    - id: update_{entity}
                      type: CallAPI
                      params:
                        endpointId:
                          _module.endpointId: update-{entity}
                        payload:
                          {entity}:
                            _state: {entity}
                      messages:
                        success:
                          _string.concat:
                            - _module.var: label
                            - " updated."
                    - id: reset
                      type: Reset
                    - id: back
                      type: Link
                      params:
                        back: true
```

### Create Page

```yaml
# pages/new.yaml
_ref:
  module: layout
  component: page
  vars:
    id: new
    title:
      _string.concat:
        - "New "
        - _module.var: label
    hide_title: true
    blocks:
      - _ref:
          module: layout
          component: card
          vars:
            title:
              _string.concat:
                - "New "
                - _module.var: label
            width: 700
            blocks:
              - _module.var:
                  key: components.form_fields
                  default:
                    _ref: components/form_{entity}.yaml
      - _ref:
          module: layout
          component: floating-actions
          vars:
            width: 700
            actions:
              - id: spacer
                type: Box
                layout:
                  flex: 1 0 auto
              - id: cancel_button
                type: Button
                layout:
                  flex: 0 1 auto
                properties:
                  title: Cancel
                  icon: AiOutlineCloseCircle
                  type: default
                events:
                  onClick:
                    - id: back
                      type: Link
                      params:
                        pageId:
                          _module.pageId: all
              - id: save_button
                type: Button
                layout:
                  flex: 0 1 auto
                properties:
                  title:
                    _string.concat:
                      - "Create "
                      - _module.var: label
                  icon: AiOutlineSave
                  type: primary
                events:
                  onClick:
                    - id: validate
                      type: Validate
                    - id: create_{entity}
                      type: CallAPI
                      params:
                        endpointId:
                          _module.endpointId: create-{entity}
                        payload:
                          {entity}:
                            _state: {entity}
                      messages:
                        success:
                          _string.concat:
                            - _module.var: label
                            - " created."
                    - id: reset
                      type: Reset
                    - id: go_detail
                      type: Link
                      params:
                        pageId:
                          _module.pageId: view
                        urlQuery:
                          _id:
                            _actions: create_{entity}.response.response.{idField}
```

## Checklist

- [ ] `hide_title: true` on page — card provides the title
- [ ] Edit: `onMount` sequence is fetch -> redirect if not found -> SetState (in that order)
- [ ] Create: no `onMount` fetch; use `onMountAsync` if selectors are needed
- [ ] Card `width: 700` for centered form layout; pass `doc` on edit pages for metadata
- [ ] Form fields in separate `components/form_{entity}.yaml`, injected via `_module.var: components.form_fields`
- [ ] `Validate` before `CallAPI` — use `params: regex: ^entity\.` if other state is on the page
- [ ] Save flow: Validate -> CallAPI -> Reset -> Link (back for edit, detail page for create)
- [ ] Endpoint via `_module.endpointId`, payload wraps `_state: {entity}`
- [ ] Floating-actions: spacer (flex 1 0 auto) + Cancel + Save — buttons use `flex: 0 1 auto`
- [ ] Create page Save button uses `type: primary`; edit page uses default
- [ ] Create page Cancel links to list page (`_module.pageId: all`); edit page uses `back: true`
