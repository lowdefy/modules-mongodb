# Task 6: Add the plugin `./fsm` export and the enum/FSM guard test

## Context

Task 1 shipped `modules/workflows/enums/button_signal_sources.yaml` — a hand-maintained map duplicating information the engine's `form` FSM table already encodes (a signal's source-stages are the stages where `formTable[stage][signal]` is defined). To prevent silent drift, a guard test asserts the enum matches the table's derivable sources.

Part 38 creates `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js`, which exports the FSM tables (`form`, `tracker`, and `simple` aliased to `form`). **This file is a prerequisite — confirm it exists before writing the test.** Part 38's design only exports the tables at the module level; the package `exports` map (currently `./actions`, `./blocks`, `./connections`, `./metas`, `./types`, plus a `./*` catch-all) has **no** dedicated entry for them. This task adds one so the guard test imports a stable public export rather than a deep dist path.

The guard lives in the **module's** test suite (not the plugin's), following the natural dependency direction: the module already depends on the plugin (`@lowdefy/modules-mongodb-plugins`, manifest `plugins:`), so importing a plugin export is normal; a plugin test reading a sibling module's source would be reverse coupling.

The module's existing test reference is `modules/workflows/resolvers/makeActionPages.test.js` (Jest, per the repo's testing conventions). Test style: pure functions, table-driven where enumerable.

## Task

### 1. Add the `./fsm` export to the plugin package

In `plugins/modules-mongodb-plugins/package.json`, add to the `exports` map:

```json
"./fsm": "./dist/connections/shared/fsm/tables.js"
```

(Place it alongside the other named exports — `./actions`, `./blocks`, etc.)

### 2. Write the guard test in the module

Add a test (alongside `modules/workflows/resolvers/makeActionPages.test.js` — e.g. `modules/workflows/enums/button_signal_sources.test.js` or a clearly-named file in the resolvers test dir) that:

- Reads and parses the local `enums/button_signal_sources.yaml` (YAML parse to a JS object).
- `import`s the `form` FSM table from the plugin's public export: `@lowdefy/modules-mongodb-plugins/fsm`.
- For **each** of the six button-surfaced signals (`submit`, `progress`, `not_required`, `approve`, `request_changes`, `resolve_error`), computes the derivable source-stages from the table — the set of stages where `formTable[stage][signal]` is defined — and asserts it equals (as a set, order-independent) the enum's stage list for that signal.
- Asserts the enum contains **exactly** these six signals (no extra keys, no missing keys) — in particular that the pre-hook-only `error` signal is **not** present.

The test fails the build if either side drifts.

## Acceptance Criteria

- `plugins/modules-mongodb-plugins/package.json` has a `"./fsm": "./dist/connections/shared/fsm/tables.js"` entry in `exports`.
- The guard test imports the `form` table via `@lowdefy/modules-mongodb-plugins/fsm` (not a deep dist/file path).
- The test asserts, per signal, that the enum's stage list equals the FSM table's derivable source-stages (set equality).
- The test asserts the enum's key set is exactly the six button-surfaced signals.
- The test passes against the shipped enum (task 1) and the Part 38 `form` table.
- `pnpm test` (or the repo's Jest command) runs the new test green.

## Files

- `plugins/modules-mongodb-plugins/package.json` — modify — add the `./fsm` export entry.
- `modules/workflows/enums/button_signal_sources.test.js` (or equivalent path alongside `resolvers/makeActionPages.test.js`) — create — the enum/FSM guard test.

## Notes

- **Prerequisite:** `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js` must exist (created by Part 38). If it does not yet, this part sequences with/after Part 38 — do not stub it here; coordinate so the table is the real Part 38 export.
- The plugin must be built (`dist/`) for the `./fsm` subpath to resolve at test time, matching how the module already consumes other plugin exports.
- Derive sources from the table programmatically (`Object.keys(formTable).filter(stage => signal in formTable[stage])`), don't hardcode them in the test — hardcoding would just duplicate the enum and defeat the guard.
