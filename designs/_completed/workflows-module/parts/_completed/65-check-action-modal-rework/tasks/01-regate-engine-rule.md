# Task 1: Re-gate the universal-fields write rule on transition `source`

## Context

This is the governing change of Part 65 (design decision **D1**). The workflow engine's plan-phase planner `planActionTransition.js` decides, on the **update** path (a user submit transitioning an existing action), whether the incoming `payload.fields` bag may write the two universal fields `assignees` / `due_date`.

Today it gates on action **kind**: a helper `applyUpdateFieldsRule(fields, kind)` passes universal keys through verbatim when `kind === "check"` and strips them for `form` / `tracker`. That `check` exception existed only so a check submit could carry assignees/due through its transition.

`kind` was never the right axis — the thing being guarded against is a **user submission** clobbering metadata, and a submission is a user action regardless of kind. The engine already threads a transition `source` (`'user' | 'auxiliary' | 'cascade'`, default `'user'`) into `planActionTransition` (the user's own action is `source: 'user'`; pre-hook auxiliary signals are `'auxiliary'`; engine cascades are `'cascade'` — see `planSubmit.js` step 1). So re-gate on `source`: strip universal keys for `source === "user"` (every kind), pass them through for `'auxiliary'` / `'cascade'` (legitimate hook/cascade orchestration seeding — the counterpart to start-time seeding).

The create/upsert path is unchanged: it never calls this helper (line ~195, `...payload.fields` spread directly), so start-time and hook seeding onto a freshly-spawned action still work.

File: `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js`.

## Task

### 1. Rewrite the helper (currently lines 23–29)

```js
function applyUpdateFieldsRule(fields, source) {
  if (fields == null) return {};
  if (source !== "user") return fields; // hook/cascade orchestration may seed universal fields
  const filtered = { ...fields };
  for (const key of UNIVERSAL_FIELDS) delete filtered[key];
  return filtered;
}
```

### 2. Update the call site (currently line ~205, inside the `else` / update branch)

```js
...applyUpdateFieldsRule(payload.fields, source),
```

(Replace the `actionConfig.kind` argument with the already-in-scope `source` param.)

### 3. Update the comments / JSDoc to describe the source gate, not the kind exception

- The `UNIVERSAL_FIELDS` block comment (lines ~7–13): replace the "written only for `kind: check`" framing with the source framing — universal keys are written on the update path only for non-user (`auxiliary` / `cascade`) transitions; a `user` submit never writes them (owned exclusively by the `UpdateActionFields` operation). Keep the Part 64 "dropped `description`" note.
- The `applyUpdateFieldsRule` JSDoc (lines ~16–22): "Apply the **source**-based universal-fields rule … strip `assignees` / `due_date` when `source === 'user'`; pass through for hook/cascade orchestration. All other keys pass through verbatim for every source. The create/upsert path does NOT call this."
- The `@param {{ fields?, metadata? }} [args.payload]` JSDoc (lines ~79–83): the `payload.fields` note now describes the source gate — on the UPDATE path the two universal keys are stripped for a `user` submit (all kinds) and passed through for `auxiliary` / `cascade`; all other keys pass through verbatim on both paths.
- The inline comment above the update-branch `doc = { ... }` (lines ~198–200): change "kind-based universal-fields rule … dropped unless kind: check" to "source-based universal-fields rule … dropped for a `user` submit; passed through for `auxiliary` / `cascade`".

### 4. Rewrite / add the planner's own unit tests

File: `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js`. The `plan()` helper (lines 53–64) defaults `source` to undefined → the planner defaults it to `"user"`.

- **Rewrite** the test currently at line 107, `"check kind update: payload.fields is a verbatim passthrough (universal keys written)"`. Under the new rule a `check` **user** submit now **strips** the universal keys (parity with form/tracker) while non-universal keys still write. Rename it accordingly (e.g. `"check kind user update: universal keys stripped (parity with form/tracker); non-universal keys still written"`), seed the loaded action with prior `assignees` / `due_date` so you can assert they are preserved (not clobbered), and assert the non-universal `custom_field` still passes through:

```js
test("check kind user update: universal keys stripped (parity with form/tracker); non-universal keys still written", () => {
  const fields = {
    assignees: [{ id: "u2" }],
    due_date: "2026-06-01",
    custom_field: 42,
  };
  const result = plan({
    action: makeAction({
      kind: "check",
      assignees: ["orig"],
      due_date: "orig-date",
    }),
    actionConfig: makeConfig({ kind: "check" }),
    payload: { fields },
  });
  expect(result.doc.assignees).toEqual(["orig"]);
  expect(result.doc.due_date).toBe("orig-date");
  expect(result.doc.custom_field).toBe(42);
});
```

- **Add** a test asserting an `auxiliary` (or `cascade`) source update **passes universal keys through** — the hook seeding path D1 preserves. Use a stage/signal that resolves on the update path (e.g. a `check` action at a stage where the auxiliary signal is valid; mirror the existing auxiliary-source tests around lines 299/330). Assert `result.doc.assignees` / `result.doc.due_date` equal the bag values:

```js
test("auxiliary-source update: universal keys pass through (hook seeding path)", () => {
  const result = plan({
    source: "auxiliary",
    action: makeAction({ kind: "check", /* stage where signal is valid */ }),
    signal: /* a signal valid from that stage */,
    actionConfig: makeConfig({ kind: "check" }),
    payload: { fields: { assignees: ["u-9"], due_date: "2026-09-09" } },
  });
  expect(result.doc.assignees).toEqual(["u-9"]);
  expect(result.doc.due_date).toBe("2026-09-09");
});
```

Leave the insert/upsert/seed-mode tests (universal keys written on create — lines ~176, ~196) **unchanged**: those exercise the create path, which never calls the helper.

## Acceptance Criteria

- `applyUpdateFieldsRule` takes `source` and strips universal keys iff `source === "user"`.
- The update-branch call site passes `source` (not `actionConfig.kind`).
- All comments/JSDoc describe the source gate; no stale `kind === "check"` references remain in this file.
- The create/upsert path is untouched (`...payload.fields` spread still verbatim).
- `pnpm jest planActionTransition` passes, including the rewritten check-user test and the new auxiliary-source passthrough test.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — helper signature + branch, call-site arg, comments/JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js` — modify — rewrite the check-update test; add an auxiliary-source passthrough test.

## Notes

- `source` is already a destructured param of `planActionTransition` (default `"user"`) and already in scope at the call site — no signature change to `planActionTransition` itself.
- This task changes engine behavior for a _check user submit_ (it no longer writes universal fields on transition). Task 5 separately removes the now-pointless `fields` payload from the check submit, but the two are independent: with the source gate in place, a check user submit sends nothing the engine would write anyway. The gate is the durable, kind-agnostic guarantee.
