# Task 7: Filter bar — one shared scope line + Reset

## Context

`filterControlBlock` (`compileReport.js` ~line 842) puts
`Also filters: <every other bound section>` in each control's label `extra`
(~line 872). The reasoning is sound for one filter and does not survive the
common case: four filters each driving six sections render four near-identical
three-line grey paragraphs — about 250px, more than any chart on the page
(design "The filter bar"; the current render measured in `findings.md` §2).

The replacement, plus a Reset that 4 of 7 corpus reports carry and the module
has no equivalent of. Filter grouping itself (cap 3, placement above the first
subscribing section) is unchanged.

## Interfaces

- **Consumes:** `filterStateKey(field)` (~line 176), `requeryActions`
  (~line 337) with its task-3/4 payload additions, `boundFilters` /
  `filtersByFirstSubscriber` grouping.
- **Produces:** nothing later tasks consume — chrome only.

## Task

All in `compileReport.js` (+ tests):

1. **Scope line.** Per filter group: compute each control's bound-section set.
   - All sets identical → drop every per-control `extra`; emit **one** muted
     line (span 24, secondary-type `Paragraph`, already in the allowlist)
     directly under the group's controls naming the driven sections once.
   - Sets differ → the **most common** set gets the shared line; only controls
     whose set differs keep their own per-control note. All different → all
     per-control notes, no shared line (today's behaviour).
2. **Reset.** One control per filter group — a small tertiary `Button`
   ("Reset") at the end of the group's row (placement per the deck,
   `wireframes.html`). `onClick`:
   - `SetState` clearing every `filterStateKey(field)` in the group **and**
     the `sections.{id}.*` keys its re-queries would have written;
   - then the same requery `CallAPI` chain a control's onChange fires
     (reuse `requeryActions` with empty filter values) for the union of the
     group's bound sections — so the sections return to their unfiltered
     first-resolve data.
   `Button`, `SetState`, and `CallAPI` are already declared in the allowlist.
3. Emit Reset only when the group has at least one filter (trivially true) —
   but skip it when the group's filters bind zero resolvable sections (the
   broken-filter edge), matching how the controls themselves degrade.

## Acceptance Criteria

- `compileReport.test.js`:
  - Two filters, same bound set → no per-control `extra`, one scope line.
  - Three filters where one differs → shared line + exactly one per-control
    note.
  - Reset block present per group; its actions clear the group's state keys
    and re-query every bound section.
- `compileReport.declared.test.js` still passes (Reset emits only declared types).
- Plugin build; `pnpm ldf:b`; `pnpm e2e` green — the `report-render.spec.js`
  filter cases (`FILTER_KPI_SECTIONS`) updated in the same change, including a
  behavioural assertion: apply a filter, Reset, and the bound KPI shows its
  unfiltered value again.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify
- `apps/demo/e2e/ai-reporting/report-render.spec.js` — update/extend

## Notes

- Reset restores the **compiled-in unfiltered data** semantics, not a page
  reload: state cleared → `__if_none` bindings fall back to the inlined
  first-resolve values. The requery in 2 is belt-and-braces for sections whose
  bindings already read state — verify against the binding shape
  (`__if_none` / `__state: sections.{id}…`) and drop the redundant half if the
  fallback alone is provably sufficient; say which you shipped in the PR.
