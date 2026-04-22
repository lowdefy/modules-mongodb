# Implementation Tasks — Contact Selector wiring in the contacts module

## Overview

Eight tasks that implement `designs/contacts-module-contact-selector/design.md`: two standalone API routine patches, a narrow block-level addition, a request unification that touches 4 consumer files, three new module files (two requests + one validator + one form), the module manifest update, and finally the wrapper component that ties everything together and deletes the old selector.

## Tasks

| #   | File                                 | Summary                                                                                                          | Depends On |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-patch-contacts-apis.md`          | Drop `updated.timestamp` filter in `update-contact`; add `upsertedId` fall-through in `create-contact`           | —          |
| 2   | `02-add-block-allowverify.md`        | Add `allowVerify` prop to `ContactSelector` block — Verify (danger) button for unverified rows                   | —          |
| 3   | `03-unify-get-contact-request.md`    | Rewrite `get_contact.yaml` as parameterised `MongoDBFindOne`; drop `.0` from 18 consumer sites                   | —          |
| 4   | `04-add-search-and-data-requests.md` | Add `search_contacts.yaml` (Atlas `$search`) and `get_contacts_data.yaml` (aggregation) to the contacts module   | —          |
| 5   | `05-add-validate-email-helper.md`    | Add `modules/contacts/validate/validate_email.yaml` used by the default form                                     | —          |
| 6   | `06-add-default-contact-form.md`     | Add `modules/contacts/components/form_contact_short.yaml.njk` (5-field modal form)                               | 5          |
| 7   | `07-update-module-manifest.md`       | Update `module.lowdefy.yaml` — new vars (`verified`, `all_contacts`, `phone_label`), register new files, exports | 4, 5, 6    |
| 8   | `08-add-contact-selector-wrapper.md` | Add `contact-selector.yaml.njk`; delete old `contact-selector.yaml` and `get_contacts_for_selector.yaml`         | 3, 4, 6, 7 |

## Ordering Rationale

Four chains of work feed into the final wrapper (Task 8):

- **API chain (Task 1)** — standalone. Patches the two routines the wrapper's `onAddContact` / `onEditContact` will call into. Safe to land first; no other task touches these files.
- **Block chain (Task 2)** — standalone. Narrow addition to `ContactSelector` block to support the `verified: trusted` mode. Doesn't block module work; the demo page keeps working.
- **Request chain (Tasks 3, 4)** — standalone. Task 3 is mechanical (`.0` drops across 4 files). Task 4 adds two new requests. Neither depends on the other.
- **Form chain (Tasks 5, 6)** — linear. Task 5 ships the email validator; Task 6 uses it in the default form.

Task 7 (module manifest) pulls in Tasks 4, 5, 6 because the manifest registers the new requests/validator/component. Task 8 is the final integration — it can only be written after `get_contact` is a `FindOne` (Task 3), the search/data requests exist (Task 4), the default form exists (Task 6), and the manifest registers everything (Task 7). Task 8 also performs the two deletions (old `contact-selector.yaml`, `get_contacts_for_selector.yaml`), which is the only point where the module's public `contact-selector` export swaps over.

**Parallelism:** Tasks 1, 2, 3, 4, 5 can all run in parallel. Task 6 serialises after 5. Task 7 waits on 4+5+6. Task 8 is the tail of the graph.

## Scope

**Source:** `designs/contacts-module-contact-selector/design.md`
**Context files considered:** none beyond design.md (no supporting deep-dives or research files)
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (already reflected in design.md)
