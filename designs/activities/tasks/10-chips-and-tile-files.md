# Task 10: Contact/Company Chips + tile_files Wrapper

## Context

After Task 1, the module skeleton exists. This task builds three small internal components:

- `contact_list_items` — chip-style block rendering linked-contact cards. Used inside `view_activity` (sidebar/main column) and the activities-timeline list (Task 11).
- `company_list_items` — same shape, for linked companies.
- `tile_files` — local wrapper around `files.file-card`, mirroring how every entity module wraps the files cross-module export.

References:
- `modules/companies/components/contact_list_items.yaml` — template for `contact_list_items.yaml`.
- `modules/contacts/components/company_list_items.yaml` — template for `company_list_items.yaml` (note the entity reversal — contacts module renders companies, companies module renders contacts).
- `modules/companies/components/tile_files.yaml` — template for `tile_files.yaml`.

## Task

### `modules/activities/components/contact_list_items.yaml`

Renders a list of contacts as chips/cards. Each chip shows the contact's name (and email, optionally), navigates to the contact's detail page on click.

Mirror `companies/components/contact_list_items.yaml` directly. Likely shape:

```yaml
- id: contact_chips
  type: Box
  blocks:
    _build.array.map:
      on:
        _state: contacts   # or _request — depends on how the parent passes the contact list
      callback:
        ...

# Or, more idiomatically, a List/repeat block whose item template is a Card or Link
```

Read the actual companies file and copy its shape — don't invent a different one.

### `modules/activities/components/company_list_items.yaml`

Same as above but for companies. Mirror `contacts/components/company_list_items.yaml`.

### `modules/activities/components/tile_files.yaml`

Single-purpose wrapper around `files.file-card`. Mirror `companies/components/tile_files.yaml` exactly — only the `entity_type` differs:

```yaml
_ref:
  module: files
  component: file-card
  vars:
    entity_type: activity
    entity_id:
      _url_query: _id
```

That's the entire file. Three lines of wrapping; everything else lives in the `files` module.

The activity detail page (Task 14) embeds this in its sidebar to show files attached to the current activity.

## Acceptance Criteria

- `contact_list_items.yaml` renders a row of chips/cards for each linked contact, navigates to the contact detail page on click. Empty state when there are no linked contacts.
- `company_list_items.yaml` renders the same way for companies.
- `tile_files.yaml` resolves at build time and renders an attachment manager scoped to the current activity's `_id` when embedded on a page with `?_id=<uuid>` in the URL.
- Build is clean.

## Files

- `modules/activities/components/contact_list_items.yaml` — create — contact chips, mirror companies'.
- `modules/activities/components/company_list_items.yaml` — create — company chips, mirror contacts'.
- `modules/activities/components/tile_files.yaml` — create — local wrapper around `files.file-card`.

## Notes

- **The chip sources are different from companies'.** In companies, `contact_list_items` reads from `_request: get_company_contacts`. In activities, the contacts and companies are looked up by the request stages (`stages/lookup_contacts.yaml` + `stages/lookup_companies.yaml`) and arrive as `state.<doc>.contacts` / `state.<doc>.companies`. Adjust the chip block's data binding accordingly — read from state, not from a separate request.
- **`tile_files` is a 3-var wrapper.** Don't add logic, vars, or formatting here. The `files.file-card` cross-module export does all the work — uploads, signed URLs, deletion, listing. The wrapper just pins `entity_type: activity` and resolves `entity_id` from the URL.
- **Files data isn't on the activity doc.** Files live in the files module's collection, keyed by `(entity_type: activity, entity_id: <uuid>)` — see `decisions.md` §4. The activity's `create-activity` and `update-activity` payloads do NOT include files.
- The "Future cleanup — `tile_files` consolidation" note in `design.md` is intentionally out of scope. The activities module follows the existing convention of shipping a local `tile_files.yaml` wrapper. Don't try to consolidate during this task.
