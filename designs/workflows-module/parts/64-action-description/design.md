# Part 64 — Action `description` rework (drop the editable universal field, revive the authored one)

The universal-fields surface (Part 24) shipped a `description` field that turned out to be a mistake: a per-instance, end-user-editable rich-text field on every action, written through the `update-fields` operation and rendered as a tinted callout. A single user-authored description per action adds nothing over a comment on the action — comments already capture per-instance free text, with history and authorship. This part deletes that field everywhere and, in its place, revives the field that was actually wanted all along: a **workflow-author-authored `description`** that describes the action to whoever performs it. That field already exists in the authoring spec's examples (`action-authoring/spec.md`) but was never wired to anything — it became dead config while a different, editable `description` got built. This part wires the authored one and removes the editable one.

## Proposed change

1. **Delete the universal-field `description` everywhere** (form _and_ check). The universal fields shrink to **`assignees` + `due_date`**. This removes the TiptapInput edit input, the display branch, the `update-fields`/planner write path for `description`, the action-doc `description` field and its `StartWorkflow` seeding, and the `description` entry from every `UNIVERSAL_FIELDS` list.
2. **Revive `description` as an author-authored config field** on the action YAML — the field the spec examples always showed but no resolver ever read. It is a markdown string written by the workflow author, describing the action to its performer. It is **read-only at runtime** (not editable per instance) and lives in the workflow config, not on the action doc.
3. **One consistent meaning for the action `description`** — "the descriptive body of an action, rendered to whoever works it, authored when the action is defined." For workflow actions the workflow author writes it (static config); for future task actions the task creator will write it (per-doc). Same field, same surface, same render; only the author and storage differ by the action's origin. Written into the authoring spec so the two halves never drift apart again. (This is scoped to the **action** `description` — the unrelated event `display.{app}.description` key keeps its own rule: it cannot be authored. See the disambiguation table below.)
4. **`description` is read-time rendered with `{{ var }}` templating.** GetWorkflowAction renders the authored template against the loaded action doc on every read via the shared `parseNunjucks` primitive, with a render context built in the same shape `renderStatusMap` builds. Because it renders fresh per read it can never go stale — the staleness risk only exists for values materialised onto the doc at create time, which this is not.
5. **`description` renders as a plain markdown lead-in at the top of the middle-column content card** — no tinted primary-colour callout, no eyebrow label, no callout chrome _of its own_. It is not a free-floating block: it sits as the first child _inside_ the shared content card the middle column now wraps its working content in (see "Middle-column layout model" below), above the entity slot / form body. The `universal-fields-callout.yaml` component is replaced by a plain `action-description.yaml` render on every surface that shows it. ("No card chrome" means the description has no _separate_ bordered box around itself — it shares the one content card with the rest of the working surface; it is not given, and does not float outside, a card.)
6. **Scope: the full-page form + check surfaces.** The authored `description` renders on the surfaces this part touches: the four form-mode pages (`edit/review/error/view.yaml.njk`) and the per-workflow check page (`action.yaml.njk`). This **replaces** the read-only description callout those pages render today (the editable universal field's value) with the authored field's plain render — it is not a new surface, it is a source-and-chrome swap. The **in-context check modal** (`check-action-surface.yaml`) is **out of scope for rendering** the authored description — its layout and description treatment are deferred to a separate design (see Non-goals). This part still does the **mandatory** modal cleanup the field deletion forces: removing the now-dead editable-`description` mapping the modal passes into the universal-fields component (the field no longer exists). So after this part the modal simply shows no description until the follow-on design adds the authored render; the full-page surfaces show it. Custom actions own their entire working page and stay out of scope. The rendered authored string is sourced from the `get_workflow_action` envelope on every surface that renders it (form pages already load that request), so no surface depends on the deleted `action.description` doc field. (On form pages the envelope is stored in state under the key `action`, so the render's binding path is literally `_state: action.description` — unchanged; only GetWorkflowAction's _source_ for that envelope key flips. "The deleted `action.description`" always means the action-doc field, never the form's `action` state namespace.)
7. **The full-page middle column gets one consistent content card and a fixed block order** (folded in — see "Middle-column layout model"). The full-page surfaces disagree today: the generic action page (`action.yaml.njk`) has **no card at all** (a bare `Box`), and the form pages card the form but float the description above it — and the generic page's order buries the workflow-closed banner _below_ the description. The in-context modal (`check-action-surface.yaml`) already wraps everything in one card and is the **reference** the full-page surfaces now match, not a target of this layout change (the modal's own treatment is deferred — point 6 / Non-goals). Because this part is already reworking slot 0 on the full-page surfaces, and a chrome-less markdown render floating in a card-less box would look unanchored, it lands the consistent model there: bare full-width alerts on top, one content card holding the description lead-in + working surface, floating action bar at the bottom.

## Background — the four tangled "descriptions"

Part 24 and the spec drifted into several different things all called (or shaped like) "description". Untangling them is the whole point of this part:

| What                                    | Author                         | Lifetime                                                                 | Wired?                                                                                                                                                   | Disposition                                                               |
| --------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Universal-field `description`**       | end user, per instance         | editable on the action doc, `{ text, html }`                             | yes — TiptapInput, `update-fields`, callout                                                                                                              | **deleted** (redundant with comments)                                     |
| **Root-level authoring `description:`** | workflow author                | static, in YAML                                                          | **no** — in spec examples (`spec.md:395/433/461`) but absent from `ACTION_FIELDS` / `ACTION_FIELDS_FOR_TEMPLATE`; no resolver reads it                   | **revived + wired** (this part)                                           |
| **`message`**                           | workflow author, per stage     | rendered `status_map.{stage}.{app}.message` → `action[app_name].message` | yes                                                                                                                                                      | **unchanged** — short per-stage display copy on cards / timeline / header |
| **Event `display.{app}.description`**   | nobody — authoring is rejected | n/a — never stored                                                       | **rejected** — `makeWorkflowsConfig`'s `rejectAuthoredDescription` hard-errors if an author sets it (event descriptions are owned by the action comment) | **unchanged** — stays rejected; event display authors set only `title`    |

The original intent (for the action `description`) was clearly the second row — the spec examples read like performer guidance ("Confirm the lead's contact details and capture qualification notes."). During implementation that intent split: the config field became a never-read stub, and a separate editable metadata field got built in its place. This part collapses the split back to the one field that was wanted.

`message` is **not** touched and is **not** the same thing: it is the short, per-stage status copy ("Qualify the lead" / "Lead qualified") that appears on the entity card, in the timeline, and as the action page title. `description` is the longer body that explains the action. An action can have both.

The event `display.{app}.description` (fourth row) is also **not** touched and is a different key at a different path: it is the per-app display block on a workflow/lifecycle **event**, where `rejectAuthoredDescription` deliberately forbids a description because event descriptions are owned by the action comment. This part's "one consistent meaning" applies only to the action body `description`; the event rule is unchanged and unaffected. They never collide in code (different config paths) — the only risk is an author reading the spec and seeing two `description` keys with opposite rules, which the spec amendments below head off.

## The `description` contract

```yaml
type: schedule-followup
kind: check
access:
  my-team-app:
    view: true
    edit: [account-manager]
# Authored body, rendered to whoever works the action. Markdown string,
# nunjucks-templated against the action instance at read time.
description: |
  Call the lead within a week of qualification. Confirm the install address
  and **note any access constraints**. Reference: {{ key }}.
status_map:
  action-required:
    my-team-app: { message: Schedule a follow-up call }
  done:
    my-team-app: { message: Follow-up scheduled. }
```

- **Type** — a single **markdown** string. Rendered by the built-in `Markdown` block (`@lowdefy/blocks-markdown`, already used in `modules/release-notes/pages/view.yaml`), so no markdown→HTML converter is needed server-side. Markdown is chosen over HTML because the author writes this in YAML, where markdown is far more ergonomic and less error-prone than hand-written tags. Optional; omitted / null → the surface renders nothing.
- **Authoring** — set once in the action YAML; identical for every workflow instance of that action type. Not per-instance, not editable through any operation. (Contrast the deleted universal field, which was the editable one.)
- **Storage** — lives in the workflow config produced by `makeWorkflowsConfig`, reachable in the engine as `actionConfig.description` — exactly where `required_after_close` already lives. **Not** written onto the action doc.
- **Templating** — supports `{{ var }}` nunjucks against the action instance. Rendered **at read time** by GetWorkflowAction via the shared `parseNunjucks(string, vars)` primitive (the same primitive `renderStatusMap` reaches through `renderTree`), with `vars` built in the same shape `renderStatusMap` builds: `{ ...action, ...(action.metadata ?? {}) }`. (`renderStatusMap` itself is **not** the entry point — its signature is `{ cell, plannedActionDoc, mergedMetadata }` and it renders status-map cells, not a lone string.) For instanced actions this means `{{ key }}` and reference fields interpolate. Read-time rendering is the deliberate anti-staleness choice (point 4) — there is no create-time materialisation to go out of date.
- **Read path** — GetWorkflowAction returns the rendered string as the envelope's `description` key (the same key the deleted universal field used, so the surface binding `current_action.description` is unchanged in name — only its source flips from `action.description` to the rendered `actionConfig.description`). Null when unset.
- **Which kinds render it** — `description` is authored on **any** kind and rendered on the **form + check** surfaces. It is **accepted-but-unrendered** on `custom` (which owns its entire working page) and `tracker` (which has no working surface) — authoring it there is harmless config, not an error. There is deliberately no validation rejecting `description` on those kinds (per "don't over-restrict": the field is defined once; surfaces choose whether to render it).

### Why read-time render, not write-time

`status_map.message` is rendered at **write time** by the engine and stored on the action doc (`action[app_name].message`) — that is the materialise-at-write pattern that can go stale if the inputs change without a transition (the precise class Part 24's `update-fields` re-render exists to fix). `description` deliberately renders at **read time** instead: it is config, it has no transition that would naturally re-render it, and it is cheap to render on each GetWorkflowAction call. Rendering on read sidesteps staleness entirely and needs no re-render hook. This matches the staleness concern raised during design: a templated description rendered once at action create would drift; rendered per read it cannot.

## Middle-column layout model

The three working surfaces disagree today on how the middle column is structured, and the generic page orders it badly. This part lands **one model** for all three (the "one correct way" principle), top to bottom:

```
1. Alerts / notices   ── bare, full-width (Alert/callout convention, NOT in the card)
   • workflow_closed_banner    (hard stop — "you can't submit this"; first)
   • changes-requested callout (Part 62 — "what to fix"; below the closed banner)
2. Content card       ── ONE card per surface
   • description       (this part — plain Markdown lead-in, the card's first child)
   • entity-view slot  (the review subject; check page)
   • form fields / comment  (the work)
3. Floating action bar  (the shell's `actions` slot — unchanged)
```

Why this shape:

- **Alerts above, uncarded.** The workflow-closed banner is a hard-stop actionability notice; it must sit first, not below the description (the generic page's current order buries it under the description — a bug this fixes). Part 62's changes-requested callout is the next-most-urgent notice ("what to fix") and sits below it. Both are full-width alerts, not card content — matching the Alert convention and keeping the card for working content.
- **One content card.** The description lead-in, the entity slot, and the form/comment share a single card. This makes the generic action page (today a card-less bare `Box`) match the in-context modal (already one card) and the form pages (already card the form — the description simply moves _inside_ that card as its top lead-in instead of floating above it).
- **The description has no separate box.** Point 5: it is the card's first child, not its own bordered callout. "Chrome-less" means no callout of its own — it still lives on the shared card.

### Closed banner now renders on form pages too

Today `workflow_closed_banner` renders only on the generic check page (`action.yaml.njk`) and the modal body (`check-action-surface.yaml`) — the four form pages omit it, so a closed-workflow form action shows no "updates no longer accepted" notice. The uniform model puts the banner in the bare-alerts slot on **every** working surface, so the form pages gain it. The envelope already carries `workflow_closed` / `required_after_close` (the check page reads them), so on form pages it is the same `Alert`, gated `_state: action.workflow_closed` AND not `action.required_after_close`. This is a deliberate consistency fix folded in here, not a silent behavioural drift.

## Rendering the description

Every surface that works an action renders `description` as the plain markdown lead-in inside its content card (per the model above), replacing the tinted callout it shows today:

- **`templates/action.yaml.njk`** (the per-workflow `{workflow_type}-action` check page) — the middle column, today a bare `Box`, wraps its working content (description + entity slot + comment) in one content card; the description is that card's first child, a plain `Markdown` block sourced from `current_action.description`. The closed banner moves out to the bare-alerts slot above the card (and above Part 62's changes-requested callout). No tint, no "DESCRIPTION" eyebrow, no bordered box of its own.
- **`templates/{edit,review,error,view}.yaml.njk`** (the four form-mode pages) — the callout `_ref` that floats _above_ the form card today is removed; the same plain render is added _inside_ the form card as its first child (above `formHeader`), sourced from the `get_workflow_action` envelope (these pages already load that request). The closed banner is added to the bare-alerts slot above the card.
- **`components/check-action-surface.yaml`** (the in-context modal body) — **does not render the authored description in this part** (deferred — Non-goals). The only change here is mandatory cleanup forced by the field deletion: the now-dead editable-`description` mapping it passes into the universal-fields component is removed. The follow-on modal design owns adding the authored render.

The full-page surfaces compose a new shared leaf **`components/action-description.yaml`**: a plain `Markdown` block whose content is passed in as a var (so each surface binds its own source — `_state: current_action.description` on check, the form pages' equivalent envelope binding on form), `visible` when that content is non-null. It lives outside the `universal-fields/` folder because description is no longer a universal field. (Mirrors how the deleted `universal-fields-callout.yaml` already took the description as an `action_data.description` var rather than hard-coding a state path.) The modal can reuse this same leaf when its follow-on design lands.

`universal-fields-callout.yaml` (the tinted callout) is **deleted** — its only consumer was the description, and its chrome is exactly the emphasis we're removing.

## Universal fields shrink to `assignees` + `due_date`

With `description` gone from the universal-fields machinery:

- **`universal-fields.yaml`** — drop the `description` TiptapInput (edit group) and the description display branch. Drop `description` from **every** inline `show` default — the top-level `visible` length test and each remaining `_build.array.includes` default (~7 occurrences), not just the top-level gate — so the whole file reflects the two-field model.
- **`universal-fields-modal.yaml`** — default `show` becomes `[assignees, due_date]`; no other change.
- **`universal-fields-chips.yaml`** — already renders only assignees + due (description was never a chip). Update the ✎-button comment that references adding a description.
- **The action doc** no longer carries `description`. `planActionTransition.js` stops seeding `description: null` on new action docs; the `Action` typedef drops `description`.
- **The `update-fields` operation** writes only `assignees` / `due_date`. `planFieldsUpdate.js`'s `UNIVERSAL_FIELDS` and `planActionTransition.js`'s kind-based strip set both drop `description`.

## Files changed

### Plugin — `plugins/modules-mongodb-plugins/src/connections/`

- **`WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`** (amend) — source the envelope's `description` from `actionConfig.description` (was `action.description`), rendered at read time via `parseNunjucks(actionConfig.description, ctx)` with `ctx = { ...action, ...(action.metadata ?? {}) }` (the same context shape `renderStatusMap` builds). GetWorkflowAction imports neither `parseNunjucks` nor `renderStatusMap` today (the envelope `message` is read pre-materialised from `action[app_name].message`), so this is a genuinely new import + render step, not reuse of an existing call in the handler. Return `null` when unset.
- **`shared/phases/planners/planFieldsUpdate.js`** (amend) — `UNIVERSAL_FIELDS` → `["assignees", "due_date"]`. Drop `description` from the JSDoc.
- **`shared/phases/planners/planActionTransition.js`** (amend) — `UNIVERSAL_FIELDS` (strip set) → `["assignees", "due_date"]`; remove `description: null` from the new-action-doc seed (`:188`); update the kind-based-rule JSDoc.
- **`shared/types.js`** (amend) — remove `description` from the `Action` typedef.
- **`WorkflowAPI/UpdateActionFields/UpdateActionFields.js`** + tests, **`planFieldsUpdate.test.js`**, **`planActionTransition.test.js`**, **`GetWorkflowAction.test.js`** (amend) — drop `description` assertions on the fields-write path; add a GetWorkflowAction assertion that `description` comes from config and renders templates.

### Resolver — `modules/workflows/resolvers/`

- **`makeWorkflowsConfig.js`** (amend) — add `description` to `ACTION_FIELDS` (so `actionConfig.description` reaches the runtime config / GetWorkflowAction); `UNIVERSAL_FIELDS` → `["assignees", "due_date"]`; validate `description` is a string when present; update the `universal_fields` validation message/legal-set to the two-field list.
- **`makeActionPages.js`** (amend) — `UNIVERSAL_FIELDS_DEFAULT` → `["assignees", "due_date"]`. (`description` is not needed in the per-action template config — the check page reads it from the runtime envelope, and form pages don't render it.)

### Module — `modules/workflows/`

- **`components/action-description.yaml`** (new) — plain `Markdown` render whose content is passed in as a var, visible when non-null. No callout chrome.
- **`components/universal-fields/universal-fields-callout.yaml`** (delete) — replaced by the plain render on every surface that `_ref`'d it.
- **`components/universal-fields/universal-fields.yaml`** (amend) — remove the description edit input + display branch; default `show` → `[assignees, due_date]`.
- **`components/universal-fields/universal-fields-modal.yaml`** (amend) — default `show` → `[assignees, due_date]`.
- **`components/universal-fields/universal-fields-chips.yaml`** (amend) — comment-only update.
- **`templates/action.yaml.njk`** (amend) — the big layout change. The middle column (today a bare `Box`) gains: (a) a **bare-alerts slot** holding `workflow_closed_banner` (moved out of the content) ahead of where Part 62's changes-requested callout will sit; (b) **one content card** wrapping the working content, whose **first child** is the `action-description.yaml` `_ref` sourced from `current_action.description`, followed by the entity-view slot + comment. The current slot-0 callout `_ref` is removed (its render moves inside the card); the floating action bar is unchanged. Also remove the 8 `current_action.fields.description` seeds (the editable working-copy lines, at `:157, 325, 479, 570, 667, 788, 879, 947`); the edit modal's `show` defaults to assignees+due.
- **`components/check-action-modal.yaml`** (amend) — remove the `current_action.fields.description` seed (`:108-110`) that fed the deleted editable input.
- **`templates/{edit,review,error,view}.yaml.njk`** (amend, four files) — remove the callout `_ref` that floats above the form card today; add the `action-description.yaml` `_ref` as the **first child inside the form card** (above `formHeader`). Add `workflow_closed_banner` to a bare-alerts slot above the card (the consistency fix — these pages omit it today; same `Alert`, gated `_state: action.workflow_closed` AND not `action.required_after_close`). The description render's binding path is **unchanged** — `_state: action.description` already reads the `get_workflow_action` envelope (stored in state as `action`); only GetWorkflowAction's _source_ for that envelope key flips (action-doc field → rendered `actionConfig.description`), so that swap is source-only. Drop the editable `fields.description` seed (the `_state: action.description` line under the `prime_form_state` `fields:` map that primed the deleted modal input) — **not** the read-only `action.description` render binding (see #2). Note the form template's `_build.if` that renders the form directly when the first form entry owns outer chrome (vs the `form_card` else-branch): the description lead-in must land inside whichever container holds the form, so it is prepended in **both** branches.
- **`components/check-action-surface.yaml`** (amend — cleanup only) — remove the now-dead `description: { _state: current_action.fields.description }` mapping (`:169-170`) from the universal-fields composition (the field no longer exists). **Do not** add the authored-description render here — the modal's render is deferred to a separate design (Non-goals). The modal is already a single `Card`, so no layout change is needed in this part.

### Concept-spec amendments

- **`designs/workflows-module-concept/action-authoring/spec.md`** —
  - "Universal action fields" table: drop the `description` row (leaving `assignees`, `due_date`); update the write-path prose to remove `description`.
  - Add a new authored-field section defining `description` per the contract above (authored body, markdown string, read-time nunjucks templating, form + check render, consistent meaning across workflow + future task actions). State the per-kind rule in one line: `description` is authored on any kind, rendered on **form + check**, and accepted-but-unrendered on `custom` / `tracker` (no validation rejects it there).
  - The form / check / tracker examples: the root-level `description:` lines now describe a **real** field — keep them but ensure they reflect the authored-config contract (and that they render on form + check).
  - **Reconcile the event `display.{app}.description` rule.** Wherever the spec documents event display authoring (the `rejectAuthoredDescription` rule — "event descriptions are owned by the action comment and cannot be authored"), add the action `description` to the disambiguation so the two `description` keys read as deliberately distinct, not contradictory: the action body `description` IS authored config and renders; the event `display.{app}.description` is NOT authorable and hard-errors. Word the rejection prose as a rule about the _event display_ key specifically, never a blanket "descriptions are never authored."
- **`designs/workflows-module-concept/engine/spec.md`** — the action-doc `description` line (`string | null` / `{ text, html } | null`) is removed; `description` is no longer an action-doc field. Note it as authored config read via `actionConfig`.

## No migration

The module is unreleased and its test data has been deleted, so there is nothing to migrate. The action-doc `description` field simply stops being written and stops being read; new docs won't carry it, and there are no old docs to clean up.

## Non-goals / deferred

- **The in-context check modal (`check-action-surface.yaml`) — its authored-description render and any layout reconciliation are deferred to a separate design.** This part does only the mandatory cleanup the field deletion forces in the modal (removing the dead editable-`description` mapping into the universal-fields component); it does **not** add the authored `description` render there. After this part the modal shows no description until the follow-on lands. The modal already conforms to the content-card model (it is a single `Card`), so it needs no layout change here — only the description render, which the new design owns. The shared `components/action-description.yaml` leaf is built so that design can drop it straight into the modal card.
- **Rendering `description` on custom / tracker surfaces.** v1 renders on form + check (the surfaces that already showed a description callout). Custom actions own their entire working page and tracker has no working surface, so neither renders the authored `description`; adding one is a trivial template change when a need surfaces.
- **Per-stage `description`.** One body per action, not keyed by stage (that's what `status_map.message` is for).
- **Task-action `description`.** The tasks module is out of scope; this part only fixes the shared _meaning_ so the future module can reuse the same field and surface.

## Open questions

- **Render order: nunjucks then markdown.** GetWorkflowAction runs the nunjucks interpolation server-side via `parseNunjucks` and returns the still-markdown string; the `Markdown` block does the markdown→HTML render client-side. Interpolated `{{ var }}` scalars become markdown text (then markdown), so an author who interpolates a value containing markdown metacharacters could get surprising formatting — acceptable for v1 (values are short scalars like `key`). Autoescaping is **on** (`parseNunjucks` builds via `nunjucksFunction`, which escapes by default), so an interpolated scalar containing `&`/`<`/`>` is emitted as an HTML entity into the markdown string; this round-trips safely through the `Markdown` block (markdown preserves entities, the browser decodes on render). No HTML-safety knob is needed — and the implementer must **not** add the `| safe` filter the deleted callout used, which would reintroduce an injection path.

## Relationship to Part 24

[Part 24 (universal-fields surface)](../_completed/24-universal-fields/design.md) is in `_completed/` (implemented). This part supersedes its `description` decisions: Part 24's universal fields were `[assignees, due_date, description]`; after this part they are `[assignees, due_date]`, and `description` is the author-authored config field defined here. Part 24's `assignees` / `due_date` write path (the `{workflow_type}-update-fields` operation, the chips/modal, the role gating) is unchanged. A deviation note is added to Part 24 pointing here.

## Relates to

- **[Part 62 (changes-requested callout)](../62-changes-requested-callout/design.md)** lands _after_ this part and builds on the layout this part establishes: its changes-requested callout sits in the **bare-alerts slot** — below the `workflow_closed_banner`, above the content card (so above, and outside, the `action-description.yaml` lead-in inside the card). Its `changes_requested` envelope field sits beside this part's `description`-source change in `GetWorkflowAction.js`. This part is self-contained and needs no accommodation for Part 62 — but it does define the alerts-slot / content-card structure Part 62 slots into, so Part 62's design references it.

## Depends on

- **[Part 24 (universal-fields surface)](../_completed/24-universal-fields/design.md)** — the surfaces, the chips/modal, and the `assignees`/`due_date` write path this part keeps.
- **Part 46 (`GetWorkflowAction` handler)** — the read path the envelope `description` flows through; already reads `actionConfig` (for `required_after_close`) and the workflow config (for `entity_link`).
- **[Part 56 (three-tier action pages)](../_completed/56-three-tier-action-pages/design.md)** — the `action.yaml.njk` page + callout/chips/modal split this part edits.
- **[Part 33 (comment rendering)](../_completed/33-comment-rendering/design.md)** — comments are the per-instance free-text channel whose existence makes the editable universal-field `description` redundant.
