# Part 14 — Form components library

> **Deviation (superseded by [Part 58](designs/workflows-module/parts/_completed/58-form-custom-component-seam/design.md)):** Where this design describes app-specific fields shipping as a namespaced `component: <plugin>:<name>` plugin component, that path was based on a false premise and never rendered (see Part 58). The real escape hatch is a **raw inline Lowdefy block** in the `form:` array. The library mechanism described here is otherwise accurate.

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md). **Layer:** resolvers. **Size:** M. **Repo:** `modules/workflows/components/fields/`.

## Goal

Ship the 27 internal field components that form actions reference by name in their `form:` blocks. Each component is a small reusable YAML fragment with declared vars and a block-config template. The components are internal — consumed only by the form-builder resolver ([part 15](../15-resolver-form-builder/design.md)).

## In scope

### Components (27 total)

All live at `modules/workflows/components/fields/{name}.yaml`. Each component file shape:

```yaml
vars:
  <param>: { type, required, default }
config: id, type, properties, blocks, ...
```

**Text**: `text_input`, `text_area`, `tiptap_input`
**Numeric**: `number`
**Date**: `date_selector`, `date_range_selector`
**Choice**: `selector`, `multiple_selector`, `radio_selector`, `checkbox_selector`, `button_selector`, `checkbox_switch`, `yes_no_selector`, `enum_selector`
**Files**: `file_upload`, `file_download`
**Location**: `location`
**Display**: `label`, `label_value`, `title`, `section_title`, `alert`, `html`
**Structure**: `box`, `section`, `controlled_list`
**Actions**: `button`

### Component README

`modules/workflows/components/fields/README.md` documents:

- Component-by-component usage (vars, what they render, examples).
- The internal-library boundary: components are referenced by name in action `form:` blocks; they are NOT exposed via `_module.componentId`. Apps wanting custom fields ship a regular Lowdefy custom block.
- The universal-fields-vs-form boundary: assignees / due_date / description are not part of the library; they render in the page templates (part 16) via the page chrome.

### Not in scope here

- **Substitution / resolution logic** → [part 15 (resolver-form-builder)](../15-resolver-form-builder/design.md). This part only ships the YAML fragments.

## Out of scope / deferred

- **App-side custom components.** Concept says apps ship custom components via standard Lowdefy patterns (`component: <plugin-name>:foo`). Not part of the library.
- **Versioning of library components.** Treated as part of the workflows module; bumps with the module.

## Depends on

Nothing. Can ship in parallel with all other parts.

## Verification

Verification rolls up into downstream parts rather than living in this part:

- **YAML validity** is checked by Lowdefy's loader during the demo app build (part 20). A malformed component file fails the build with a path to the offending file.
- **Substitution correctness** is part 15's verification — the form-builder resolver is the real consumer, and its integration tests render fixture forms against the real library. A reimplementation of the resolver inside part 14 would approximate part 15 and drift from it.
- **README accuracy** is checked by reading: every component file in the directory has a §"Component reference" entry, and every var listed in a README table matches the component's `vars:` declaration.

This part does not ship its own test harness.

## Open questions

- **Per-component schema validation** — should the resolver in [part 15](../15-resolver-form-builder/design.md) validate vars against the component's `vars:` declaration? Lean yes; defer the strictness call to part 15.
- **Display components on review pages.** Some components (e.g. `label_value`) display read-only on review pages; ensure they behave correctly. Test in part 15's integration.

## Contract to neighbours

- **Part 15 (resolver-form-builder)** consumes these components by name. Component file names are the contract — renaming is a breaking change.
- **Part 4 (workflow-config-schema)** doesn't validate `component:` names; that's part 15's job at build time.
