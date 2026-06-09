# Review 1

First review of the 2026-06-09 rewrite. The rewrite's core thesis — "the engine is already unit-tested, e2e owns only the build→wire→serve seam" — checks out against the codebase. I verified the unit-coverage claims (Phase 3 below), and they are accurate: `plugins/modules-mongodb-plugins/` does carry 37 `*.test.js` files; `fsm/tables.test.js` asserts the 9×11 form / 6×7 tracker tables exhaustively; `fsm/resolveSignal.test.js`, `planAutoUnblock.test.js`, `runTrackerCascade.test.js`, and the four `WorkflowAPI/*` integration tests exist and cover what the design says they cover; and the deferral targets `makeWorkflowsConfig.test.js` / `makeWorkflowApis.test.js` exist (under `modules/workflows/resolvers/`, not the plugin dir). The findings below are accuracy, feasibility, and scoping issues — none challenge the rewrite's premise.

## Accuracy

### 1. Stale `_next/22` links in the top-level design point at a moved file

This part was moved out of `parts/_next/` to `parts/22-workflows-e2e-suite/` (per git status: the `_next/.../22.../design.md` is deleted, the new path is untracked), but the top-level design still links the old location:

- `designs/workflows-module/design.md:57` — parts table: `[workflows-e2e-suite](parts/_next/22-workflows-e2e-suite/design.md)`
- `designs/workflows-module/design.md:138` — testing conventions: `coverage is Playwright e2e via [part 22](parts/_next/22-workflows-e2e-suite/design.md)`

Both are now broken. Part 22's own "Contract to neighbours" promises that "Every shipping part (5–20, 23, 38–40, 43) keeps its single Verification line pointing here" — if those Verification lines link via the `_next` path too, they're broken as well. Fix: update both `design.md` references to `parts/22-workflows-e2e-suite/design.md`, and grep the shipping parts' Verification sections for `_next/22` and repoint them.

### 2. "Shared action pages" is the wrong model for the form clusters — the resolver emits _per-action_ pages

The design names `makeActionPages` as a load-bearing resolver in "What only e2e can prove" #1, but then describes its output as the static "shared `workflow-action-edit` / `-view` / `-review` pages" (The test app, §"`workflow_config/`"). Those static pages (`modules/workflows/pages/workflow-action-{edit,view,review}.yaml`) serve **`kind: check`** actions only — addressed by `?action_id=`. `makeActionPages` itself short-circuits non-form actions (`makeActionPages.js:42` — `if (action.kind !== "form") return []`) and emits **one page per (form action, verb)** from `templates/{verb}.yaml.njk` with ids `${workflow.type}-${action.type}-${verb}` (`makeActionPages.js:56–60`, `VERBS = ["edit","view","review","error"]` at line 1).

So there are two distinct page surfaces, and the clusters split across them: `form-lifecycle` / `error-recovery` (kind: form) drive **resolver-emitted per-action template pages**; `check-blocked-by` (kind: check) drives the **static shared pages**. The Verification goal "each action page renders" and "every emitted surface is proven reachable" is specifically about the per-action template emission — which is the resolver's actual job and the thing only a built app exercises. As written, a reader would think the suite only checks three shared pages. Fix: in "The test app" and "What only e2e can prove" #1, distinguish (a) static shared check pages from (b) per-action form pages emitted from `templates/{verb}.yaml.njk`, and state that the form clusters assert the _emitted_ page id (`{type}-{action}-{verb}`) renders.

## Feasibility

### 3. Driving a CAS conflict through two concurrent HTTP submits is non-deterministic

"Salvaged from the old design" keeps a tail assertion: "concurrent submits → one wins, the other surfaces a retryable `concurrent_submit`, retry converges with exactly one status entry," and justifies it with "[part 38 D15] made it deterministic." That's a category error. D15's determinism is about the **CAS semantics** (`findOneAndUpdate` pinned on `updated.timestamp` misses → throws; see `38-engine-rebuild/design.md:60,246`) — it does _not_ make a race between two real HTTP requests deterministic. To observe `concurrent_submit`, both requests must **load before either commits**; over HTTP against a single Lowdefy server, the two requests can (and often will) serialize, so both succeed and the conflict never fires. There is no forcing seam in the plan, and adding a delay/interleave hook would violate Principle 2 ("no backdoors").

The design already concedes the deep coverage lives in `SubmitWorkflowAction.test.js` ("concurrent submit (CAS)" describe block, verified present). Recommendation: **drop the e2e CAS touch entirely** — it adds a flaky test for a path the unit layer owns exhaustively, and per Principle 4 the conflict is a "bug that could exist in plugin JS without the runtime," i.e. unit territory. If the intent is specifically "prove the retryable error _surfaces through the real endpoint_," reframe it as a single deterministic assertion (e.g. seed an action doc, fire one submit, then fire a second submit whose payload carries a stale `updated.timestamp` so the CAS filter is guaranteed to miss) rather than a true race.

## Scope

### 4. `field-gallery` is a surface census of field components — the thing Principle 3 forbids

Principle 3 states clusters are "legible stories, not a surface census or an edge-case matrix." `field-gallery` is defined as "**one field per component** in `modules/workflows/components/fields/`" — that directory holds ~27 field components (`alert`, `box`, `button_selector`, `checkbox_*`, `controlled_list`, `date_*`, `enum_selector`, `file_*`, `location`, `multiple_selector`, `radio_selector`, `tiptap_input`, `yes_no_selector`, …) — each across rendering + `required`/`minItems` validation + `form_data` persistence + read-only review/error variants, all in a single "UI-heavy" spec. That is exactly a surface census, and a very large single spec.

Two issues: (a) it contradicts Principle 3 head-on with no acknowledgement; (b) many field components are thin wrappers over built-in Lowdefy blocks, so "does it render" is closer to build-time config validity (owned by `makeActionsForm.test.js` / `makeActionFormConfigs.test.js`, both present) than an integration seam. Recommendation: either (i) explicitly name `field-gallery` as the one deliberate, justified census and reconcile it with Principle 3, **and** split it from one spec into a small set (it will be the slowest and flakiest spec otherwise); or (ii) trim it to a representative field per _family_ (one text input, one selector, one date, one file, one list, one rich-text) plus the validation/persistence behaviors that are the real integration risk, and let the per-field config-validity stay at the resolver unit layer.

## Minor

### 5. Resolve the test-app-name open question now

"Open questions (mechanical)" lists "Test-app name/location — `apps/workflows-test/` proposed; confirm against any repo naming convention." This is verifiable now, not at task time (CLAUDE.md: resolve verifiable questions in the design). The repo's only convention is `apps/{name}` with a single existing app (`apps/demo/`); there is no competing convention to confirm against. Resolve to `apps/workflows-test/` and delete the open question. (The other two open questions — `form-submit-buttons.spec.js` disposition and CI build pattern — are genuine task-time mechanics; leave them.)
