# Review 4 — Task files vs. the shipped tree (focus: tasks)

Reviewed the eight task files under `tasks/` against the current design (post review-1/-2/-3
resolutions), the four shipped templates, the rebuilt role-check component
(`modules/workflows/components/action_role_check.yaml`), the shipped FSM table
(`plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js` — it already exists on
this branch, so Part 38's contract is verifiable now, not hypothetical), the plugin and module
`package.json`s, the root Jest config, and the demo's authored `workflow_config`.

Re-confirmed sound, no further action:

- Tasks 2–4's template line references, payload inventories, both-copies (inline + modal)
  enumerations, and `Validate`-regex narrowings all match the shipped templates exactly
  (`edit.yaml.njk:233–261/353–381` submit, `:310–327/:410–427` not_required;
  `review.yaml.njk:285–315/:399–429` approve, `:327–354` request_changes;
  `error.yaml.njk:266–296/:325–355` resolve_error, prime at `:87–102`).
- Task 5's `button_edit` / `request_changes_modal` samples mirror `review.yaml.njk:195–224` /
  `:317–373` faithfully (skip flag, `urlQuery`, mandatory-comment `Validate`, `onClose` reset);
  `view` primes `form` (`view.yaml.njk:86–90`), so the modal payload's `form` is live.
- The `./fsm` export path is right for the plugin build: `--strip-leading-paths` maps
  `src/connections/shared/fsm/tables.js` → `dist/connections/shared/fsm/tables.js`
  (`plugins/modules-mongodb-plugins/package.json:26`), and the root Jest
  `transformIgnorePatterns` already transforms `@lowdefy` ESM dists.
- The demo's only `submit_edit` usages are **hook keys** (`workflow_config/onboarding/qualify.yaml:30`,
  `send-quote.yaml:28`), owned by Part 38's re-key (38 design.md:719) — task 2's
  `buttons.submit_edit → buttons.submit` namespace rename breaks no authored demo config.

## Correctness

### 1. Every task's role-gate clause is wrong — `action_allowed` is a per-verb map, so `_eq: [{ _state: action_allowed }, true]` hides every button forever

> **Resolved.** Every role-gate clause now tests the verb-specific key: `action_allowed.edit` (task 2, both samples), `.review` (task 3), `.error` (task 4), `.view` (task 5 — D4's "all action-access users" intent; review-gating would dead-end the no-`review`-verb case since the gate returns `false` for absent verbs). Tasks 2–5 ACs assert the verb key and each carries a "per-verb map, never compare the whole object" note. design.md updated throughout: D2/D3 samples, D3 prose (per-verb gate, no coarse boolean exists), D4's gating prose, and the stale "verb-scoped gating … is not built" claim replaced with the real rationale (the primitive is per-verb; review-gating is wrong, not unbuildable). Per user follow-up, the rules are also documented for app authors: design Files changed gains a `modules/workflows/README.md` row and task 8 gains a §4 specifying the three-part visibility rule (restrict-only author opt-out + opt-in defaults, FSM source-stage, per-verb `action_allowed.{verb}`) and the new `view` bar.

The shipped role check (`action_role_check.yaml:39–44`, header: "Part 34 D8 / Part 38 task 8")
writes `_state.action_allowed` as a **map of per-verb booleans** — `{ view, edit, review,
error }` — and the shipped templates read the verb key: `edit.yaml.njk:207/270`
(`action_allowed.edit`), `review.yaml.njk:233/259` (`action_allowed.review`),
`error.yaml.njk:237` (`action_allowed.error`).

Tasks 2 (lines 54, 93), 3 (line 37), 4 (line 40), and 5 (line 72) all spec the third `visible`
clause as `_eq: [{ _state: action_allowed }, true]` — an object compared to `true`, which is
always `false`. Implemented literally, **every signal button on all four templates is
permanently hidden**. (The design carries the same bug — D3's sample at design.md:156 and the
"coarse role gate (`action_allowed`)" prose — review-1 #6's "single coarse `action_allowed`"
description was true when written but the component has since been rebuilt per-verb.)

**Fix:** Use the verb-specific key per template: `action_allowed.edit` (task 2),
`action_allowed.review` (task 3), `action_allowed.error` (task 4) — i.e. preserve what the
shipped buttons already test. For `view`'s `request_changes` (task 5) the design must **name a
verb** since no coarse value exists: `action_allowed.view` is the one that matches D4's intent
("shows to all action-access users"). Note `action_allowed.review` would be wrong there — the
gate returns `false` when the verb is absent from `access` (`action_role_check.yaml:34–38`), so
review-gating would permanently hide the button in exactly the no-`review`-verb configuration
that justifies it. Relatedly, D4's claim that "the verb-scoped gating it would require is not
built" is now stale — the primitive *is* per-verb; the right rationale is that review-gating
dead-ends the no-review-verb case, not that the capability is missing. Update D3's sample, D4's
prose, and all four task files.

### 2. The guard test as specified fails against the shipped FSM table — the `none` row defines `request_changes`

> **Resolved (auto).** Task 6's derivation now excludes the `none` sentinel row (`s !== 'none' && signal in FSM_TABLES.form[s]`) with the sentinel rule cited and the concrete `request_changes` failure explained; design.md D3's "single source of truth + guard" paragraph now reads "stored statuses … excluding the table's `none` row".

Task 6 (line 31, and Notes line 54) derives each signal's sources as "the set of stages where
`formTable[stage][signal]` is defined" (`Object.keys(formTable).filter(...)`) and asserts set
equality with the enum. But the shipped table's **`none` row** — the transient creation-time
sentinel, "never a stored status" (`tables.js:14–16`) — defines `request_changes`
(`tables.js:40`). Derived sources for `request_changes` are therefore
`[none, in-review, done]` ≠ the enum's `[in-review, done]`, and the test as written **fails
against the very enum and table it's meant to certify**. (`request_changes` is the only one of
the six button signals appearing in `none`, so it's one failing assertion, not six.)

**Fix:** Spec the derivation to exclude `none` (e.g. filter to the eight stored statuses, or
`Object.keys(formTable).filter((s) => s !== 'none' && signal in formTable[s])`), with a comment
citing the sentinel rule. Mirror the same wording in design.md D3's "single source of truth +
guard" paragraph, which has the same unqualified "stages where `table[stage][signal]` is
defined" claim.

### 3. The guard test's two imports don't resolve — no plugin dependency, no YAML parser, anywhere

> **Resolved (auto).** Task 6's Files list now adds `modules/workflows/package.json` with `devDependencies: { "@lowdefy/modules-mongodb-plugins": "workspace:*", "js-yaml": "^4" }` (noting the plugin's `prepare: pnpm build` satisfies the dist requirement); the export shape (`FSM_TABLES` named + default, `hasReview`, no named `form` — test reads `FSM_TABLES.form`) is spelled out; the false "matching how the module already consumes other plugin exports" sentence is gone.

Task 6's Notes (line 53) claim the test imports the plugin "matching how the module already
consumes other plugin exports." That's not how the module consumes the plugin:
`modules/workflows/package.json` declares **no dependencies at all** (name/version/license/private
only), no module test imports the plugin package (consumption is via the Lowdefy manifest
`plugins:` entry, which the Lowdefy build resolves — not node resolution), and **no YAML parser**
(`js-yaml`/`yaml`) exists in the root devDependencies or anywhere else in the repo's test
toolchain. Under pnpm's strict isolation, `import '@lowdefy/modules-mongodb-plugins/fsm'` and
the YAML parse both fail from `modules/workflows/`.

**Fix:** Add to task 6's Files list: `modules/workflows/package.json` — add
`devDependencies: { "@lowdefy/modules-mongodb-plugins": "workspace:*", "js-yaml": "^4" }` (the
plugin's `prepare: pnpm build` script produces `dist/` on workspace install, satisfying the
"plugin must be built" note). Two smaller adjacent fixes while editing: (a) the export shape —
`tables.js` exports `FSM_TABLES` (named + default) and `hasReview`; there is no named `form`
export, so the test reads `FSM_TABLES.form` — worth one line so the implementer doesn't guess;
(b) drop or rephrase the false "matching how the module already consumes other plugin exports"
sentence.

## Task/design divergences

### 4. Task 7 retains the vacuous e2e example the design already dropped

> **Resolved (auto).** Task 7's case (b) and its AC now require the `progress`-hidden / `submit`-visible pair on the `edit` page of a `done` action, with an explicit "do not use `approve`-not-on-`edit`" note explaining why that assertion is vacuous — aligned with design.md:242 (post review-3 #2).

Review-3 #2 established that "`approve` is not shown on the `edit` page" proves nothing —
`approve` is a `review.yaml.njk` button and is absent from `edit` by template construction, so
the assertion passes regardless of the visibility mechanism. The design was fixed accordingly
(design.md:242 now reads case (b) as `progress` hidden on `done` while `submit` stays visible).
But task 7 still leads with the dead example (line 17: "e.g. `approve` (source list
`[in-review]`) is **not** shown on the `edit` page") and — worse — its acceptance criterion
(line 26) blesses it as sufficient: "(b) confirms at least one button is correctly hidden by the
FSM source-stage gate (**e.g. `approve` not on `edit`**)." An implementer satisfying the AC
literally ships a test that exercises nothing.

**Fix:** Drop the `approve`-on-`edit` example from task 7's body and AC; keep the
`progress`-hidden-on-`done` / `submit`-visible pair as the required assertion.

### 5. `tasks.md`'s task-7 dependency row and rationale are stale

> **Resolved (auto).** tasks.md's task-7 Depends On row now reads "2, 5"; the rationale paragraph is rewritten (case (a) on `edit` via task 2; cases (b)/(c) through `view`'s Edit-nav button via task 5, with the review-page-allowlist reasoning); task 7's Files row points at the concrete `apps/demo/e2e/workflows/` home with the Jest-ignore note.

Three issues in the index file:

- **Depends On for task 7 reads "2"** — but e2e case (c) navigates `view → Edit`, which needs
  task 5's Edit-nav button (task 7's own Notes, line 36, say so). Case (b)'s `done`-stage
  assertion has the same dependency: the only UI path to the edit page of a `done` action is a
  `Link` carrying `input: { skip_status_redirect: true }` (the `review` page's Edit-link is
  unreachable — review's stale-URL allowlist `[in-review, error]` bounces `done` to view before
  its bar renders), so the spec must go through `view`'s Edit button too. Row should read
  **2, 5**.
- **The rationale (tasks.md line 28)** repeats the dropped example and an inaccurate framing:
  "all three e2e cases exercise the `edit` template (Save Draft, `approve` not shown on edit,
  `submit` from done)" — (b)'s example is the vacuous one (#4) and (b)/(c) start on the `view`
  template.
- Minor: task 7's Files row says "e.g. `apps/demo/**/*.spec.js`" — the suite has a concrete
  home, `apps/demo/e2e/workflows/` (the root Jest config ignores `/apps/demo/e2e/`, so
  Playwright specs must live there to stay out of Jest's `**/*.test.js`-adjacent matching).
  Point at it.

### 6. Task 1's "existing enums in this directory" note is factually wrong

> **Resolved (auto).** Task 1's note now lists only `action_groups.yaml` and `workflow_lifecycle_stages.yaml`, with a parenthetical locating `action_statuses.yaml` in the shared module (+ the components copy). Task 2's AC now names the deleted reference as `../shared/enums/action_statuses.yaml`.

Task 1 Notes (line 40): "The existing enums in this directory (`action_groups.yaml`,
`action_statuses.yaml`, `workflow_lifecycle_stages.yaml`) are the reference for file style."
`modules/workflows/enums/` contains only `action_groups.yaml` and
`workflow_lifecycle_stages.yaml`. `action_statuses.yaml` lives in the **shared module**
(`modules/shared/enums/action_statuses.yaml` — what `edit.yaml.njk:276` references as
`../shared/enums/action_statuses.yaml`), with a separate copy at
`modules/workflows/components/action_statuses.yaml`. Cosmetic, but an implementer told to open a
file that isn't there starts their task doubting the rest of the spec. Same precision nit in
task 2's AC (line 106): the reference being deleted is `../shared/enums/action_statuses.yaml`,
not `enums/action_statuses.yaml`.

### 7. Task 8's reconciliation sweep misses "four-verb" prose outside Decision 4 and two table-row consequences

> **Resolved (auto).** Task 8 now covers all four: D2 prose ~130 (four-verb → five, handler list gains `onProgress`), a new §2b for D3's floating-actions sentence ~219, D4's `onRequestChanges` row gaining `view`, and D2's standard-payload enumeration ~118 dropping `fields`. ACs extended to assert no stale "four" count or three-verb enumeration remains anywhere in `ui/design.md`.

Task 8 §2 scopes the four→five count update to `ui` Decision 4, but the count (and incomplete
handler lists) also appear at:

- `ui/design.md:130` (D2 prose) — "Decision 4 above lists the **four-verb** event vocabulary,"
  and the handler enumeration "(`onSubmit`, `onApprove`, `onRequestChanges`)" omits `onProgress`.
- `ui/design.md:219` (D3, floating-actions) — "wire them to the **four** page-event handlers
  (`onSubmit`, `onApprove`, `onRequestChanges`)" — same count, same incomplete list.

Two adjacent rows task 8 should also touch while in these tables:

- **D4's `onRequestChanges` row** ("Pages that use it: `review`") gains `view` — task 5 wires
  `page_config.events.onRequestChanges` into `view`'s modal (`tasks/05:107`).
- **`ui/design.md:118`** (D2, the standard-payload prose) still lists `fields` in "the standard
  payload (`form`, `form_review`, `fields`, `current_key`)" — Part 39 removes `fields` from
  every form-template payload, so this enumeration goes stale the moment tasks 2–5 land. Either
  add it to task 8's residual list or note it as deliberately deferred.

None of these are new decisions — they're the same D5/D4 deltas task 8 already transcribes,
applied to mentions the task's section-scoped instructions wouldn't reach.
