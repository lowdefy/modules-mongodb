# Task 8: Write the form-components library README

## Context

Tasks 1–7 have shipped all 27 components at `modules/workflows/components/fields/{name}.yaml`. The design ([../design.md](../design.md) §"Component README") requires a README at `modules/workflows/components/fields/README.md` covering three specific things — this task writes it.

The README serves action authors who write `form:` blocks. It is not a Lowdefy module README (that's part 20's manifest doc). The audience is someone authoring `form: [{ component: text_input, key: ... }, ...]` and needing to know which components exist, what vars each takes, and where the library boundary sits.

## Task

Create `modules/workflows/components/fields/README.md` with the following sections:

### 1. Introduction

One paragraph: what the library is (internal field components consumed by the form-builder resolver in part 15), how authors reference components (by name in action `form:` blocks), and that apps never `_ref` library entries directly.

### 2. Library boundary

Two short subsections, lifted from the design:

- **Internal-only.** Components are referenced by name in action `form:` blocks; they are **not** exposed via `_module.componentId`. Apps wanting custom fields ship a regular Lowdefy custom block plugin and reference it as `component: <plugin-name>:foo` in `form:` blocks. The form-builder resolver passes through any `component:` name it doesn't recognise as a library component.
- **Universal-fields-vs-form.** `assignees`, `due_date`, and `description` are **not** part of the library — they render in the page templates (part 16) via the page chrome. Authors don't include them in `form:` blocks.

Link the two clauses to their concept-design source: [workflows-module-concept/action-authoring/spec.md](../../../../designs/workflows-module-concept/action-authoring/spec.md) §"Universal action fields" and §"Form components library".

### 3. Component reference

A section per component, in the order the design groups them (Text, Numeric, Date, Choice, Files, Location, Display, Structure, Actions). For each component:

- **Heading** with the component name as `code`.
- **Purpose**: one sentence (mirror the table in spec.md §"v1 components").
- **Vars**: a definition list or table — name, type, required/default, one-line description. Lifted from each component's `vars:` block.
- **Authoring example**: 4–10 lines of YAML showing the component in a `form:` block. For trivial components (`title`, `section_title`, `html`), one line is enough. For `controlled_list`, reuse the design's example:

```yaml
- component: controlled_list
  key: form.devices
  title: Devices
  required: true
  hideAddButton: true
  form:
    - component: label_value
      key: form.devices.$._id
      title: Honeycomb Number
    - component: date_range_selector
      key: form.devices.$.warranty
      title: Warranty
      required: true
```

- **Renders**: name the Lowdefy block type the component emits (e.g. "Renders an `S3UploadDragger` wrapped in a `Label`"). Read this from each component's `config.type`.

### 4. Custom components

One paragraph + example block. Lift the design's "Override + extension" section:

> Apps that need a domain-specific component ship it as a regular Lowdefy custom component in their plugin and reference it in `form:` blocks via `component: <plugin-name>:device_selector`. The form-builder resolver passes through any `component:` name it doesn't recognise as a library component.

### 5. See also

Three links:

- [Action authoring spec](../../../../designs/workflows-module-concept/action-authoring/spec.md) — full grammar for `form:` blocks.
- [Form-builder resolver design (part 15)](../../../../designs/workflows-module/parts/15-resolver-form-builder/design.md) — how component references are substituted at build time.
- [Page templates (part 16)](../../../../designs/workflows-module/parts/16-page-templates/design.md) — where universal fields (`assignees`, `due_date`, `description`) live.

## Acceptance Criteria

- `modules/workflows/components/fields/README.md` exists.
- The five sections above are present in order.
- Every one of the 27 ported components has a §3 entry — no gaps, no extras.
- Component vars in the README match the `vars:` block in the corresponding `.yaml` file (if README and `vars:` disagree, the README is wrong — `vars:` wins per CLAUDE.md "Manifest is the source of truth for var schema").
- The library-boundary and universal-fields-vs-form clauses are present and link back to the concept spec.

## Files

- `modules/workflows/components/fields/README.md` — create

## Notes

- Don't restate the form-builder resolver's behaviour in detail — the README links to part 15. The audience is an action author, not a resolver author.
- The README is the user-facing doc. The internal porting note `modules/workflows/components/fields/PORTING.md` (from task 1) is **separate** — leave it in place; task 9 retires it when the work is fully done.
