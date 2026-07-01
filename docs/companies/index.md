---
title: Companies
module: companies
type: index
---

# Companies

Company management — list, detail, edit, and create pages plus a company selector. Companies are stored in their own collection with auto-generated consecutive IDs (`C-0001`, `C-0002`, …) and a configurable display name field.

The module is paired with [`contacts`](../contacts/index.md): the company `view` page renders a contacts tile, and create/update reconciles bidirectional links on linked contact records.

## Dependencies

| Module                           | Why                                     |
| -------------------------------- | --------------------------------------- |
| [layout](../layout/index.md)     | Page wrapper                            |
| [events](../events/index.md)     | Audit logging and `change_stamp`        |
| [contacts](../contacts/index.md) | Contacts tile and bidirectional linking |
| [files](../files/index.md)       | Optional file-attachments sidebar tile  |

Cross-module cycle: `companies ↔ contacts`. Both must be added as separate entries in `lowdefy.yaml`; the build resolves the cycle at runtime.

## When to use

Add `companies` when an app needs to manage an organisation/account list — CRM company records, clients, suppliers, or any entity that groups contacts. Pair with `contacts` for bidirectional linking.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: companies
    source: "github:lowdefy/modules-mongodb/modules/companies@v0.8.1"
    vars:
      app_name: my-app
      label: Company
      label_plural: Companies
      id_prefix: "C-"
      id_length: 4
      hierarchy:
        enabled: false
```

Defaults work out of the box. To point the module at a different MongoDB collection, remap `companies-collection` via the entry's `connections` mapping.

## Field presets

The module ships block-array presets under `field-presets/` for contact info, address, and registration sections. Wire whichever you need:

```yaml
fields:
  contact:
    _ref: ../../modules/companies/field-presets/contact-default.yaml
  address:
    _ref: ../../modules/companies/field-presets/address-text.yaml
  registration:
    _ref: ../../modules/companies/field-presets/registration-sa.yaml
```

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App name scoping](../shared/app-name.md) — how `app_name` keys event display data
- [Event display](../shared/event-display.md) — per-app Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
