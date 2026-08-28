# Task 4: Verify a filter's options contract against its rows

## Context

`plugins/modules-mongodb-plugins/src/analytics/verifyContract.js` is where a declared presentation contract meets the actual result rows. A raw pipeline has no statically derivable output shape, so declared column keys are confirmed only once rows are in hand. It exports three verifiers today — `verifyChartContract({ x, y, rows })`, `verifyKpiContract({ valueKey, rows })`, `verifyTableContract({ columns, rows })` — over two internal helpers:

- `requireKeys(rows, keys, what)` — each key must appear in **at least one** row (not just row 0: `$project` conditionals, `$unionWith` over differing shapes and sparse `$group` buckets all make row 0 an unreliable sample). **Empty results skip verification** — zero rows is a legitimate outcome.
- `requireNumeric(rows, keys, what)` — value columns must be numeric where present; null cells tolerated.

Each throws `Error(message)`; the caller turns that into a tool error (chat) or a per-section Alert card (report view).

The design adds a fourth contract of exactly the same kind. A filter's `optionsQuery` declares `valueKey` and `labelKey` — the columns the options list reads — and these are a presentation contract just like a chart's `x`/`y`. Without verification, `filterOptions` (task 6) builds `{ label: undefined, value: undefined }` rows: the user gets a dropdown of blanks, selects some, and `buildFilterMatch` drops every `undefined` — a filter that visibly does nothing. This is the design's only _silent_ failure among the three ways an options query can fail, which is why it gets a verifier rather than a comment.

## Task

Add a fourth export to `verifyContract.js`:

```js
export function verifyFilterOptionsContract({ valueKey, labelKey, rows }) {
  requireKeys(rows, [valueKey, labelKey], "Filter options contract");
}
```

That is the whole function — no numeric check (an option value or label may legitimately be a string, a number, or an id) and no new helper. Its throw routes into the Alert path in task 6 the same way `verifySection` already routes a chart or table mismatch.

Keep `requireKeys`'s empty-result skip as it is. The design relies on it: an options query returning **zero rows** is a _separate_ outcome with its own Alert message ("No options available"), so the contract check and the zero-rows case must stay independent — a contract verifier that threw on empty rows would collapse two distinct failures into one wrong message.

Extend the file's header comment so the "at each render point" list mentions the filter options list alongside `buildDataParts` and `compileReport`.

Add tests to `verifyContract.test.js`, following the existing per-verifier structure:

- both keys present in the rows → no throw;
- `valueKey` absent → throws, and the message names the missing column and lists the available ones;
- `labelKey` absent → throws;
- a key present in only _some_ rows → no throw (the at-least-one-row rule);
- `rows: []` → no throw (the zero-rows outcome is handled elsewhere);
- `rows: null` / a non-array → no throw (matches the other verifiers' tolerance).

## Acceptance Criteria

- `verifyFilterOptionsContract` is exported and is one `requireKeys` call with the label `"Filter options contract"`.
- Empty and null row sets do **not** throw.
- `CI=true pnpm test verifyContract` passes (repo root, sandbox off).

## Files

- `plugins/modules-mongodb-plugins/src/analytics/verifyContract.js` — modify — the new export plus a header-comment line.
- `plugins/modules-mongodb-plugins/src/analytics/verifyContract.test.js` — modify — the cases above.

## Notes

This task has no dependencies and is imported by task 6. Do not wire it into `compileReport` here — the call site, and turning its throw into the right Alert description, belong to task 6.
