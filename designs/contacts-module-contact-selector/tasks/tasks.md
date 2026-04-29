# Implementation Tasks — Contact Selector wiring in the contacts module

## Overview

Seven tasks that implement `designs/contacts-module-contact-selector/design.md`: two standalone API routine patches, block-level additions (`allowVerify` rendering + aggregation-array unwrap), parameterising the existing `get_contact` aggregation with a `request_stages` hook, two new module requests (one layered `$search`+`$match` selector + one aggregation enrichment), one form that reuses the module's existing email validator, the module manifest update, and finally the wrapper component that ties everything together and deletes the old selector. (Task 5 was obsoleted by review-2 — the email validator already exists.)

## Tasks

| #   | File                                 | Summary                                                                                                          | Depends On |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-patch-contacts-apis.md`          | Drop `updated.timestamp` filter in `update-contact`; add `upsertedId` fall-through in `create-contact`           | —          |
| 2   | `02-add-block-allowverify.md`        | Add `allowVerify` prop to `ContactSelector` block + unwrap `getContactRequest.0` in `setEditContact.js`          | —          |
| 3   | `03-unify-get-contact-request.md`    | Parameterise `get_contact.yaml` (`id` + `user_id`), add `request_stages.get_contact` hook; keep aggregation      | —          |
| 4   | `04-add-search-and-data-requests.md` | Add `search_contacts.yaml` (layered `$search`+`$match` + `returnStoredSource`) and `get_contacts_data.yaml`      | —          |
| 5   | `05-add-validate-email-helper.md`    | ~~Add email validator~~ — **obsoleted by review-2**; reuse existing `modules/contacts/validate/email.yaml`       | —          |
| 6   | `06-add-default-contact-form.md`     | Add `modules/contacts/components/form_contact_short.yaml.njk` (5-field modal form)                               | —          |
| 7   | `07-update-module-manifest.md`       | Update `module.lowdefy.yaml` — new vars (`verified`, `all_contacts`, `phone_label`), register new files, exports | 4, 6       |
| 8   | `08-add-contact-selector-wrapper.md` | Add `contact-selector.yaml.njk`; delete old `contact-selector.yaml` and `get_contacts_for_selector.yaml`         | 3, 4, 6, 7 |

## Ordering Rationale

Four chains of work feed into the final wrapper (Task 8):

- **API chain (Task 1)** — standalone. Patches the two routines the wrapper's `onAddContact` / `onEditContact` will call into. Safe to land first; no other task touches these files.
- **Block chain (Task 2)** — standalone. Narrow addition to `ContactSelector` block to support the `verified: trusted` mode. Doesn't block module work; the demo page keeps working.
- **Request chain (Tasks 3, 4)** — standalone. Task 3 parameterises `get_contact` (no consumer churn; the aggregation and `.0` reads stay). Task 4 adds two new requests with a layered pipeline that keeps the consumer `filter` var in standard Mongo syntax. Neither depends on the other.
- **Form chain (Task 6)** — standalone. The email validator already exists in the contacts module; the form `_ref`s it directly. (Task 5 was originally this chain's first link but was obsoleted by review-2 once the existing validator was spotted.)

Task 7 (module manifest) pulls in Tasks 4, 6 because the manifest registers the new requests/component and declares the new `request_stages.get_contact` hook used by Task 3. Task 8 is the final integration — it can only be written after `get_contact` is parameterised (Task 3), the search/data requests exist (Task 4), the default form exists (Task 6), and the manifest registers everything (Task 7). Task 8 also performs the two deletions (old `contact-selector.yaml`, `get_contacts_for_selector.yaml`), which is the only point where the module's public `contact-selector` export swaps over.

**Parallelism:** Tasks 1, 2, 3, 4, 6 can all run in parallel. Task 7 waits on 4+6. Task 8 is the tail of the graph.

## Scope

**Source:** `designs/contacts-module-contact-selector/design.md`
**Context files considered:** none beyond design.md (no supporting deep-dives or research files)
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (already reflected in design.md)
**Review files applied after task-generation:** `review/review-2.md` — obsoleted Task 5 and pruned Task 6 / 7 references to the now-unneeded `validate_email.yaml`.
