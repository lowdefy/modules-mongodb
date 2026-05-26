# Part 31 — Keyed auto-unblock fan-out

**Status:** Draft / open for team discussion. Out of scope for Part 9; surfaced from [Part 9 § Review 3 finding #1](../09-hook-invocation/review/review-3.md).

**Source rationale:** [workflows-module/parts/_completed/07-group-state-machine/design.md](../_completed/07-group-state-machine/design.md), [workflows-module/parts/_completed/06-submit-action-writes/design.md § Per-entry write loop](../_completed/06-submit-action-writes/design.md). **Layer:** engine handlers. **Size:** S–M (depends on chosen approach). **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Problem

`computeAutoUnblocks` emits entries keyed by `type` only — no `key` / `keys` field ([`computeAutoUnblocks.js:75–78`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js)):

```js
return [...unblockedTypes].map((type) => ({
  type,
  status: "action-required",
}));
```

The per-entry write loop in `handleSubmit.js` defaults `entry.keys ?? [null]`, then `findMatchingActionDocs` filters by `doc.key === null` when the key is null/undefined ([`handleSubmit.js:10–18, 188`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)):

```js
if (key === null || key === undefined) {
  return doc.key === null;
}
```

**Consequence.** For a **keyed action type** (multiple instances of the same type, each with a distinct `key`), an auto-unblock entry only matches docs with `key === null`. Keyed instances of that type stay in `blocked` even though their `blocked_by` gate has opened.

## Where this is visible

- `computeAutoUnblocks` walks `workflowActions` and emits one entry per unblocked **type**, regardless of how many keyed instances of that type exist (the `Set` collapses duplicates).
- The write loop's keyless filter (`doc.key === null`) is a non-match for any keyed doc.
- No test currently exercises auto-unblock against a keyed action type with multiple keyed docs in `blocked`.

## Open questions for team discussion

1. **Is this a real gap or an unused configuration?** Are there shipped workflows today where a keyed action type appears as `blocked` and depends on a `blocked_by` entry that can transition mid-workflow? If no, the gap is theoretical and we can defer further.
2. **Auto-unblock semantics for keyed types.** When type B's gate opens (e.g. group X went `done`), and three keyed docs of type B exist in `blocked`, do we want:
   - **(a) Fan out across every blocked keyed doc** — emit one transition per keyed doc. Matches the "the gate opened, every gated instance moves" reading.
   - **(b) Pick the first/oldest blocked keyed doc** — emit one transition for one instance. Matches a "queue" reading.
   - **(c) Author-controlled** — let the workflow author declare the fan-out policy on the action config; default to (a).
3. **Producer vs write-loop responsibility.** Two implementation shapes:
   - **Producer fans out.** `computeAutoUnblocks` emits one entry per `(type, key)` pair (`{ type, keys: [k1, k2, ...] }` or one entry per key), and the write loop stays as-is. Keeps the write loop's `(type, key)` contract pure.
   - **Write loop fans out.** Producer stays keyless; write loop, on a keyless entry, finds *every* blocked doc of that type (not just `key === null`) and transitions each. Smaller change to the producer but couples the write loop to "keyless means all blocked instances of this type."
4. **Interaction with Part 9 collision rule.** Part 9's pre-hook `actions[]` merge collides on `(type, key)`. If the producer fans out across keys (option 3 producer-fans-out), Part 9's collision pass naturally extends — a pre-hook entry for `(B, k1)` replaces the auto-unblock for that pair only. If the write loop fans out (option 3 write-loop-fans-out), Part 9's normalization-then-collide pipeline needs a different story for keyless entries.

## Why this is out of scope today

Part 9's review surfaced the keyless shape and asked for bilateral normalization (so the collision pass works for non-keyed actions). That fix is sufficient for Part 9 to ship: non-keyed auto-unblock + non-keyed pre-hook collision works correctly. The keyed-fan-out gap is a separate behavioural question about what auto-unblock should *do* for keyed types, not a Part 9 contract gap. Holding it for team discussion avoids baking a snap decision into Part 9.

## Depends on

- [Part 7 — group state machine](../_completed/07-group-state-machine/design.md) — owner of `computeAutoUnblocks`.
- [Part 6 — submit action writes](../_completed/06-submit-action-writes/design.md) — owner of the per-entry write loop and `(type, key)` contract.
- [Part 9 — hook invocation](../09-hook-invocation/design.md) — collision-pass contract that any producer-side shape change has to align with.

## Open questions

_(See "Open questions for team discussion" above. To be resolved before this part moves out of draft.)_
