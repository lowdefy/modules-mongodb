# Task 6: Demo wiring + reseed

## Context

The demo app is the only consumer of the companies module today. After tasks 1-5:

- The module exports field-presets and `fields.X` slots.
- The runtime path expects the new schema (`name`, `contact.*`, `address.*`, `registration.*`).
- The demo's existing seed data still has `trading_name` / `registered_name` / `registration_number` / `vat_number` / `website` / `address.registered.*` at the legacy positions.

This task:

1. Wires the SA presets in the demo's active vars file (`apps/demo/modules/companies/vars.yaml`).
2. Deletes `apps/demo/modules/companies/index.yaml` — a stale snapshot of var defaults from before `vars.yaml` existed; nothing in the build references it.
3. Drops and reseeds the demo `companies` collection. In-place migration via `update-company` would leave `address.registered.*` legacy keys behind under `$mergeObjects` shallow-merge — reseeding sidesteps this.

The demo's module entry lives in `apps/demo/modules.yaml:1-4`:

```yaml
- id: companies
  source: "file:../../modules/companies"
  vars:
    _ref: modules/companies/vars.yaml
```

The `_ref` resolves to `apps/demo/modules/companies/vars.yaml`, which today has just `event_display`. That's the file to extend.

## Task

### 6.1 Update `apps/demo/modules/companies/vars.yaml`

Add SA preset wiring + the `Company` label override. Keep the existing `event_display` block:

```yaml
label: Company
label_plural: Companies
fields:
  registration:
    _ref: ../../../../modules/companies/field-presets/registration-sa.yaml
  contact:
    _ref: ../../../../modules/companies/field-presets/contact-default.yaml
  address:
    _ref: ../../../../modules/companies/field-presets/address-text.yaml
  attributes:
    - id: attributes.industry
      type: Selector
      properties:
        title: Industry
        options:
          - Manufacturing
          - Services
          - Retail
event_display:
  demo:
    create-company: "{{ user.profile.name }} created {{ target.name }}"
    update-company: "{{ user.profile.name }} updated {{ target.name }}"
```

Path verification: `_ref` paths in app-level YAML resolve relative to the file's directory. From `apps/demo/modules/companies/vars.yaml`, walking up to the repo root and into `modules/companies/field-presets/` is `../../../../modules/companies/field-presets/`. Confirm during implementation by running `pnpm ldf:b:i` — a wrong path will surface as a build error.

The `address-text.yaml` preset is wired (zero-dep). The `address-places.yaml` preset is **not** wired in the demo because the underlying plugin doesn't exist yet — the demo can swap to it once the plugin lands.

### 6.2 Delete `apps/demo/modules/companies/index.yaml`

The file is unused. Confirm with:

```bash
grep -rn "modules/companies/index" apps/ modules/ 2>/dev/null
```

The only hit before this task is `modules/companies/README.md:32` (a doc pointer, fixed in task 7). Deleting `index.yaml` is safe.

### 6.3 Reseed the demo `companies` collection

Drop the existing collection and reseed with new-shape sample docs. There are several ways to do this; pick whichever the team uses for demo data management. A minimal hand-run via `mongosh`:

```javascript
db.companies.drop();

db.companies.insertMany([
  {
    id: "C-0001",
    name: "Acme Limited",
    description: "Industrial widgets and gadgets.",
    contact: {
      website: "https://acme.example.com",
      primary_email: "info@acme.example.com",
      primary_phone: "+27 11 555 0101",
    },
    address: {
      formatted_address: "1 Example Road, Johannesburg, South Africa",
      extra: "Unit 5",
    },
    registration: {
      registered_name: "Acme Limited",
      registration_number: "1990/000001/07",
      vat_number: "4000000001",
    },
    attributes: { industry: "Manufacturing" },
    lowercase_email: "info@acme.example.com",
    removed: null,
    created: {
      timestamp: new Date(),
      user: { id: "demo", name: "Demo" },
      app_name: "demo",
    },
    updated: {
      timestamp: new Date(),
      user: { id: "demo", name: "Demo" },
      app_name: "demo",
    },
  },
  // …add 3-5 more rows covering Services / Retail industries to exercise the table filters
]);
```

If the project has a documented seed script, update that script to emit the new shape and re-run it instead of the inline `mongosh` snippet.

## Acceptance Criteria

- `apps/demo/modules/companies/vars.yaml` wires `fields.registration` / `fields.contact` / `fields.address` to the corresponding presets and includes the existing `event_display` block.
- `apps/demo/modules/companies/index.yaml` is deleted.
- `pnpm ldf:b:i` and `pnpm ldf:d:i` both succeed.
- Loading the demo's companies list shows the seeded rows with non-empty `name` cells.
- Clicking a row, then "Edit", then "Save" round-trips correctly: `contact.*` / `address.*` / `registration.*` / `attributes.*` keys persist as nested sub-objects; no stray `address.registered.*` keys appear on saved docs (verify with `db.companies.findOne({})`).
- `grep -rn "trading_name\|address\.registered\|registered_name\|registration_number\|vat_number" apps/demo/modules/companies/` returns nothing.

## Files

- `apps/demo/modules/companies/vars.yaml` — modify (add `label`/`label_plural`/`fields`; keep `event_display`)
- `apps/demo/modules/companies/index.yaml` — delete
- demo `companies` MongoDB collection — drop and reseed (operational, not a file change)

## Notes

Use the Infisical-aware `pnpm ldf:b:i` / `pnpm ldf:d:i` commands per `MEMORY.md` ("Infisical build commands — use `pnpm ldf:b:i` / `ldf:d:i` / `ldf:i`; plain variants fail on missing NEXTAUTH_SECRET").

If you spot the README reference to `apps/demo/modules/companies/index.yaml` while testing (`modules/companies/README.md:32`), don't fix it here — task 7 owns the README rewrite.
