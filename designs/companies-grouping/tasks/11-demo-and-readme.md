# Task 11: Enable hierarchy in demo + update README

## Context

After all the feature tasks (1–10) land, the demo app (`apps/demo/`) needs to flip `hierarchy.enabled: true` so the feature is visibly demoable, and the module's README needs a Vars-section entry plus a How-to-Use snippet so consumers know how to enable hierarchy.

No seed data is added — users exercise the feature manually against the demo's existing companies.

The existing demo vars file at `apps/demo/modules/companies/vars.yaml` already configures `label`, `label_plural`, `fields`, and `event_display` for the demo. This task adds a `hierarchy` block.

The README at `modules/companies/README.md` currently documents the module's vars, exports, and how to use it. The "Vars" section needs a `hierarchy` entry; the "How to Use" snippet (currently lines 20–30) can stay as-is, with an optional addition showing the hierarchy flag.

## Task

### A. Enable hierarchy in the demo

Modify `apps/demo/modules/companies/vars.yaml`. Append:

```yaml
hierarchy:
  enabled: true
```

That's the entire change — defaults handle `parent_label` and `children_label` (which auto-pluralise to "Parent Companies" / "Child Companies" via `label_plural: Companies` already set in the file).

### B. Document the new `hierarchy` var in the module README

Modify `modules/companies/README.md`. In the Vars section (currently starts at line ~84 with `### label / label_plural`), add a new subsection — placement matches the manifest order, so put `### hierarchy` after `### id_prefix / id_length` and before `### event_display`:

```markdown
### `hierarchy`

`object` — Default `{ enabled: false }`. Configures parent-child relationships between companies as a directed acyclic graph (`parent_ids: string[]` on each doc).

- **`enabled`** (`boolean`, default `false`) — When true, adds a parent-companies multi-select to the edit form, shows parents + children in a sidebar tile on the view page, adds a "Under {label}" filter to the list page, and enforces cycle prevention in the create/update APIs. When false, no hierarchy UI or logic is emitted and the `parent_ids` field is omitted from new documents.
- **`parent_label`** (`string`, optional) — Override for the parent multi-select label and the parents heading in the view-page sidebar tile. Defaults to `"Parent {label_plural}"` (composed at the usage site).
- **`children_label`** (`string`, optional) — Override for the children heading in the view-page sidebar tile. Defaults to `"Child {label_plural}"` (composed at the usage site).

Cycles are prevented on both the API (a `$graphLookup` ancestor check on `update-company` rejects self-as-ancestor) and the UI (the parent selector renders self + descendants as disabled options with a "(would create cycle)" suffix). Soft-deleted parents are filtered out of the view-page tile but remain in `parent_ids` arrays as audit history.
```

In the "How to Use" snippet (currently lines 20–30), add an example showing how to enable hierarchy:

```yaml
modules:
  - id: companies
    source: "github:lowdefy/modules-mongodb/modules/companies@v0.3.0"
    vars:
      label: Company
      label_plural: Companies
      name_field: trading_name
      id_prefix: "C-"
      id_length: 4
      hierarchy:
        enabled: true
```

(Bump the version reference to `v0.3.0` to match the manifest bump in task 1.)

In the "Pages" Exports table or a separate note at the end of "How to Use", briefly mention that enabling `hierarchy` also surfaces parent/children in the view-page sidebar and adds a hierarchy filter on the list — single-paragraph note is enough.

In the "Notes" section at the bottom (currently line 144+), add a short paragraph:

```markdown
The `hierarchy` var is opt-in — when disabled (the default), the module behaves as if hierarchy didn't exist and the `parent_ids` field is omitted from inserts. Apps can enable it later without a data migration; existing companies simply have no `parent_ids` field, which behaves identically to an empty array under MongoDB multikey index semantics.
```

## Acceptance Criteria

- `apps/demo/modules/companies/vars.yaml` has `hierarchy: { enabled: true }`.
- `pnpm ldf:b:i` builds successfully against the demo. Inserting a new company in the demo creates a doc with `parent_ids: []`.
- `modules/companies/README.md` has a Vars subsection for `hierarchy` documenting all three properties.
- `modules/companies/README.md` "How to Use" snippet shows an example with `hierarchy.enabled: true` and references `v0.3.0`.
- `modules/companies/README.md` "Notes" section explains the opt-in / no-data-migration property.
- Manual smoke test (after all prior tasks land): demo app shows the parent picker on the edit form, the hierarchy tile on the view page, and the "Under Company" filter on the list page.

## Files

- `apps/demo/modules/companies/vars.yaml` — modify — append `hierarchy: { enabled: true }`.
- `modules/companies/README.md` — modify — add `### hierarchy` Vars subsection; update "How to Use" snippet with the hierarchy example and version bump; add opt-in note to "Notes" section.

## Notes

- **No seed data.** Per the design's open-question resolution: the demo just enables the var and lets users exercise the feature manually. Seeding example parent/child relationships in the demo's MongoDB would be useful but is out of scope.
- **No data migration needed.** Existing companies in the demo's database don't have `parent_ids`. They're treated as roots (no parents) by every query that reads the field, which is the correct behaviour. An app upgrading from `v0.2.x` to `v0.3.x` can flip the flag without touching data.
- **README structure stays.** The repo's per-module README template (CLAUDE.md docs section) lists fixed sections: Description, Dependencies, How to Use, Exports, Vars, Secrets, Plugins, Notes. The hierarchy entry slots into Vars; the How-to-Use update is a snippet refresh; the Notes addition is a single paragraph. No new top-level sections.
- **Consistency with the manifest.** Per the repo's "Manifest is the source of truth for var schema" rule (CLAUDE.md), the README's Vars section restates the manifest's descriptions in narrative form. Match the wording in the manifest (task 1) — don't introduce new descriptions here.
- **Changeset.** This module ships via changesets. After this task, generate a changeset entry (`pnpm changeset` or whichever the repo uses) noting the minor bump and the new `hierarchy` opt-in. Out of scope for this task file but worth flagging at task-handoff.
