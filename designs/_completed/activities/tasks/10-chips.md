# Task 10: Contact / Company Chips

## Context

After Task 1, the module skeleton exists. This task builds two small internal chip components used by `view_activity` (sidebar / main column) and the cross-module `activities-timeline` list (Task 11):

- `contact_list_items` — chip-style block rendering linked-contact cards.
- `company_list_items` — same shape for linked companies.

No `tile_files.yaml` is created here (or anywhere in this module). Per `decisions.md` §4 and Sam's PR-32 review, the activity detail page refs `files.file-card` directly; no local wrapper is needed because `file-card` is already card-styled and takes `entity_type` + `entity_id` as vars. That ref lives in Task 14 (`view.yaml`).

References:
- `modules/companies/components/contact_list_items.yaml` — template.
- `modules/contacts/components/company_list_items.yaml` — template (note the entity reversal — contacts module renders companies, companies module renders contacts).

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

## Acceptance Criteria

- `contact_list_items.yaml` renders a row of chips/cards for each linked contact, navigates to the contact detail page on click. Empty state when there are no linked contacts.
- `company_list_items.yaml` renders the same way for companies.
- Build is clean.

## Files

- `modules/activities/components/contact_list_items.yaml` — create — contact chips, mirror companies'.
- `modules/activities/components/company_list_items.yaml` — create — company chips, mirror contacts'.

## Notes

- **The chip sources are different from companies'.** In companies, `contact_list_items` reads from `_request: get_company_contacts`. In activities, the contacts and companies are looked up by the request stages (`stages/lookup_contacts.yaml` + `stages/lookup_companies.yaml`) and arrive as `state.<doc>.contacts` / `state.<doc>.companies`. Adjust the chip block's data binding accordingly — read from state, not from a separate request.
- **No `tile_files.yaml` to create.** `decisions.md` §4 deletes the local-wrapper convention as part of this PR (Sam flagged it as dead indirection on PR-32; companies and contacts had unused `tile_files.yaml` files removed in the same change). Task 14's view page refs `files.file-card` inline. If a future consumer needs a real wrapper around the file card (header buttons, custom title, additional sidebar blocks), add it then — until there's something to wrap, the inline ref is the right shape.
- **Files data isn't on the activity doc.** Files live in the files module's collection, keyed by `(entity_type: activity, entity_id: <uuid>)` — see `decisions.md` §4. The activity's `create-activity` and `update-activity` payloads do NOT include files.
