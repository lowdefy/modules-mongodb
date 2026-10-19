# Review 2

Review 1's findings are all resolved and folded into the current design (scope expanded to form + check, `parseNunjucks` named as the primitive, the fourth "event description" row added, the autoescape note added, every `fields.description` seed enumerated). These are new findings against the current text, verified against source.

## Correctness / precision

### 1. The form binding the design tells the implementer _not_ to use is exactly the one they must use

> **Resolved (auto).** Disambiguated the overloaded `action.description` in design.md. Point 6 and the form-templates Files-changed note now state plainly that on form pages the envelope is stored in state as `action`, so the render binding is literally `_state: action.description` — unchanged; only GetWorkflowAction's _source_ for that envelope key flips (doc field → rendered `actionConfig.description`). "The deleted `action.description`" is reserved for the action-doc field. (Task 07 already distinguished the two uses correctly — note line 43, AC line 27 — so only the design prose needed tightening.)

The form-templates entry (design.md:108) says to source the render "from the `get_workflow_action` envelope's rendered `description` **(not the deleted `action.description`)**", and point 6 (design.md:12) says "no surface depends on the deleted `action.description`." But on the four form pages the `get_workflow_action` envelope is stored in state under the key **`action`** (`set_action` SetState — `edit.yaml.njk:119-123`: `action: { _request: get_workflow_action }`), so the correct binding for the new render _is_ literally `_state: action.description`.

The phrase "the deleted `action.description`" is overloaded: it means the deleted **action-doc field**, but it is textually identical to the form's **state path** `action.description`, which is the envelope key and is correct and unchanged. An implementer following design.md:108 literally would conclude they must avoid `_state: action.description` and invent a different binding.

Fix: state plainly that on form pages the binding path is **unchanged** — `_state: action.description` already reads the envelope, and only GetWorkflowAction's _source_ for that envelope key flips (from `action.description` doc field → rendered `actionConfig.description`). The callout swap on form is therefore `_ref` path + chrome only; the `content` var stays `_state: action.description`. Reserve "the deleted `action.description`" for the doc field and never use it to describe the form's `action` state namespace.

### 2. Read-time rendering 500s the detail page when an author's template has a syntax error — no build-time compile check

> **Rejected.** Neither the build-time compile-check nor the read-time guard is added — both are unnecessary complication for this part. A dedicated compile-check in `makeWorkflowsConfig` would be inconsistent with how the codebase already treats author templates: `status_map.message` compiles uncaught too and surfaces a malformed template at runtime (write time), not at build. Workflow authors are developers who hit a broken `description` template the first time they load the page in testing, and the module is unreleased. The read-time try/catch would only swallow render-time throws (a narrow class for v1's short scalar interpolation) and risks hiding real bugs by returning null. The planned "validate `description` is a string when present" stays as-is.

`description` renders at read time via `parseNunjucks(actionConfig.description, ctx)`, which calls `nunjucksFunction(fileContent)` (`parseNunjucks.js:8-10`). `nunjucksFunction` **compiles** the template; a syntax error (an unclosed `{{`, a bad filter) throws at compile time. So a malformed author template doesn't fail gracefully — it throws inside GetWorkflowAction on **every** load of that action's detail page, and there is no transition to surface it earlier.

The design's planned validation in `makeWorkflowsConfig` is only "validate `description` is a string when present" (design.md:96), which does **not** catch nunjucks syntax errors. I confirmed `makeWorkflowsConfig.js` compiles no template today — it has no `nunjucksFunction`/`parseNunjucks` import, and `validateStatusMapCells` (`:459`) validates cell _structure_, not template compilability. (`status_map.message` shares the uncompiled-template property, but it renders at _write_ time, so a bad template fails during a transition, not on page load.) Read-time rendering moves that failure onto every page load — a strictly worse blast radius.

Fix: compile-check the template once at config-build time where the string validation already lives — wrap `nunjucksFunction(actionConfig.description)` in a try/catch in `makeWorkflowsConfig`'s validation and `fail()` with a clear authoring message if it throws. (Belt-and-suspenders: also guard the read-time render so a slip-through returns the raw string or null rather than 500-ing the page.) This is the "resolve the open question, don't defer it" / "one correct way" move — catch authoring errors at build, not on the consumer's page load.

## Completeness

### 3. `universal-fields.yaml`'s `[assignees, due_date, description]` default is repeated ~7 times, not once

> **Resolved (auto).** design.md's `universal-fields.yaml` note now says to drop `description` from **every** inline `show` default (top-level `visible` length test + each `_build.array.includes` default, ~7 occurrences), not just the top-level gate. (Task 05 step 3 / AC already required all defaults shrink to two fields — only the design prose understated it.)

The design's note for `universal-fields.yaml` (design.md:103) says "remove the description edit input + display branch; default `show` → `[assignees, due_date]`" — singular. But `default: [assignees, due_date, description]` appears as an inline `_var` default in **every** `_build.array.includes`/length test in that file, not just the top `visible`: lines 51-52, 75-76, 95-96, 119-120, 196-197, 242-243, 283-284. After the description branches at 113-136 and 277-319 are deleted, the remaining assignees/due_date branches still carry `description` in their inline `default`. It's harmless at runtime (no description branch is left to trigger), but it leaves the file internally inconsistent with the two-field model and is a trap for the next reader.

Fix: the task should drop `description` from **all** the inline `default:` arrays in `universal-fields.yaml`, not only the top-level `visible` gate.

## Minor

### 4. The contract doesn't say which action _kinds_ render `description`

> **Resolved.** Added a "Which kinds render it" bullet to the contract section: `description` is authored on any kind, rendered on **form + check**, and accepted-but-unrendered on `custom` / `tracker` — with no validation rejecting it there (per "don't over-restrict"). The spec-amendments bullet now carries the same one-line per-kind rule so the authoring spec states it too.

The contract section (design.md:31-56) defines storage, templating, and read path, but doesn't state which kinds actually render the field. That lives only in Non-goals (design.md:126: custom owns its page, tracker has no working surface → neither renders it). The contract example is `kind: check`, so an author could reasonably author `description` on a `kind: custom` action and be surprised it renders nothing.

Per "don't over-restrict," accepting-but-not-rendering it on custom/tracker is the right call (the field is defined once; surfaces choose to render) — but the contract and the spec amendment (design.md:113-117) should say so in one line: `description` is authored on any kind, rendered on **form + check** surfaces, and accepted-but-unrendered on custom/tracker. Don't add a validation that rejects it on those kinds.

## Verified — no issue

- `parseNunjucks(fileContent, vars)` is exactly `template = nunjucksFunction(fileContent); return template(vars)` (`parseNunjucks.js:8-10`) — a general string renderer, correct primitive to wire. ✅
- `renderStatusMap` ctx is `{ ...plannedActionDoc, ...(plannedActionDoc?.metadata ?? {}), ...(mergedMetadata ?? {}) }` (`renderStatusMap.js:23-27`); the design's read-time ctx `{ ...action, ...(action.metadata ?? {}) }` is a faithful mirror minus the write-time-only `mergedMetadata`. ✅
- `GetWorkflowAction.js:257` sources `description: action.description ?? null`; the handler already resolves `actionConfig` (`:156-157`) and imports neither `parseNunjucks` nor `renderStatusMap` — the new import + render is genuinely new, as the design states. The render ctx fields (`action.key` at `:254`, `action.metadata`) are present on the loaded doc. ✅
- `ACTION_FIELDS` is a `pick`-allowlist (`makeWorkflowsConfig.js:126-132`); adding `"description"` carries `actionConfig.description` through with no default needed. ✅
- `universal_fields` validation rejects any field not in `UNIVERSAL_FIELDS` (`:540`); shrinking the constant to two fields auto-rejects `description`. The legal-set message at `:527` literally says "all three" — must be reworded (design already calls for the message update). ✅
- The check page (`action.yaml.njk:217-222`) already binds the callout to `current_action.description` (the envelope), distinct from the editable `current_action.fields.description` seed at `:157` — so the source/chrome swap there is clean. ✅
- The in-context modal surface (`check-action-surface.yaml:142-143`) composes `universal-fields.yaml` with `show` **omitted**, relying on its default; shrinking the default to `[assignees, due_date]` correctly drops description there. Note: the four form templates pass an **explicit** `show: { _var: action_config.universal_fields }` to `universal-fields-modal.yaml` (`edit.yaml.njk:464-465`), so on form pages it's the resolver's `universal_fields` legal-set/default change — not the modal's default `show` — that removes the description input. Both are in the design's file list. ✅
- The `Markdown` block's property is `content` (`release-notes/pages/view.yaml:16-19`) — the new `action-description.yaml` var maps to `content`. ✅
- `universal-fields-callout.yaml` has exactly five `_ref` consumers (the four form njk + `action.yaml.njk`), all in the design's file list, so deleting it is safe once they're swapped. ✅
