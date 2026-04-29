---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-companies": patch
---

Add `ContactSelector` block and wire it into the `contacts` module as a reusable picker (`contacts.contact-selector` component). Search runs against an Atlas `$search` + `$match` pipeline (`search_contacts`), enrichment via `get_contacts_data`, and add/edit go through the existing `create-contact` / `update-contact` APIs (patched to accept the picker's payload shape). The `companies` form now consumes the picker for linked contacts.

**Breaking — contacts module vars renamed:**

- `all_contacts` (module, default `false`, company-scoped) → per-call `company_only_contacts` (default `false`, **unscoped**). The default flipped: callers that relied on the old company-scoped default must now pass `company_only_contacts: true` explicitly.
- `verified` (module enum `off|trusted|untrusted`) → `use_verified` (module boolean, default `false`) + per-call `verified` (boolean). The module flag toggles the verification UI/payload writes globally; per-call `verified` decides the value each picker instance writes.
- Removed: module-level `phone_label` (no-op since Task 4) and the per-call `payload` var (deprecated by per-key var pass-through).

**Migration:**

```
all_contacts: false       →  company_only_contacts: true   (per-call)
all_contacts: true        →  company_only_contacts: false  (per-call, or omit)
verified: trusted         →  use_verified: true (module) + verified: true  (per-call)
verified: untrusted       →  use_verified: true (module) + verified: false (per-call)
verified: off             →  use_verified: false (module, default)
```
