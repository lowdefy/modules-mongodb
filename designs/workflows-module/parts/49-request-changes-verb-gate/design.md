# Part 49 — `request_changes` gates on `view` OR `edit` OR `review`, not `review` alone

**Source rationale:** [workflows-module-concept/review/review-claude-1.md](review-fable-1.md) § Doc corrections (verified contradiction + resolution); supersedes the `request_changes` row of [Part 34 D6](../_completed/34-action-access-model/design.md) (deviation noted here — Part 34 is read-only history). **Layer:** engine handlers + concept docs. **Size:** S. **Repo:** `plugins/modules-mongodb-plugins/src/connections/shared/` (`phases/` + `render/`) + `designs/workflows-module-concept/`.

The engine's submit-time access gate maps the `request_changes` signal to the `review` verb, and since Part 46 the server-resolved button policy (`resolveButtons` in `resolveActionAccess.js`) gates the opt-in Request Changes button's visibility on the same `review`-only mapping. The result: on actions that declare no `review` verb at all — the case the view-bar button exists for — the button never shows and the signal is rejected for every user. This part broadens the signal's accepted verbs on both surfaces: `request_changes` passes when the caller holds **any of** `view`, `edit`, or `review` for the current app. Templates are untouched — they already render the button from the server-resolved `action.buttons.request_changes` bool, which inherits the fix.

## The semantic ruling (decided in review, Sam; `edit` arm added at implementation, Sam)

- **`review` permission gates the reviewer's _judgement_ power** — `approve` (`in-review → done`) and review-page access. That is all it gates.
- **`request_changes` is "flag a problem, send it back"** — not a judgement. Anyone who can see or work on the action may raise it: `view`, `edit`, or `review` each suffice. If an app author opts the button onto the view page, everyone with `view` permission should be able to click it.
- The `edit` and `review` arms also cover the lint-warned no-`view` edges: declaring `edit` or `review` without `view` is legal (lint-warned, not rejected — Part 34 D4), and a caller standing on their own edit or review page must never be rejected firing `request_changes` from it.

## Proposed change

1. **`SIGNAL_VERBS` values become arrays** ([loadWorkflowState.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js)) — uniform shape, one correct way; no scalar/array dual handling:

   ```js
   const SIGNAL_VERBS = {
     submit: ["edit"],
     progress: ["edit"],
     not_required: ["edit"],
     resolve_error: ["error"],
     approve: ["review"],
     request_changes: ["view", "edit", "review"], // ← the change; everything else is a one-element array
   };
   ```

2. **The access gate passes when any listed verb's gate allows.** The per-verb check itself (`gateAllows`) is unchanged — `true` passes anyone, array gate requires role intersection, absent verb fails closed. The gate loop becomes: `verbs.some((verb) => gateAllows(actionConfig.access?.[currentApp]?.[verb], userRoles))`. The `access_denied` error message lists all accepted verbs (e.g. `requires one of the "view"/"edit"/"review" verbs on access.{app}`), so a denial names the full set the caller failed.

3. **The server-resolved button policy uses the same map.** Part 46 consolidated client-side verb gating into [`resolveActionAccess.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js), whose `resolveButtons` carried a "faithfully copied" scalar duplicate of `SIGNAL_VERBS`. The duplicate is deleted; `resolveActionAccess.js` imports the (now-exported) array-valued `SIGNAL_VERBS` from `loadWorkflowState.js` and resolves button visibility with the same any-verb rule: `verbs.some((verb) => allowed[verb])`. One map, two consumers — the engine gate and the button policy can no longer drift.

4. **No template changes.** `view.yaml.njk`'s `button_request_changes` renders from the author opt-in (`page_config.buttons.request_changes.visible`, default `false`) AND the server-resolved `_state.action.buttons.request_changes` — which now reflects the broadened verb set by construction. `review.yaml.njk` and the review page are unchanged — the review page itself still renders only for callers passing the `review` verb, and its `request_changes` button stays engine-passable (the `review` arm).

5. **No change to the FSM tables, `BUTTON_SIGNAL_SOURCES`, or `makeWorkflowApis`.** They resolve transitions and source stages, not verbs; the signal→verb mapping lives only in the single exported `SIGNAL_VERBS`.

6. **Concept-doc sweep** (the docs are the source of truth and currently disagree with each other; after this part they agree on the new rule):
   - [action-authoring/design.md](../../../../workflows-module-concept/action-authoring/design.md) Decision 3 "Interaction → required verb" table: `request_changes` row becomes `view` / `edit` / `review` (any), with a one-line note of the semantic ruling (`review` = judgement power; `request_changes` = flag-a-problem). `approve` stays `review`.
   - [state-machine/design.md](../../../../workflows-module-concept/state-machine/design.md) "Templates and buttons" view row: rewrite the justification. The current text argues `action_allowed.view`-gating as a workaround ("gating on `action_allowed.review` would dead-end the no-review-verb case"); under the ruling viewer access is simply sufficient by design. Drop the workaround framing.
   - [submit-pipeline/design.md](../../../../workflows-module-concept/submit-pipeline/design.md) Decision 3's view-row note and Open Question 1's first bullet ("`request_changes` on the `view` template — should default to reviewer-gated, state-machine review-1 finding 7"): resolved the **other** way — viewer-fireable by design; record the resolution and close the bullet.
   - The matching `spec.md` lines in the three sub-designs, where they restate the verb table or the view-bar gating.

## Problem (as verified in the shipped code)

- Engine: [`loadWorkflowState.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js) `SIGNAL_VERBS` maps `request_changes → 'review'`; the gate fails closed when the verb is absent from `access.{app}`.
- Button policy: [`resolveActionAccess.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js) (Part 46) carries a scalar duplicate of the same map; `resolveButtons` sets `buttons.request_changes` only when the caller passes the `review` verb.
- Template: [`view.yaml.njk`](../../../../../modules/workflows/templates/view.yaml.njk) `button_request_changes` renders when the author opts in (`page_config.buttons.request_changes.visible`, default `false`) AND the server-resolved `_state.action.buttons.request_changes` is true.
- Composed: on an action with no `review` verb declared in any app block — the case the view-bar button exists for — the button never renders for any user, and a direct API fire is rejected for every caller. The view-bar affordance is dead in exactly the scenario its design rationale cites. Blast radius today is zero only because the button is opt-in default-hidden; it breaks the day an author enables it.

## Accepted consequences

Consistent with the design's standing posture (buttons are UI affordance; the verb gate + FSM are the real rules — ui Decision 7):

- **Any viewer or editor can fire `request_changes` via the API** against an action in a source state the FSM accepts (`in-review`, `done` for form/check kinds), regardless of whether the author opted the button onto any page. A viewer knocking an `in-review` action back to `changes-required` is now legal by design. Every fire carries the mandatory comment convention and logs an event — auditable.
- `buttons.request_changes` is now true for any view/edit/review-passing caller on every surface that consumes the server-resolved buttons map; pages still choose whether to render the affordance (the view-bar button stays author-opt-in).
- The review page's _access_ remains `review`-gated; only the `request_changes` _signal_ broadens. `approve` is unchanged.

## Tests

- [`loadWorkflowState.test.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.test.js) currently pins the old mapping at the `test.each(['approve', 'request_changes'])('signal %s requires the review verb')` block (~line 225). Split it:
  - `approve` keeps the existing requires-`review` assertions verbatim.
  - `request_changes` gains: passes with a view-only gate match; passes with an edit-only gate match and with a review-only gate match (both without `view` declared — the lint-warned edge); rejected with `access_denied` when the caller matches none of the three.
- [`resolveActionAccess.test.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.test.js): `resolveButtons` shows `request_changes` for a view-only, an edit-only, and a review-only `allowed` bag (source stage permitting); the test pinning `request_changes: false` for a view+edit-but-not-review caller at `done` flips to true.
- All-signals coverage of the array shape: every `SIGNAL_VERBS` entry resolves through the same `.some(...)` path (no scalar special case left behind).
- The three-runtime gate oracle (`gates.fixtures.js`) is **unchanged** — gate semantics don't move, only the signal→verb resolution above them.

## Out of scope

- Any FSM/table change — `request_changes`' source states and target are untouched.
- Any change to `approve`, `resolve_error`, or the edit-verb signals.
- Per-page or per-source-state verb resolution (e.g. "from `in-review` require `review`, from `done` require `view`") — considered and rejected in review as needless complexity; the flat OR expresses the ruling exactly.
- The query-time `visible_verbs` projection — it exposes verb booleans, not signal permissions; pages keep choosing which bool gates which affordance.
