# Task 1: Patch `update-contact` and `create-contact` API routines

## Context

The contacts module's two write APIs exist at:

- `modules/contacts/api/update-contact.yaml`
- `modules/contacts/api/create-contact.yaml`

Both ship today as-is on the branch and are called from the contacts module's own `contact-edit` and `contact-new` pages. Once the `ContactSelector` block's wrapper lands (Task 8), the picker's `onAddContact` / `onEditContact` will call them too — and that exposes two existing bugs:

1. **`update-contact` has an unconditional `updated.timestamp` filter clause.** The picker can't reliably supply a `updated.timestamp` (the block loads contact data via `get_contact` only on edit click; by save time the timestamp may be stale, and there's also an ISO-string vs BSON-Date mismatch risk). The filter then matches nothing and the edit silently fails.
2. **`create-contact` `:return: contactId` only reads `insert.upsertedId`.** `modules/contacts/connections/contacts-collection.yaml` enables `changeLog`, which makes the community-plugin-mongodb use `findOneAndUpdate` internally. The upsertedId then lives at `lastErrorObject.upserted`, not `upsertedId`. The API returns `contactId: null`, the picker's `CallMethod appendContact` gets a null id, and clicking Edit on the newly-added stub opens an empty modal.

These are load-bearing fixes for the picker — see `design.md` decisions #9 and #10.

## Task

**In `modules/contacts/api/update-contact.yaml`** — remove the `updated.timestamp` filter clause entirely. The filter reduces to the `_id` + the `apps.{app_name}.is_user: { $ne: true }` guard. The `_object.assign` that currently builds the filter should be simplified; if it becomes trivial after the removal, inline it.

Before (lines 10-25, shape only):

```yaml
filter:
  _object.assign:
    - _id:
        _payload: _id
      updated.timestamp: # ← drop this clause
        _payload: updated.timestamp
    - _object.defineProperty:
        on: {}
        key:
          _string.concat:
            - "apps."
            - _module.var: app_name
            - ".is_user"
        descriptor:
          value:
            $ne: true
```

After:

```yaml
filter:
  _object.assign:
    - _id:
        _payload: _id
    - _object.defineProperty:
        on: {}
        key:
          _string.concat:
            - "apps."
            - _module.var: app_name
            - ".is_user"
        descriptor:
          value:
            $ne: true
```

**In `modules/contacts/api/create-contact.yaml`** — replace `:return:` (currently at the tail of the routine, approximately lines 147-161) so that `contactId` falls through both shapes of the `insert` step's result:

```yaml
- :return:
    contactId:
      _if_none:
        - _if:
            test:
              _ne:
                - _step: check-existing
                - null
            then:
              _step: check-existing._id
            else:
              _step: insert.upsertedId
        - _step: insert.lastErrorObject.upserted
    existing:
      _ne:
        - _step: check-existing
        - null
```

The `_if_none` preserves the `check-existing._id` path when a duplicate is detected, tries `insert.upsertedId` for connections without `changeLog`, and falls through to `insert.lastErrorObject.upserted` when `changeLog` is enabled (as in this module).

## Acceptance Criteria

- `pnpm ldf:b:i` in `apps/demo` builds successfully (verifies YAML validity + \_module.var resolution).
- `contact-edit.yaml` page still saves edits (behavior unchanged for the detail/edit page since it still sends `updated.timestamp` but the filter no longer requires it).
- Creating a new contact via the contact-new page returns a `contactId` that is a valid ObjectId (not null). Manual smoke test: load `/contacts/contact-new`, submit form, inspect response.
- No other callers of these APIs break — `contacts/create-contact` is only referenced from `contact-new.yaml`, and `contacts/update-contact` is only referenced from `contact-edit.yaml`.

## Files

- `modules/contacts/api/update-contact.yaml` — modify — drop the `updated.timestamp` filter clause
- `modules/contacts/api/create-contact.yaml` — modify — rewrite `:return: contactId` with `_if_none` fall-through

## Notes

- The prior branch (`93a5294`) conditionally included the `updated.timestamp` filter via `_build.if`. This design deliberately removes the check entirely instead — concurrent-edit race accepted. Don't reintroduce the conditional.
- The `is_user` guard in the filter stays — it blocks updates against user-backed contact records.
- Both routines' log-event stages (`new-event` step) are untouched.
