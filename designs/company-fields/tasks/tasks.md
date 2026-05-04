# Implementation Tasks — Company Fields

## Overview

Implementation plan for `designs/company-fields/design.md`: extends the `module-field-pattern` to the companies module's standard sections, removes region-specific defaults (`trading_name`, `registered_name`, `registration_number`, `vat_number`), and ships opt-in field presets so non-SA consumers don't have to fork the module.

## Tasks

| #   | File                              | Summary                                                                                                                                                                                                   | Depends On |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-field-presets.md`             | Create the four `field-presets/*.yaml` files (new content; no deletions yet).                                                                                                                             | —          |
| 2   | `02-module-manifest.md`           | Add `fields.contact`/`address`/`registration` slots to the module manifest; flip `name_field` default from `trading_name` to `name`.                                                                      | —          |
| 3   | `03-form-and-view-restructure.md` | Rename `trading_name` block, rewrite `form_company.yaml` with conditional sections, rewrite `view_company.yaml` per-section, delete the old `fields/contact.yaml` / `address.yaml` / `registration.yaml`. | 2          |
| 4   | `04-api-and-pages-payload.md`     | Atomic payload-shape change: rewrite `create-company.yaml`, `update-company.yaml`, `pages/edit.yaml`, `pages/new.yaml`, `pages/view.yaml`.                                                                | 2, 3       |
| 5   | `05-excel-download.md`            | Strip section-specific fixed columns from `excel_download.yaml` (universal-core only).                                                                                                                    | 4          |
| 6   | `06-demo-wiring-and-seed.md`      | Wire the SA presets in `apps/demo/modules/companies/vars.yaml`, delete the stale `apps/demo/modules/companies/index.yaml`, drop and reseed the demo `companies` collection.                               | 1, 4       |
| 7   | `07-readme.md`                    | Rewrite the README's fields/sections content; update the broken `apps/demo/modules/companies/index.yaml` pointer.                                                                                         | 6          |

## Ordering Rationale

**Task 1 first because it's pure addition.** New preset files don't conflict with anything that exists. They can be reviewed and merged before the rest of the schema flip lands.

**Task 2 second.** The new `fields.X` slots in `module.lowdefy.yaml` default to `[]` so adding them is a no-op for current callers; flipping `name_field` to `name` does change `$getField` resolution in `get_all_companies` and `get_company` (rows show `null` for the display-name column on docs that still have `trading_name`), but the demo gets reseeded in task 6 and there are no other consumers, so the temporary visible drift is acceptable.

**Task 3 depends on task 2** because `form_company.yaml` switches from `_ref components/fields/{contact,address,registration}.yaml` to `_module.var: fields.X` — those vars must exist in the manifest. The deletion of the old `fields/*.yaml` files is bundled into task 3 because once `form_company.yaml` and `view_company.yaml` stop `_ref`'ing them, they're orphaned; deleting them in the same task avoids a window where the build still succeeds but stale files sit around.

**Task 4 must land together.** The API change (sections as sub-objects + `name`) and the page change (matching payload shape and `set_state`/`onInit`) are mutually dependent — splitting them creates a state where forms either send keys the API ignores or omit keys the API expects. Combining them is the smallest coherent unit that keeps the demo functional end-to-end.

**Task 5** is independent but cleanest after task 4 because the document shape is finalised by then; reading `lowercase_email` etc. from a half-migrated doc would be misleading.

**Task 6** depends on task 1 (presets must exist for the demo to `_ref` them) and task 4 (the runtime path works). The reseed lives here because the demo's `companies` collection holds the only data this design touches; in-place migration via `update-company` would leave `address.registered.*` legacy keys behind under `$mergeObjects` shallow-merge (see review-1 finding #6), so a fresh seed is the simplest path.

**Task 7** is documentation-only and lands last, after all referenced files exist in their final form (so the rewritten "Vars / Slots / Fields" section can reference real preset paths and the demo wiring example points at `vars.yaml`).

**Out of scope (parallel track):** A canonical `PlacesAutocomplete` block plugin needs to exist before `field-presets/address-places.yaml` is functional. The preset YAML ships in task 1 as a placeholder; runtime is blocked on the plugin landing in `plugins/modules-mongodb-plugins/` (or as a separate package). Apps that want autocomplete today supply their own implementation in the `fields.address` slot.

## Scope

**Source:** `designs/company-fields/design.md`
**Context files considered:** none beyond design.md (no supporting files exist for this design).
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (per skill convention — design.md already incorporates resolved review feedback).
