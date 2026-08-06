# Deleted-contact view — open a soft-deleted contact with a "deleted" badge

**Status: stub.** Captures a single requirement surfaced while resolving the
[contact-model](../users/contact-model/design.md) review; not yet worked into a full design.

## Requirement

The contact **view page** (`modules/contacts/pages/view.yaml`, backed by
`modules/contacts/requests/get_contact.yaml`) must be able to open a **soft-deleted** contact and
render it, marked with a clear "deleted" badge — rather than 404 / show nothing.

The soft-delete convention is the `deleted` change stamp
([soft-delete-convention](../_completed/soft-delete-convention/design.md)): a live contact has
`deleted` null/absent; a deleted one carries `{ timestamp, user: { name, id } }`.

## Why this is its own design

Contact-model fixes the **list** leak — `get_all_contacts`, `search_contacts` and the selector/export
reads gain `deleted.timestamp: { $exists: false }` so deleted contacts stop surfacing in lists. That
decision deliberately **excludes `get_contact`** (the by-id view fetch), precisely so this view-page
behaviour stays possible: a by-id lookup is not a leak (the caller already has the id), and keeping it
open is the foundation this feature builds on. So the two designs have opposite goals for the same
`deleted` field — hide-from-lists vs. show-on-detail — and separating them keeps each honest. This is
also a contacts-module UI feature, not part of the users person-model cleanup, so it lives outside
`designs/users/`.

## What this depends on

- **`get_contact` reaching soft-deleted contacts** — delivered by contact-model Decision 2 (drops
  `get_contact`'s `hidden` guard, adds **no** `deleted` guard).
- **Something actually soft-deleting a contact.** Contacts has no in-module delete endpoint today;
  the convention expects a host app to write the `deleted` stamp. Until one does, this feature has
  nothing to render — the requirement is real (absence of a caller is not absence of need) but the
  end-to-end demo needs a delete path to exist first.

## Open questions (to resolve when this is picked up)

- **Badge treatment.** What block and copy — a Tag/Alert near the header? Does it surface _when_ and
  _who_ from the `deleted` stamp, or just the fact?
- **Read-only vs. editable.** Should opening a deleted contact force read-only (block the `edit` page,
  which also reads `get_contact`), or stay editable?
- **Restore.** Is there a restore action here (unset `deleted`), or is that out of scope and owned by
  whatever host flow does the deleting? A restore write is a data mutation and would need its own
  reviewed endpoint.
- **Reach.** Is the same badge wanted anywhere else a single contact renders by id (e.g. a deal's
  linked-contact panel), or is the view page the whole scope?

## Non-goals

- The contacts **list/selector** behaviour — owned by contact-model; deleted contacts stay hidden
  there.
- Writing the soft-delete (a host-app / migration concern, not this view).
