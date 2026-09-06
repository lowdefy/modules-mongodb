# Part 72 — Honour `universal_fields` on check actions

`universal_fields` (Part 24) declares which of the two action-level metadata fields — `assignees`, `due_date` — an action's UI shows. It has worked on `kind: form` since Part 24 and has **never** worked on `kind: check`: the key validates, is carried onto the runtime config blob, and is then silently ignored by both check surfaces, which always render both fields. This part closes that gap.

## The gap was never a decision

No design excluded check. Every design that touched the field assumed it would work there:

- **Part 24** (`_completed/24-universal-fields/design.md:255`) lists the check follow-on as _"pass `show: { _var: action_config.universal_fields }` … so the component can render presence."_
- **Part 56 task A4** (`_completed/56-three-tier-action-pages/tasks/A4-check-template-relayout.md:21`) instructs the check template to pass `show: action_config.universal_fields`.
- **Part 67** (`_completed/67-action-fields-header/design.md:74`) reasons about single-field check actions as a live case when gating the chip divider.

The instruction in A4 could not be carried out, because **Part 56 D3** had already made the check page per-workflow-TYPE (`_completed/56-three-tier-action-pages/design.md:18`): one `{workflow_type}-action` page serves every check action in the workflow, routed by `?action_id`. There is no per-action build scope on that page, so `action_config` is not available. The implementer hit this and recorded it as a code comment in `templates/action.yaml.njk` — the only place the exclusion has ever been written down, and it states a constraint, not a rationale.

Part 24's own follow-on was already unbuildable when written: its targets were `check-action-surface.yaml` (a component dropped by host entity pages) and the retired per-verb `workflow-action-*` pages. Neither had `action_config` either. The gap predates Part 56; Part 56 inherited it.

Net effect before this part: `universal_fields: [due_date]` on a check action passes validation and does nothing. That is worse than either working or erroring.

## Why this cannot be resolved at build time

Two surfaces render check universal fields, and neither can know which action it is showing at build time:

| Surface                                                           | Emission                                                                                                                            | Build-time action identity                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `templates/action.yaml.njk`                                       | one page per workflow **type** (Part 56 D3)                                                                                         | none — serves N check actions, which may declare different lists                 |
| `components/check-action-surface.yaml` (via `check-action-modal`) | module **component** dropped by host entity pages (`modules/deals/pages/view.yaml:580`, `apps/demo/modules/companies/vars.yaml:97`) | none at all — learns the action only when something opens it with an `action_id` |

Form actions get per-action pages, which is the only reason `makeActionPages` can bake the list into `action_config`.

Note the precise claim: neither surface knows **which action** it is showing at build time. Neither is cut off from build-time config in general — `components/validated_workflows_config.yaml` shows a static component file can call a resolver via `_ref: { resolver: ... }`, so either surface _could_ bake a map of every action's declaration and select from it at runtime.

**Rejected: bake a `{workflow_type: {action_type: [fields]}}` map into both surfaces and select from it at runtime.** This is viable — the resolver `_ref` above makes it reachable even from the host-dropped modal — but it buys less than it appears to:

- **It does not avoid the runtime gate.** One shared surface still serves N actions, so the components must still gate with `visible` rather than `_build.if`. That conversion is the bulk of the change either way.
- **It does not avoid a second normalizer.** `makeWorkflowsConfig` carries the authored value **raw** — `ACTION_FIELDS` picks it (`:33`), `validateUniversalFields` only validates, and nothing in that file normalizes. So `undefined`/`false` still need resolving on the read side. The lock-step duplication below is relocated, not removed.
- **It does not save server work.** `GetWorkflowAction` already resolves `actionConfig` on every call (`:161`), and both check surfaces call it before rendering. The envelope key rides a request that is already happening.
- **It costs a nested lookup** (`workflow_type` → `type`) in place of a flat state read, ships a config projection into every host page that drops the check modal, and creates a second source for a fact the server resolves anyway — with the two able to disagree if page and server were built from different config.

Net: it saves one small helper file and one envelope line, and pays for it in duplication. The envelope wins on "one correct way".

**Rejected: emit per-check-action pages.** This would make `action_config` available the same way form pages get it, but it reverses Part 56 D3, changes page IDs and deep-link URLs, and requires reworking `computeEngineLinks`. Far too much to buy one presence flag.

## Proposed change

1. **`GetWorkflowAction` returns `universal_fields`** on the envelope — a concrete array, resolved from `actionConfig` per read by a new `shared/render/resolveUniversalFields.js`. `undefined` → both, `false` → `[]`, array → verbatim.

2. **Both check surfaces pass `show` from the loaded action** — `_state: current_action.universal_fields`, into the chips and the edit modal. No state plumbing is needed: both surfaces already spread the whole envelope (`current_action: { _request: get_workflow_action }`), so the key lands in state automatically.

3. **The universal-fields components gate at runtime, not build time.** `universal-fields-chips.yaml` and `universal-fields.yaml` replace their `_build.if` / `_build.array.includes` gates with `visible` + `_array.includes`. A `_build.if` gate _deletes_ a block, which cannot express "depends on which action loaded".

4. **One gating mechanism for both kinds.** The `show` var accepts either a build-time literal array (form pages, unchanged) or a runtime operator (check). A literal costs nothing to re-test at runtime, so both callers share one code path rather than the component carrying two parallel presence mechanisms.

5. **`null` (not yet loaded) resolves to hidden**, via `_if_none: [show, []]`. The title bar paints before the request resolves, so the alternative — treating null as "both" — would render a field and then make it vanish. Late arrival beats pop-then-disappear.

6. **The chips ROOT is gated on a non-empty list, not just the two fields.** The ✎ edit button is deliberately ungated so a field can be _added_ while both show their empty states — correct when the author declared at least one field, wrong when they declared none. Without a root gate, `universal_fields: false` on a check action renders a lone ✎ opening a modal whose body is entirely hidden. Form pages never hit this because their templates omit the whole `_ref` at build time when the list is empty; the shared check surfaces have no such outer gate, so the component must be self-sufficient. Gating the root makes the form templates' outer gate belt-and-braces rather than load-bearing.

## Nothing is persisted

`universal_fields` stays author config on `actionConfig`, resolved per read — the same category as Part 64's `description`, and for the same reason: a value materialised onto the action doc at create time goes stale the moment the declaration changes, and owes a migration to repair. Resolved per read, an author's edit applies to in-flight actions immediately. There is nothing to store.

The envelope is a projection over (action doc + `actionConfig` + parent workflow doc), and already carries several config-sourced keys on exactly this basis: `description` (`:256-269`), `required_after_close` (`:307`), `buttons` (`:164-170`).

## Presence, not permission

This part does **not** add server-side enforcement, and `universal_fields` remains a UI presence declaration (as `makeWorkflowsConfig.js:552` has always described it). `{workflow_type}-update-fields` still accepts both keys from a caller holding the `edit` verb. Hiding a field is not a security boundary; `access:` is.

Two consequences worth stating:

- **A hidden field is never written or cleared.** A hidden input is state-pruned, so the key drops out of the Update payload, and `planFieldsUpdate` treats an absent key as "leave unchanged" (`planFieldsUpdate.js:6-12,59-64`). Narrowing the list on an action that already has assignees stops showing them; it does not wipe them.
- **Adding enforcement would be a behaviour change, not a fix.** Rejecting an undeclared key server-side would break the cascade/auxiliary seeding paths that write fields of any kind on the create path (`planActionTransition.js:162`). Out of scope, and not obviously wanted.

## Two normalizers, kept in lock-step

`resolveUniversalFields` (plugin, read time) and `normalizeUniversalFields` (`makeActionPages.js:36`, build time) implement the same three branches. They cannot share code — different packages — so both carry a lock-step comment naming the other, and each has unit coverage of all three branches. If they diverged, a form page and a check page would disagree about the same action.

This duplication is the price of the split emission model (per-action form pages, shared check surfaces). Collapsing it would mean either emitting per-check-action pages (rejected above) or dropping the build-time path and gating everything off the envelope — which would make form pages depend on a request for something they already know statically.

## Files changed

- `plugins/…/shared/render/resolveUniversalFields.js` — **new**; normalizer + the reasoning for read-time resolution. Unit test alongside.
- `plugins/…/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — import, resolve, add `universal_fields` to the curated envelope allowlist and the docstring shape.
- `modules/workflows/components/universal-fields/universal-fields-chips.yaml` — three `_build.if` gates (assignees / divider / due) → runtime `visible`; `show` var doc rewritten.
- `modules/workflows/components/universal-fields/universal-fields.yaml` — top-level empty-list gate + two field gates → runtime. The assignees `_ref` gains a gated `Box` wrapper, because the cross-module `user-multi-selector` exposes no `visible` var and widening a shared API for one caller is worse than a local wrapper. Side benefit: while hidden the selector never mounts, so its user-fetch request never fires.
- `modules/workflows/templates/action.yaml.njk` — pass `show` to chips + modal; replace the stale "not available … default to both fields" header note.
- `modules/workflows/components/check-action-surface.yaml` — pass `show` to chips + modal.
- `apps/demo/modules/workflows/workflow_config/company-setup/{assign-account-manager,kickoff-call}.yaml` — demo consumers (below).
- `docs/workflows/reference/authoring-grammar.md` — **new** `universal_fields` section; the field was entirely undocumented. Plus `concepts/action-kinds.md`, `concepts/action-pages.md`.

## Demo consumer

`universal_fields` had **no** caller anywhere in `apps/demo` before this part — on any kind. It shipped in Part 24 without the demo consumer CLAUDE.md requires, which is part of why the check gap went unnoticed for so long.

The two check actions in `company-setup` now declare **opposite** lists:

- `assign-account-manager` → `[assignees]` — picking the person is the work; no deadline to track.
- `kickoff-call` → `[due_date]` — the account manager assigned by the blocking action owns it, so a second assignees field would duplicate that.

Both are served by the one `company-setup-action` page, so this exercises exactly what was broken: per-action presence on a shared surface. A form action still resolving its list at build time is covered by the existing pages.

`onboarding/handover` declares `universal_fields: false` — a pure confirmation gate with no owner and no deadline. This keeps the empty-list path (point 6) under permanent build coverage; it is the case that had the lone-✎ bug.

## Backward compatibility

Form actions declaring `universal_fields: false` are unaffected. Verified by building with the probe applied and inspecting the artifacts:

| Case                | Artifact                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| form, `false`       | `sales-pipeline-qualify-edit.json` — **0** chips blocks, **0** modal blocks (outer `_build.if` omits the refs, as before) |
| form, `[assignees]` | chips root `visible: true` — the runtime gate constant-folds; no `_state` read, no runtime cost                           |
| check, `false`      | chips root carries the runtime `_gt(_array.length(...), 0)` gate → whole strip hidden                                     |

The form path never even emits the changed components when the list is empty, so this part cannot regress it. Note the constant-folding result: the "form pages build blocks then hide them" cost that argued for a two-mechanism hybrid does not exist — Lowdefy resolves the gate to a literal when `show` is a build-time array.

## Verification

- `pnpm ldf:b` — config compiles; inspect `.lowdefy/server/build/pages/company-setup-action.json` for the two `visible` gates reading `current_action.universal_fields`.
- `resolveUniversalFields.test.js` — three branches, order preservation, no shared mutable default.
- `GetWorkflowAction.test.js` — envelope carries the default, a partial list, and `[]`; config wins over a bogus value on the doc; missing config entry defaults to both.
- Manual (needs a live app): open the two `company-setup` check actions in turn on the shared page and confirm the chip strip differs per action, and that the ✎ modal offers only the declared input.
