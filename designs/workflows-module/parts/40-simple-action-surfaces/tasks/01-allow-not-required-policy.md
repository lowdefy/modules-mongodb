# Task 1: `allow_not_required` policy — config validation, engine persist + enforce, form-template alignment

## Context

Part 40 (D3) replaces an earlier (dead) per-action button-config model with a **single** authored policy flag: `allow_not_required`. It is authored at the action root (any kind), defaults to absent = `false` (opt-in), and gates the `not_required` button client-side and the `not_required` signal server-side. This task implements every layer of that flag **except** the client read on the new surface (that lands with the surface component, Task 3 — it reads `surface.action.allow_not_required` straight from the doc).

Four layers, one cohesive feature — they must agree on the key name and shape:

1. **Authored + validated** — `makeWorkflowsConfig` validates the boolean and carries it into the runtime config.
2. **Persisted (display only)** — the engine stamps it onto the action doc on every transition (refreshed from config, never copied forward).
3. **Enforced (server)** — the load phase rejects a `not_required` signal off **live config** when the flag is unset, for **every kind**.
4. **Form alignment** — `edit.yaml.njk`'s `not_required` button reads the baked `action_config.allow_not_required` as its capability term, and its `page_config` opt-out reverts to default `true`.

### Relevant current state

- **`modules/workflows/resolvers/makeWorkflowsConfig.js`** — `ACTION_FIELDS` (lines 7–18) is the allowlist of action keys carried into the runtime config via `pick(...)`. `validateAction` (line 346) dispatches per-action validators (`validateActionAccess`, `validateStatusMapCells`, etc.). The load-phase gate reads `actionConfig.*` off this validated config, so any field the engine reads at load time **must** be in `ACTION_FIELDS`.
- **`plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js`** — the per-transition denormalisation block (lines 175–191) stamps `doc.access`, `doc.workflow_type`, `doc.tracker` onto the action doc from `actionConfig` on every plan (insert and update). This is "refresh from config, never copy forward".
- **`plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js`** — the per-verb access gate (lines 159–177) maps `signal → verb` via `SIGNAL_VERBS` (lines 9–16; `not_required → edit`), then `gateAllows(gate, userRoles)` throws `access_denied` when the user lacks the verb. This is the user-driven submit load phase; engine-driven cascades do **not** pass through here.
- **`modules/workflows/templates/edit.yaml.njk`** — the `not_required` button (lines 308–322) currently `_and`s three terms: `page_config.buttons.not_required.visible` (default **`false`** — today's opt-in), the FSM source-stage check (`_ref enums/button_signal_sources.yaml key: not_required`), and `_state: action_allowed.edit`.

## Task

### 1. `makeWorkflowsConfig.js` — validate + carry through

- Add `'allow_not_required'` to the `ACTION_FIELDS` array so the validated runtime config carries it (the load-phase gate reads `actionConfig.allow_not_required` live).
- Add a `validateAllowNotRequired(workflow, action)` validator (call it from `validateAction`): if `allow_not_required` is present it must be a boolean; otherwise `fail(...)` with a message in the existing style (`action "${action.type}" allow_not_required must be a boolean (got: ...)`). Absent is legal (defaults to `false` downstream).

### 2. `planActionTransition.js` — stamp onto the doc

In the denormalisation block (after `doc.tracker = ...`, ~line 191), add:

```js
doc.allow_not_required = actionConfig.allow_not_required === true;
```

This refreshes from config on every transition (both insert and update paths flow through this block), coerces absent → `false`, and is never copied forward from the old doc. No migration: existing docs pick it up at their next transition; until then absent reads as `false` and the button stays hidden.

### 3. `loadWorkflowState.js` — enforce off live config

After the per-verb access gate (after line 177, before `return`), add a kind-agnostic gate that rejects a `not_required` signal when the flag is unset in **live config**:

```js
// `not_required` is a per-action policy gate beyond the verb check (Part 40 D3),
// kind-agnostic and read off live config. Engine-driven cascades never reach here.
if (signal === 'not_required' && actionConfig.allow_not_required !== true) {
  throw new WorkflowEngineError(
    `loadWorkflowState: not_required is not permitted for action type "${targetAction.type}" (allow_not_required is not set)`,
    { code: 'access_denied' },
  );
}
```

The doc copy (Task 2) is never authoritative — display may lag config, enforcement never does.

### 4. `edit.yaml.njk` — form alignment

In the `not_required` button `visible._and` (lines 310–322):
- Change the `page_config.buttons.not_required.visible` term `default` from `false` to **`true`** (plain opt-out — authors can still hide a button).
- Add a fourth term reading the baked capability flag: `_var: { key: action_config.allow_not_required, default: false }`. (`action_config` is baked by `makeActionPages.js` from the authored root flag — verify the baked `action_config` carries `allow_not_required`; if `makeActionPages` whitelists fields, add it there too.)

The opt-in now lives in the root flag; the `page_config` term is a plain opt-out — no double opt-in.

## Acceptance Criteria

- `makeWorkflowsConfig` rejects a non-boolean `allow_not_required` and accepts a boolean / absence; the field appears on the resolved config when authored.
- A planned transition stamps `allow_not_required` onto the action doc: `true` when config sets it, `false` when absent — set and absent cases both covered, never copied forward from the prior doc.
- The load phase throws `access_denied` for a user-driven `not_required` signal when `actionConfig.allow_not_required !== true`, for **both form and check kinds**, and passes it through when the flag is set. Other signals (e.g. `submit`) are unaffected.
- `edit.yaml.njk`'s `not_required` button shows only when the baked `action_config.allow_not_required` is true (and its FSM/role terms pass); the `page_config` opt-out defaults to `true`.
- Engine unit tests cover the stamp (set/absent/not-copied-forward) and the gate (reject unset, pass set, pass non-`not_required`, both kinds). `makeWorkflowsConfig` test covers the boolean validation.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add to `ACTION_FIELDS`; add `validateAllowNotRequired` + wire into `validateAction`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — boolean validation cases (find the existing test file; create if absent).
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — stamp `doc.allow_not_required` in the denormalisation block.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js` — modify — add the `not_required` policy gate after the per-verb access gate.
- `plugins/.../connections/shared/phases/**/*.test.js` — modify — engine unit tests for the stamp and the gate (locate the existing planner/load-phase test files).
- `modules/workflows/templates/edit.yaml.njk` — modify — `not_required` button: opt-out default `true` + baked `action_config.allow_not_required` capability term.
- `modules/workflows/components/.../makeActionPages.js` (verify) — ensure the baked `action_config` carries `allow_not_required`.

## Notes

- This is the only task that touches the engine connection and the form template; the check surface (Task 3) only **reads** the resulting doc field `surface.action.allow_not_required` — no engine dependency in that direction.
- `not-required` is the FSM stage slug (hyphen); `not_required` is the signal / flag (underscore). Keep them distinct.
- "User-driven" vs "engine-driven": `loadWorkflowState` is the user submit entry; cascade transitions resolved inside pre-hooks do not pass through it, so the gate naturally only sees user-driven signals — no extra flag needed.
