# Task 7: Teach the agent the new filter vocabulary and the document-not-element rule

## Context

`modules/reporting/agents/reporting-assistant.yaml` carries the system prompt that is the agent's only spec-authoring reference. Its `generate_report` section (lines ~121-143) states the per-section shapes, including:

```
  - filter:   { type, label, control, field, options? }
              control is select or daterange; a select needs options
              (or the field must declare enum values in the catalog)
```

and then the filter-binding rules: distinct fields, every filter bound by at least one section, and "a filter prepends its `$match` to the section's pipeline BEFORE it runs, so every filterable field must exist on the base collection's own documents — never a name introduced later by `$group` or `$lookup`."

Task 3 made the validator stricter and richer at the same time: a filter section's keys are now an **allowed list** (`type, label, control, field, options, match, optionsQuery`), so a key the instructions never mention is now an error rather than a silent drop. Two rules also live here _only_ — the engine deliberately does not enforce them:

- **`match: all` belongs only on a field the catalog declares `type: array`.** Catalog types are prompt material, never enforcement — gating on them would let a missing or wrong `type` reject a legitimate report — and `$all` on a scalar field is harmless (it matches when exactly one value is chosen), just confusing. Since the agent is currently the sole author of specs, this instruction _is_ the mitigation. (The save-report sheet withholding the toggle on scalar fields becomes a second layer once that sheet exists.)
- **A bound filter matches documents, not array elements.** The `$match` is prepended, so it constrains documents: filtering tags to `urgent, blocked` keeps every document carrying either, and a section that `$unwind`s the same array then emits _all_ of their tags — a chart showing bars for tags nobody selected. This is documented rather than fixed (inserting the `$match` after the unwind is a positional special case that also loses the index).

`modules/reporting/api/query-data.yaml`'s `filters` payload description says values "arrive as deferred `__state` reads resolved client-side; null/undefined values drop the triple" — accurate but incomplete now that a value can be an array and an empty array also drops the triple. The schema itself needs no change (`value: {}` already accepts anything).

## Task

In `modules/reporting/agents/reporting-assistant.yaml`, update the `generate_report` filter contract to state the full vocabulary:

- `control` is `select | multiselect | daterange`.
- `match: any | all` — `multiselect` only, default `any`. `any` matches documents carrying **any** of the selected values, `all` matches those carrying **all** of them. Use `match: all` only on a field the catalog declares `type: array`.
- `optionsQuery: { collection, pipeline, valueKey, labelKey }` — a query whose rows become the options: `valueKey` is the column the filter compares (the id), `labelKey` is what the user reads. Mutually exclusive with `options`. Use it for a foreign-key filter (project the id and a human-readable name from the target collection, sorted by the name), for a pre-filtered list, or for the distinct values of an array field (`$unwind` + `$group`).
- Options sources and their precedence: declared `options` → `optionsQuery` rows → the field's catalog enum `values`. A `select` or `multiselect` needs one of the three.
- A filter section takes **only** these keys — anything else is rejected.

Then extend the filter-binding paragraph with the document-not-element rule and its workaround: bind an array-field filter on sections that **count or aggregate documents**; when a section needs to group by the array element itself, prefer a catalogued view at the unwound grain (the pattern `docs/reporting/how-to/complex-data.md` describes, which `demo_contact_companies` demonstrates).

In `modules/reporting/api/query-data.yaml`, extend the `filters` payload description to mention that a value may be an array (a multi-select selection compiled to `$in`/`$all`) and that an **empty array** drops the triple like null does. Leave the schema itself unchanged.

Keep the prompt tight — this section is prompt budget, so state each rule once, in the same clipped register as the surrounding text. Do not restate the engine's internals (triples, `FILTER_OPS`, the compiler); the agent never sees them.

## Acceptance Criteria

- The `generate_report` filter shape line lists `{ type, label, control, field, options?, match?, optionsQuery? }` and nothing else, and the surrounding prose covers all three controls, `any`/`all` with the `type: array` rule, `optionsQuery` with `valueKey`/`labelKey`, the options precedence, and that unknown keys are rejected.
- The document-not-element limitation and the view-at-grain workaround appear in the filter-binding paragraph.
- `query-data.yaml`'s `filters` description mentions array values and the empty-array drop; its schema is unchanged.
- `pnpm ldf:b` from `apps/demo` succeeds (both files are build-time config; a YAML error fails the build).

## Files

- `modules/reporting/agents/reporting-assistant.yaml` — modify — filter contract vocabulary, the `match: all` / `type: array` rule, the document-not-element limitation and workaround.
- `modules/reporting/api/query-data.yaml` — modify — `filters` payload description only.

## Notes

Every key named here must match what task 3's allowed-key list accepts, character for character — the point of the list is that it enforces _this documented contract_. If the two disagree, the instruction is wrong, not the validator.

No module `vars` change, so `docs/{module}/reference/vars.md` is unaffected; the consumer docs rewrite is task 8.
