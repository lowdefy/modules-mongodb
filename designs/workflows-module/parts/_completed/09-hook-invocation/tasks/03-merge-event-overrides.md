# Task 3: `mergeEventOverrides.js` — four-layer event-overrides merge

## Context

Part 8's [`buildDefaultLogEventPayload`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js) returns the unkeyed engine-default event payload `{ type, display, references, metadata }`. Per [Part 13 § Comment mapping](../../13-resolver-apis/design.md#comment-mapping) — and per Part 13's "Pending handler work" follow-up — layer 3 (runtime `comment`) is folded into `buildDefaultLogEventPayload` itself: that function accepts `comment` and writes `metadata.comment` already (or will, once the part-13 follow-up lands; either way Part 9 treats it as already composed and does **not** re-inject `comment` here).

The four-layer composition Part 9 owns:

1. Engine default (already includes runtime comment).  ← `buildDefaultLogEventPayload(..., comment)`
2. Action YAML `event_overrides[interaction]` — from `params.event_overrides?.[interaction]` (resolver-baked, see [makeWorkflowApis.js:42–55](../../../../modules/workflows/resolvers/makeWorkflowApis.js)).
3. (Already folded into layer 1.)
4. Pre-hook return `event_overrides` — unkeyed runtime bag from the pre-hook response.

Layers merge last-wins, deep at the `{ type, display, references, metadata }` level. The merge is a deep merge at the **field key** level inside `metadata` / `display` / `references` (so a YAML `metadata.foo` plus a pre-hook `metadata.bar` keeps both, and a YAML `metadata.comment` is overwritten by the layer-1 comment from layer 1 and then again by a pre-hook `metadata.comment` if any).

`type` is a scalar — last non-empty wins. `display`, `references`, `metadata` are objects — deep-merge per-key, last wins.

## Task

1. Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.js`. Export default function with the signature:

   ```js
   mergeEventOverrides({
     defaultPayload,    // output of buildDefaultLogEventPayload — { type, display, references, metadata }
     yamlOverride,      // params.event_overrides?.[interaction] — undefined when no YAML override
     preHookOverride,   // pre-hook return `event_overrides` — undefined when no pre-hook or no override
   }) → { type, display, references, metadata }
   ```

2. Implementation:
   - Start with the default payload as the base.
   - Apply `yamlOverride` next: deep-merge per top-level key (`type`, `display`, `references`, `metadata`). For object-valued keys, shallow-merge inside (Object.assign-style — keys present on the override win; keys not present on the override fall through from the base).
   - Apply `preHookOverride` last with the same deep-merge semantics.
   - `type` scalar: override wins when present (truthy or any string value).

3. Colocated `mergeEventOverrides.test.js` covers:
   - No overrides → returns `defaultPayload` unchanged.
   - YAML override on `metadata.foo` → result has `metadata.foo` from YAML and `metadata.action_type` from default.
   - YAML override does **not** clobber `metadata.comment` set by the default (regression check for the layer-3-folded-into-layer-1 placement): default has `metadata.comment: 'hello'`, YAML has `metadata.foo: 'bar'` → result has both.
   - Pre-hook override on `metadata.comment` overrides the runtime comment baked into layer 1: default has `metadata.comment: 'hello'`, pre-hook has `metadata.comment: 'SCRUBBED'` → result has `metadata.comment: 'SCRUBBED'`.
   - Pre-hook override on `type` replaces default `type`.
   - Pre-hook override on `display.{appName}.title` replaces default title (nested deep-merge).
   - YAML + pre-hook combined: pre-hook wins on collision; non-colliding YAML fields remain.

## Acceptance Criteria

- `mergeEventOverrides.js` exists; pure function.
- `mergeEventOverrides.test.js` exists with the cases above; all pass.
- Function does **not** re-inject `comment` as a separate layer-3 step (design footnote: "that would double-inject").

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.test.js` — create.

## Notes

- The merge depth is intentionally one level deep on `display` / `references` / `metadata` — a YAML/pre-hook override on `metadata.foo` overwrites the entire value at `foo`; arrays and nested objects under a single key are replaced wholesale, not recursively merged. This matches the spec's `{ type, display, references, metadata }` four-tuple shape; deeper merging is out of scope.
- `display` is keyed by `app_name` (see [dispatchLogEvent.js:48–56](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js)); an override on `display.{appName}.title` replaces just that nested value via the per-key shallow merge.
