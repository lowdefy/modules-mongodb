# Task 6: Compiler emits each filter beside the section group it drives, not in a top row

## Context

Last of the `compileReport.js` chain, and the largest structural change to the emit loop.

Today `compileReport` collects every filter control into a single full-width `report_filters` Box
at the top of the report (compileReport.js: `filterBlocks` array built in the `section.type === "filter"`
branch at 553-606; assembled into `filterRow` at 644-658; returned as
`[...header, ...filterRow, ...bodyBlocks]` at 660). Nothing on a control says which sections it
scopes. Since `filterBy` is per-section, a report can carry two independent filter groups, and a
control whose only bound sections are below the fold reads as a **broken filter** — the design's
one genuine layout defect (see "The filter row says nothing about what it scopes").

**Decided:** render each filter beside the sections it drives — its **position** is the answer to
"what does this move." Stop pooling filters into the top row.

The rule (from the design, including the resolved non-contiguous sub-question):

- A filter renders **once**, immediately **above the first subscribing section in spec order** —
  never duplicated. One control, one piece of state.
- "First subscribing section" = the first section (in `sections` spec order) whose
  `filterBy` includes this filter's `field`.
- Where the filter's binding spans **more than that one section** (non-contiguous, or across
  groups), the control **keeps a scope label** naming the other bound sections. Where it drives
  only sections in one contiguous run under it, no label — position carries it.

## Task

1. Remove the top-row pooling: drop the `filterRow` Box (644-658) and the
   `return [...header, ...filterRow, ...bodyBlocks]` shape. Filters no longer live in `header`'s
   neighbourhood as a group.
2. In the section emit loop, when about to emit a body section, emit any filter whose **first
   subscribing section is this one**, immediately above it. Determine "first subscribing section"
   from spec order over `sections`. Each filter is emitted exactly once (track emitted fields).
3. Keep the existing per-control construction (daterange → `DateRangeSelector`; select/multiselect
   → `Selector`/`MultipleSelector` via `filterOptions`; the options-failure Alert path at 578-582)
   — only the **placement** changes, not how a control is built or its `onChange` requery
   (`requeryActions`, 557-561).
4. **Scope label for split bindings:** when a filter's bound-section set is larger than the single
   section it renders above (i.e. it also drives sections elsewhere), append a scope label naming
   the other bound sections to the control's `title` (the candidate-1 mechanism, now the fallback
   for the split case only). Single-group filters keep their plain label.
5. Final return is the header + the interleaved body (filters inline above their first bound
   section). Confirm KPIs (span 6) and full-width sections still lay out sensibly now that a filter
   control (span 6) may sit directly above them rather than in a dedicated row.

## Acceptance Criteria

- A report with one filter group: the control renders directly above its first bound section, no
  scope label, and no `report_filters` top-row Box exists in the compiled output.
- A report with two independent filter groups (Task 8's seeded case): each control renders above
  its own group's first section; neither sits at the top divorced from its sections.
- A filter bound to non-contiguous sections: renders once, above the first, and carries a scope
  label naming the others.
- `onChange` requery behaviour is unchanged — filtering still re-queries the bound sections.
- `pnpm ldf:b` from `apps/demo` clean; in `.lowdefy/server/build/pages/**` the compiled report has
  no `report_filters` Box and filters appear inline.
- Plugin unit tests: single-group (no label, correct position), two-group (each placed), and
  non-contiguous (rendered once + labelled) cases. `CI=true pnpm test` (sandbox off).

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify: remove top-row pooling; interleave each filter above its first subscribing section; add the split-binding scope label.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify: placement + label tests for single/two-group/non-contiguous.

## Notes

- The options-failure Alert (`filterOptions` → `sourced.failure`, 578-582) now renders inline
  above the bound section too, not in a filter row — that's fine, it's the same relocation.
- Do not duplicate a control to sit above each of several bound sections — that would fork its
  state. One control, one state key (`filterStateKey(field)`), above the first bound section, with
  a label when the binding is split.
