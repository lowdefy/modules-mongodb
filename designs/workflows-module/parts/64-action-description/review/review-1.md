# Review 1

## Completeness — files the change touches but the design omits

### 1. The editable `description` callout renders on **form** pages too — the four form templates are missing from "Files changed"

> **Resolved.** Scope expanded from "check only" to **form + check** (point 6 rewritten). The authored `description` now renders on all five templates, replacing the existing callout with the plain `action-description.yaml` render rather than removing form's description body. `templates/{edit,review,error,view}.yaml.njk` added to Files changed; the form render sources the rendered authored string from the `get_workflow_action` envelope (already loaded on form), not the deleted `action.description`. Non-goals narrowed to custom/tracker only.

The design's mental model is that `description` lives only on the check surface ("**Scope: check only.** Form actions already have `formHeader` / `formFooter` … the authored `description` renders on the check surface", design.md:12; and Non-goals: "Adding a form render is a trivial later add when a need surfaces", design.md:119). That framing is inverted: the **editable** universal-field `description` callout currently renders on the form surfaces today.

`components/universal-fields/universal-fields-callout.yaml` is `_ref`'d by **five** templates, not one:

- `templates/edit.yaml.njk:188-194` — "Description callout (top of the middle column; self-hides when unset)", passing `action_data.description: { _state: action.description }`.
- `templates/review.yaml.njk`, `templates/error.yaml.njk`, `templates/view.yaml.njk` — same callout `_ref` (all four form-mode pages, lines ~161/189 each bind `_state: action.description`).
- `templates/action.yaml.njk:217-222` — the check page (the only one the design lists).

The design (design.md:98, 102) says **delete** `universal-fields-callout.yaml` and update only `action.yaml.njk`. If that ships as written, `edit/review/error/view.yaml.njk` are left `_ref`-ing a deleted file and the build breaks. These four files are entirely absent from the "Files changed" list (design.md:95-104).

Two things follow:

1. **The file list must add `templates/{edit,review,error,view}.yaml.njk`** — each needs its callout `_ref` removed and its `fields.description` / `action.description` seed dropped (see #2).
2. **The "form has no description render" premise is wrong.** This part is not "declining to add" a form render — it is _removing_ an existing one. That may be the right call (the field's meaning is changing), but the design should say so explicitly rather than describe form as a surface that never had a description. If anything, the fact that form already rendered a description body is _evidence_ the authored field belongs on form too — reconsider whether "check only" is the right v1 scope, or at least justify the removal rather than presenting it as a no-op.

### 2. The `current_action.fields.description` / `action.description` seeds are not enumerated — they become dead or mis-sourced

> **Resolved.** Files-changed notes now enumerate every editable-working-copy seed for removal: the 8 `current_action.fields.description` seeds in `action.yaml.njk` (lines listed), the `check-action-surface.yaml:169-170` mapping, the `templates/{edit,review,error,view}.yaml.njk` `prime_form_state` seeds (in the form-templates entry), and `check-action-modal.yaml` is added to the file list with its `:108-110` seed flagged for removal. The read-only render source (top-level `current_action.description` / envelope binding) is kept distinct from these deleted editable seeds.

Every surface seeds the editable description into the universal-fields working copy. After the field is deleted these seeds are dead, and worse, on the check page they would now seed the _rendered read-only authored_ string into an _editable_ `fields.*` namespace:

- `templates/action.yaml.njk` — **8** `get_workflow_action.description` seeds into `current_action.fields.description` across the per-mode SetState blocks (lines 157, 325, 479, 570, 667, 788, 879, 947).
- `components/check-action-surface.yaml:169-170` — maps `description: { _state: current_action.fields.description }` when invoking `universal-fields.yaml`.
- `components/check-action-modal.yaml:108-110` — seeds `current_action.fields.description` from `get_workflow_action.description`. **This file is not in the design's file list at all.**
- `templates/{edit,review,error,view}.yaml.njk` — `prime_form_state` seeds `fields.description: { _state: action.description }` (e.g. `edit.yaml.njk:162-164`).

The design's note for `action.yaml.njk` only mentions "replace the callout `_ref` (slot 0)… edit modal's `show` defaults" (design.md:102) and its note for `check-action-surface.yaml` only mentions removing description from the universal-fields composition and adding the new render (design.md:103). Neither calls out removing the `fields.description` seeds, and `check-action-modal.yaml` is omitted. Add an explicit line: every `current_action.fields.description` / `action.description` seed is removed alongside the modal input, so nothing seeds a now-nonexistent (or read-only) field.

## Correctness / precision

### 3. `renderStatusMap` is not a reusable string renderer — name `parseNunjucks` as the primitive

> **Resolved (auto).** Design now names `parseNunjucks(string, vars)` as the primitive (points 4 & contract, GetWorkflowAction file note, open question), with `vars = { ...action, ...(action.metadata ?? {}) }` described as "the same shape `renderStatusMap` builds." Clarified that `renderStatusMap` is not the entry point and that GetWorkflowAction imports neither today, so this is a new import + render step.

The design repeatedly says GetWorkflowAction should render `description` "using the same context `renderStatusMap` builds" (design.md:10, 52) and the open question asks to "Confirm the shared renderer reuses `renderStatusMap`'s context/escaping unchanged" (design.md:125). But `renderStatusMap` (`shared/render/renderStatusMap.js`) is not a general renderer — its signature is `{ cell, plannedActionDoc, mergedMetadata }`, it returns `{}` when `cell == null`, and it is specific to status-map cells. It cannot render a lone description string, and at read time there is no `plannedActionDoc`/`mergedMetadata` — GetWorkflowAction only has the loaded `action` doc.

The actual shared primitive is **`parseNunjucks(string, vars)`** (`shared/render/parseNunjucks.js`), which `renderStatusMap` itself reaches via `renderTree`. GetWorkflowAction should call `parseNunjucks(actionConfig.description, ctx)` with `ctx` built to mirror `renderStatusMap.js:23-27` — i.e. `{ ...action, ...(action.metadata ?? {}) }`. The design should name `parseNunjucks` (or `renderTree`) as the function to wire, and describe the ctx build as "the same shape `renderStatusMap` builds," not imply `renderStatusMap` is the entry point — otherwise the implementer wires the wrong function. Note also GetWorkflowAction imports neither today (the envelope `message` at `GetWorkflowAction.js:244` is read pre-materialised from `action[app_name].message`), so this is a genuinely new import/render step, not a reuse of an existing call in that handler.

### 4. There is a **fourth** "description" the design's table ignores, and its error message contradicts the new contract

> **Resolved.** Background section retitled "four tangled descriptions" with a fourth table row for the event `display.{app}.description` (author rejected, owned by the action comment). Point 3's headline scoped to "the action `description`" with an explicit pointer that the event key keeps its own no-author rule. Spec-amendments section gains a bullet directing the `rejectAuthoredDescription` prose to be reconciled — the two `description` keys documented as deliberately distinct, and the rejection worded as a rule about the event display key specifically, never a blanket "descriptions are never authored."

The "three tangled descriptions" table (design.md:18-26) is missing a fourth, retained one: the **event** `display.{app}.description`. `makeWorkflowsConfig.js:185-211` (`rejectAuthoredDescription`) hard-errors on it with:

> `… display "{app}" has a "description" — event descriptions are owned by the action comment and **cannot be authored**; set only "title" here.`

and the same rejection fires for workflow-level lifecycle events (`makeWorkflowsConfig.js:691-697`). So after this part there are two author-facing keys literally named `description` with opposite rules: a root-level `description:` that **is** authored config and gets rendered (this part), and `display.{app}.description` that **cannot** be authored and hard-errors. The design's headline claim "**One consistent meaning for `description`**" (design.md:9, point 3) collides with a live error message asserting descriptions cannot be authored.

This isn't a bug in the plan — the two live at different paths — but the spec amendments (design.md:106-111) should reconcile them: add the event `display.{app}.description` to the disambiguation table, and make sure the `rejectAuthoredDescription` prose (or the spec section that mirrors it) is worded so it doesn't read as a blanket "descriptions are never authored" rule now that root-level `description` is exactly that.

## Minor

### 5. Autoescaping: interpolated scalars are HTML-entity-encoded before they reach the Markdown block

> **Resolved (auto).** Open question now states autoescaping is on (`parseNunjucks` → `nunjucksFunction`), so interpolated `&`/`<`/`>` round-trips safely through `Markdown`, and instructs the implementer not to add the `| safe` filter the deleted callout used.

`parseNunjucks` builds its template via `nunjucksFunction` from `@lowdefy/nunjucks`. The existing `universal-fields-callout.yaml` uses the `| safe` filter (line 33-ish: `{{ description | safe }}`), which is the tell that autoescaping is **on** by default. So a `{{ key }}` value containing `&`, `<`, or `>` will be emitted as `&amp;` / `&lt;` into the markdown string, then passed through the `Markdown` block. In practice this round-trips fine (markdown preserves entities; the browser decodes them on render), so the open question's conclusion ("no HTML-safety knob is needed because the output is markdown", design.md:125) holds — but for the _opposite_ reason it implies: it's safe because nunjucks _does_ escape, not because markdown output is inherently safe. Worth a one-line note so the implementer doesn't add `| safe` (which would reintroduce an injection path) when porting the render. The markdown-metacharacter caveat the design already accepts (`*`, `_` in interpolated values) is unaffected by autoescaping and remains acceptable for v1.

## Verified — no issue

These design claims check out against source:

- `UNIVERSAL_FIELDS = ["assignees", "due_date", "description"]` in `makeWorkflowsConfig.js:124`, `planFieldsUpdate.js:10`, `planActionTransition.js:12`; `UNIVERSAL_FIELDS_DEFAULT` in `makeActionPages.js:33`. ✅
- `description` is **absent** from `ACTION_FIELDS` (`makeWorkflowsConfig.js:22-34`) — so adding it is required for `actionConfig.description` to reach GetWorkflowAction. ✅
- `planActionTransition.js:188` seeds `description: null` on the new action doc. ✅
- `types.js:55` declares `description` on the `Action` typedef. ✅
- `GetWorkflowAction.js:257` sources `description: action.description ?? null`; the handler already reads `actionConfig` (`:156`, `required_after_close` at `:245`) and `wfConfig.entity` (`:234`, `entity_link`). ✅
- The `Markdown` block is the official `@lowdefy/blocks-markdown` package (build `types.json` / `blockPackages.json`), used in `release-notes/pages/view.yaml:16` with **no** `plugins:` declaration in that module's manifest — official `@lowdefy/blocks-*` packages auto-resolve, so the `workflows` manifest does **not** need to declare it. ✅
- No DB migration needed (module unreleased). ✅
