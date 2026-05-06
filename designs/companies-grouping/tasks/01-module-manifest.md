# Task 1: Add `hierarchy` var to module manifest, bump version

## Context

The companies-grouping feature is opt-in via a single new module var, `hierarchy.enabled` (default `false`). When `false`, every hierarchy-related block, request, and stage is build-time-skipped via `_build.if`, and the `parent_ids` field is omitted from new documents — so apps that don't enable hierarchy see zero behavioural change from today.

The flag is namespaced (`hierarchy.enabled`, `hierarchy.parent_label`, `hierarchy.children_label`) so future hierarchy-specific options can join the same var without polluting the top-level var space.

The label vars (`parent_label`, `children_label`) are **optional overrides**. When unset, consumers fall back at the usage site to `_string.concat: ["Parent ", _module.var: label_plural]` and `_string.concat: ["Child ", _module.var: label_plural]` — matching the pattern used elsewhere in this module (e.g. `modules/companies/components/button_new_company.yaml:7-9`, `modules/companies/components/excel_download.yaml:18-19`).

## Task

Modify `modules/companies/module.lowdefy.yaml`:

1. Bump `version:` (currently `0.2.0`) to `0.3.0`.
2. Add a new `hierarchy` entry under `vars:` with the structure below. Place it after the existing `event_display:` entry (top-level structural vars come before slot-shaped vars like `fields`, `components`, `request_stages`).

```yaml
hierarchy:
  type: object
  description: Configuration for parent-child relationships between companies.
  properties:
    enabled:
      type: boolean
      default: false
      description: >-
        When true, adds a parent-companies multi-select to the edit form,
        shows parents + children in a sidebar tile on the view page, adds
        a "Under {label}" filter to the list page, and enforces cycle
        prevention in the create/update APIs. Companies form a DAG (each
        company can have multiple parents). When false, no hierarchy UI
        or logic is emitted and the parent_ids field is omitted from new
        documents.
    parent_label:
      type: string
      default: null
      description: >-
        Optional override for the parent multi-select label on the edit form
        and the parents heading in the view-page sidebar tile. When null
        (the default), the label falls back at the usage site to
        `_string.concat: ["Parent ", _module.var: label_plural]`, giving
        "Parent Companies" by default.
    children_label:
      type: string
      default: null
      description: >-
        Optional override for the children heading in the view-page sidebar
        tile. When null (the default), the label falls back at the usage
        site to `_string.concat: ["Child ", _module.var: label_plural]`,
        giving "Child Companies" by default.
    max_depth:
      type: number
      default: 20
      description: >-
        Defensive cap on every $graphLookup in this module's hierarchy
        pipelines (descendants resolution + cycle check). 20 comfortably
        exceeds typical org depths (<10). The cycle check is the primary
        guard against runaway traversals; max_depth backstops the rare
        case where a cycle leaks past the API check, by truncating
        silently rather than running unboundedly.
```

## Acceptance Criteria

- `modules/companies/module.lowdefy.yaml` has `version: 0.3.0`.
- The `vars:` block has a new `hierarchy` entry with the three properties (`enabled`, `parent_label`, `children_label`) and the descriptions above.
- `pnpm ldf:b:i` builds without errors against an app that does not set `hierarchy.enabled` — i.e. the manifest changes are backward compatible (the manifest is the only thing that changed; nothing else in the module reads the new var yet).
- **Verification step**: build the demo app *without* setting `hierarchy.parent_label` or `hierarchy.children_label` in `apps/demo/modules/companies/vars.yaml`. Confirm the build does not fail and that `_module.var: hierarchy.parent_label` resolves to `null` (which `_if_none` chains in downstream tasks correctly fall through). Every other typed var in this manifest has an explicit `default:` value (verified against `module.lowdefy.yaml` lines 17–112), so explicit `default: null` matches the convention and avoids any "missing default" build error.

## Files

- `modules/companies/module.lowdefy.yaml` — modify — add `hierarchy` var, bump `version` to `0.3.0`.

## Notes

This is the only task that touches the manifest. Every subsequent task references `_module.var: hierarchy.enabled` (and occasionally the label overrides), but the manifest declaration lives here.
