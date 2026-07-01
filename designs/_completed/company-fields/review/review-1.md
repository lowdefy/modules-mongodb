# Review 1 — Implementation completeness vs. current code

Cross-checked the design against the live `modules/companies/` source. Findings focus on real omissions and ambiguities that would surface during implementation.

## Critical

### 1. `pages/new.yaml` and `pages/edit.yaml` are missing from "Files changed"

> **Resolved.** Added rows for `pages/edit.yaml`, `pages/new.yaml`, and `pages/view.yaml` to the module Files-changed table, with the specific edits called out (set_state collapse, payload section sub-objects, `registration: {}` in onInit).

Both pages enumerate the very fields this design renames or moves under sections, but the design's "Files changed" table only lists `components/`, `api/`, `requests/get_*.yaml`, and `field-presets/`. The pages have to be rewritten too:

- `pages/edit.yaml:42-76` (`set_state` onMount) — flat `trading_name`, `registered_name`, `registration_number`, `vat_number`, `website` reads from `get_company.0.*`. After the design these all collapse into `name`, plus section sub-objects (`registration: _request: get_company.0.registration`, etc.).
- `pages/edit.yaml:103-139` (CallAPI payload for `update-company`) — same flat field mapping. Needs to become `name: _state: name`, `contact: _state: contact`, `address: _state: address`, `registration: _state: registration`, `attributes: _state: attributes`, plus `_id`, `contacts`, `updated`.
- `pages/new.yaml:64-90` (CallAPI payload for `create-company`) — same flat field mapping. Same collapse.
- `pages/new.yaml:27-29` and `pages/view.yaml:51-54` (`onInit` `SetState`) — currently init `contact: {}`, `address: {}`, `attributes: {}`. After the design `registration: {}` should be added (or the design should justify omitting it for symmetry).

**Fix:** Add `pages/new.yaml`, `pages/edit.yaml`, and `pages/view.yaml` to the Files-changed table with the specific edits above. This is more than an audit — it's a real rewrite that matches the API change.

### 2. "Whole-payload writes" pseudocode collapses create and update; create uses an insert, not a pipeline

> **Resolved.** Replaced the single `$mergeObjects` example with two sub-sections — create (literal `MongoDBInsertConsecutiveId.doc` with `_if_none: [_payload: section, {}]` per section, including the new `registration`) and update (`MongoDBUpdateOne` pipeline with `$mergeObjects` per section, plus the lowercase_email recomputation in stage 2). Also tightened the rationale: `$mergeObjects` preserves additional `contact.*`/`address.*`/`registration.*`/`attributes.*` keys not in the current form; `lowercase_email` lives at the doc root (it's not inside `contact`), survives because the update doesn't touch unlisted root keys, and is recomputed in stage 2 to reflect the post-merge value. Solution-at-a-glance bullet #4 updated to match.

The design's example block (lines 56-79) reads:

```yaml
update:
  $set:
    contact:
      $mergeObjects: [...]
```

…and the prose (line 53) says "`create-company` and `update-company` stop hand-mapping each field." But `api/create-company.yaml:5` uses `MongoDBInsertConsecutiveId` whose `doc:` property takes a literal document — not a pipeline. `$mergeObjects` is an aggregation expression and only works inside aggregation/update pipelines. It cannot be used in `MongoDBInsertConsecutiveId.doc`.

The current code already handles create with `_if_none: [_payload: contact, {}]` per section (`api/create-company.yaml:27-38`), which is the right pattern for inserts (no existing doc to merge with). The design should make this distinction explicit:

- **create** (`MongoDBInsertConsecutiveId.doc`): per-section literals using `_if_none: [_payload: section, {}]`. Add `registration` to the existing `contact` / `address` / `attributes` set.
- **update** (`MongoDBUpdateOne` pipeline): per-section `$mergeObjects` against `$$ROOT.section`. Add `registration` to the existing `contact` / `address` / `attributes` set.

**Fix:** Split the "Whole-payload writes" section into create vs. update sub-sections with the correct syntax for each, and explicitly call out that the registration section join the contact/address/attributes pattern (the other three are already wired this way in `api/update-company.yaml:30-49`).

### 3. Excel download — the design only mentions stripping registration columns, but the keep-list silently drops contact/website too

> **Resolved (option a).** Subsection renamed to "Excel download keeps only universal-core columns" and rewritten to spell out that **all** section-specific fixed columns drop (registration + website + email + phone). Files-changed row updated to enumerate the columns being removed and the columns being kept (`id`, `name` via `display_name` alias, `description`, `updated_at`, `created_at`).

`components/excel_download.yaml:38-61` currently has hardcoded fixed columns for `registered_name`, `registration_number`, `vat_number`, `website`, `email` (`contact.primary_email`), `phone` (`contact.primary_phone`). The design says (line 129):

> Strip the registration columns from the fixed list. Keep `id`, `name`, `description`, timestamps.

The keep-list implies website/email/phone also drop, but this isn't stated. Either:

(a) The intent is to drop all section-specific fixed columns (consistent with `fields.*` being opt-in) — say so explicitly so the `website`/`email`/`phone` removal isn't accidentally missed.
(b) Or contact columns stay because they're "always-on" — but that contradicts the universal-core-only stance in the rest of the design.

**Fix:** State the intent explicitly. Option (a) is consistent with the rest of the design; preferred.

## Significant

### 4. `view_company.yaml` structure post-design is ambiguous

> **Resolved (option a).** New "Section structure (form and view)" subsection in design.md spells out one SmartDescriptions per section (`view_core`, `view_registration`, `view_contact`, `view_address`, `view_attributes`), each with `title`, `visible:` gate on `_build.array.length(fields.X) > 0`, and full-doc `data`. Files-changed row updated to match.

Today (`components/view_company.yaml`) renders one `SmartDescriptions` for the main fields (data: full doc, fields: core + registration + contact + address) and a second for `attributes` (conditional, with title "Additional Details").

The design says (Files-changed row for `view_company.yaml`):

> SmartDescriptions reads `fields.*` directly (already does this for `attributes`). Pass each section's data as a sub-object.

This is ambiguous. Options:

(a) **One SmartDescriptions per section**, each with its own `title:` ("Registration", "Contact Details", "Address", "Additional Details") and a `visible:` gate on `_build.array.length(_module.var: fields.X) > 0`. This matches the form's per-section divider pattern (form_company.yaml:8-39 post-design) and gives consistent show/hide behavior between form and view.

(b) **One SmartDescriptions, fields concatenated** like today, no per-section visibility. Simpler but loses section titles in the view.

**Fix:** Pick one and write it down. (a) is the natural extension of the form's conditional dividers.

### 5. "Pass each section's data as a sub-object" is unnecessary — full-doc data already works

> **Resolved.** The "pass each section's data as a sub-object" line is gone. The new "Section structure (form and view)" subsection explicitly says each per-section SmartDescriptions passes the full `_request: get_company.0` as `data`, and dot-notation field IDs resolve into it directly.

The design implies that view_company needs to wrap state per section (e.g. `data: { contact: _state: contact, address: _state: address, ... }`). But because the section field IDs use dot-notation (`contact.primary_email`, `address.formatted_address`, …) and SmartDescriptions resolves them as paths into `data`, passing the whole document continues to work:

```yaml
data:
  _request: get_company.0
fields:
  _build.array.concat:
    - _ref: components/fields/core.yaml
    - _module.var: fields.contact
    - _module.var: fields.address
    - _module.var: fields.registration
```

Today's code already does this (`view_company.yaml:10-11`). Module-field-pattern wraps because user state is flat (`state.profile.*` is a top-level subtree); companies' state already mirrors the doc, so no wrapping is needed. (If finding 4 lands on option (a), each per-section SmartDescriptions can pass its own `data: { _request: get_company.0.section }` — but that's a layout choice, not a requirement.)

**Fix:** Drop or rephrase the "pass each section's data as a sub-object" line so implementers don't add unnecessary wrapping.

### 6. `address.registered.*` legacy key persists under `$mergeObjects`

> **Resolved (option a).** Demo Files-changed row reworded: drop and reseed the demo `companies` collection rather than migrate in place. Reseeding sidesteps the shallow-merge issue without adding a one-shot script. Consistent with the "no real consumers, no migration scripts" non-goal.

After the design, `address` becomes `{ formatted_address, extra }` and `update-company` does `address: $mergeObjects [$ifNull: $$ROOT.address, _payload: address]`. Existing documents (the demo's seed data, any local dev DB) have `address: { registered: { formatted_address, extra } }`. Because `$mergeObjects` is a shallow merge, the legacy `address.registered` sub-object will **persist** alongside the new `address.formatted_address` after an update — both shapes coexist on the same doc.

The design's Non-goals say "No real consumers, no migration scripts." Fair, but the demo seed data exists and the plan says to "Migrate sample docs to new shape." Implementer needs to know that `$unset: { "address.registered": "" }` (or a one-shot script wiping the seed collection) is required, not just a `$set`.

**Fix:** Either add a one-line note to the demo's "Migrate sample docs" row explaining `$unset` is needed for `address.registered`, or accept that the demo collection gets dropped/reseeded as part of the change.

## Minor

### 7. Demo wiring example targets the wrong file

> **Resolved.** Updated example header from `apps/demo/lowdefy.yaml` to `apps/demo/modules.yaml` (the actual entry file the demo uses). The `index.yaml` vs `vars.yaml` question is tracked under finding #11.

The design's example (lines 175-194) shows wiring under `apps/demo/lowdefy.yaml`. The actual demo entry lives at `apps/demo/modules.yaml` (which `_ref`s `modules/companies/vars.yaml`). The path in the example doesn't match the repo layout, and the demo has two parallel files — `apps/demo/modules/companies/vars.yaml` (active) and `apps/demo/modules/companies/index.yaml` (looks legacy/unused).

**Fix:** Update the example path to `apps/demo/modules.yaml` + `apps/demo/modules/companies/vars.yaml`, or pick whichever is canonical and standardize.

### 8. `core.yaml` change is a rename, not a replace

> **Resolved.** Reworded the Files-changed row to "Rename `trading_name` block to `name` (label `"{label} Name"` stays). `description` block unchanged." Also folded in the answer to #10 (core.yaml is the only remaining file under `components/fields/`).

The design's Files-changed entry says:

> Replace with `name`, `description` only. Field id is `name`, label is `"{label} Name"`.

`components/fields/core.yaml` already contains exactly two blocks: `trading_name` (label: `"{label} Name"`) and `description`. The change is a one-line `id: trading_name` → `id: name` rename. "Replace" overstates it.

**Fix:** Reword to "Rename `trading_name` block to `name`. `description` block is unchanged."

### 9. `requests/get_*.yaml` audit row is a no-op

> **Resolved.** Reworded the row to "No direct change. Search paths, sort, and the `display_name` projection all read `_module.var: name_field`, so the `name_field` default flip carries through automatically."

The design says:

> requests/get\_\*.yaml — Audit projections — switch any `trading_name` references to `name`.

`grep -rn -E "trading|registered|vat|website" modules/companies/requests/` returns nothing — every request that needs the display name uses `_module.var: name_field` (`get_all_companies.yaml:37,47`, `get_companies_for_selector.yaml:14-15`, `get_company.yaml:18-19`, `get_company_excel_data.yaml:39,49,65`) and depends only on the `name_field` default flip. The audit will turn up zero hits.

**Fix:** Remove the row, or reword to "No changes; `name_field` default flip carries through automatically." (Same shape as the table_companies/filter_companies rows.)

### 10. `components/fields/core.yaml` will still be `_ref`'d from form_company and view_company

> **Resolved.** Folded into the core.yaml Files-changed row: "Only file remaining under `components/fields/` after this design." Inlining it into `form_company.yaml` is left for a future cleanup if it proves useful — keeping the file is the lower-risk option.

The Files-changed table doesn't say what happens to `components/fields/core.yaml` — only `registration.yaml`/`contact.yaml`/`address.yaml` are marked for deletion. Implicitly it stays. Worth saying so explicitly so a reader doesn't assume the entire `components/fields/` directory disappears.

**Fix:** Note that `core.yaml` is the only file remaining under `components/fields/` (or move its content into `form_company.yaml` directly, since it's only two blocks, and delete the directory entirely — slightly cleaner now that the other three files leave).

## Style / consistency

### 11. `name_field` rename touches the demo's active vars file

> **Resolved (option a + README fix).** Demo Files-changed table updated: edits go to `apps/demo/modules/companies/vars.yaml` (the active file), `index.yaml` is deleted as stale, and `modules/companies/README.md:32`'s pointer at `index.yaml` is replaced (point at `vars.yaml`, or drop the pointer if it was only there for a connection-remap example that the file doesn't actually demonstrate).

`apps/demo/modules/companies/vars.yaml` (the file actually `_ref`'d from `modules.yaml`) doesn't currently set `name_field`. `apps/demo/modules/companies/index.yaml` does (line 3: `name_field: trading_name`) but appears unused. After the design's default flip, neither file needs `name_field` set unless the demo wants the SA-flavored "Trading Name" label override — and the design's example specifies `label: Company` only.

**Fix:** Confirm `index.yaml` is dead and remove it as part of this work, or document it.

## Summary

The design's idea (universal core + opt-in section presets + section-merge writes) is sound and follows the established `module-field-pattern`. The gaps are at the implementation surface:

- **Pages need rewrites** (finding 1) — currently invisible in the Files-changed table.
- **Create-vs-update syntax distinction** (finding 2) — `$mergeObjects` doesn't work in inserts.
- **Excel/view ambiguities** (findings 3, 4, 5) — implementation details that need a single answer before tasks can be sliced.
- **Migration nuance** for demo seed data (finding 6).

Findings 7-11 are wording/cleanup. Address findings 1-6 before slicing tasks.
