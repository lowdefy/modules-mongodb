# Task 5: Document `start_link` — module README + action-authoring concept docs

## Context

Tasks 1–4 shipped `tracker.start_link`: validated in `makeWorkflowsConfig`, emitted by `computeEngineLinks` as the `edit`-verb link while the tracker is `action-required` with a null child, refreshed onto the doc by the planner, surfaced by the existing `resolve_action_link` pick. The docs now need to teach it — and to reposition the paired trigger + tracker pattern per design D6.

The division of labour to document (D6): a **trigger** is a one-shot human task (assignee, due date, form, completes on submit); a **tracker** is a long-running mirror (no assignee, no deadline, never touched by a human). `start_link` removes the case where the paired pattern produced UX noise — when the child entity is created on a real app page, the in-workflow trigger form duplicated that page and its row lingered as `done` clutter. The recommendation: **app page owns creation → `start_link`; inline form owns creation → paired trigger + tracker.**

Three doc surfaces, all currently describing trackers as display-only with a `workflow_type`-only block:

- `modules/workflows/README.md` — consumer-facing module reference. "Authoring actions" (line ~86) has subsections for `access:`, `status_map:`, signals, hooks; trackers are only mentioned in passing ("tracker actions emit none", line ~174/217).
- `designs/workflows-module-concept/action-authoring/design.md` — Decision 5 ("Tracker action YAML", line ~294): YAML shape, runtime linking, hard-coded child-stage map, and "Two paired actions, not one" (line ~387) which currently presents the paired pattern as _the_ recommended shape.
- `designs/workflows-module-concept/action-authoring/spec.md` — the schema spec the README names as source of truth alongside `makeWorkflowsConfig.js`: kind table (~82), validation rules (~98–100), tracker YAML section (~442–461), "Recommended shape: paired trigger + tracker actions" (~498).

## Task

1. **`modules/workflows/README.md`** — add a `### Tracker actions (`tracker:`)` subsection under "Authoring actions" (alongside `access:` / `status_map:`), covering:
   - The `tracker:` block: `workflow_type` (which child the action mirrors) and optional `start_link: { pageId, urlQuery? }` — the navigation target rendered while the tracker is `action-required` with no child started.
   - The two `urlQuery` sentinels (`action_id: true` → the tracker action's `_id`, i.e. the `parent_action_id` for `start-workflow`; `entity_id: true` → the parent workflow's entity id) and static string pass-through. Use the design's authoring example (`ticket-new` with both sentinels + `source: onboarding`), trimmed to README scale.
   - Gating: the start link is the tracker's **`edit`-verb** link — emitted only when the app slug declares `edit` in `access.{slug}`, role-filtered at read time like every other link; `view`-only trackers stay display-only. Link lifecycle: appears when the tracker lands `action-required`, replaced by the child-overview `view` link once `start-workflow` runs.
   - The destination page's contract: call the module's `start-workflow` endpoint with `parent_action_id: _url_query.action_id` (the design's save-flow snippet, condensed). Clicking the link changes no state; abandoning the page abandons nothing.
   - The recommendation sentence per D6: app page owns creation → `start_link`; inline form owns creation → paired trigger + tracker.
2. **`designs/workflows-module-concept/action-authoring/design.md`, Decision 5** — append a dated/Part-44-attributed note (concept history stays readable):
   - Extend the YAML-shape section: the `tracker:` block now carries an optional `start_link` (shape + sentinels), added by Part 44 (link to `../../workflows-module/parts/44-tracker-start-link/design.md`).
   - Rework "Two paired actions, not one" to state the D6 split instead of presenting the pair as the sole recommended shape: the pair remains right when creation is a small inline form with no app page; `start_link` is the recommended shape when an app page owns child creation.
3. **`designs/workflows-module-concept/action-authoring/spec.md`** — keep the schema spec true to the validator:
   - Validation rules (~98–100): `kind: tracker` requires `tracker:` with `workflow_type`, **optionally** `start_link: { pageId: string, urlQuery?: object }` — allowed keys exactly `pageId`/`urlQuery`; in `urlQuery` the reserved keys `action_id`/`entity_id` are sentinel-only (if present, value must be exactly `true`) and every other key must carry a string.
   - Tracker YAML section (~442–461): mention `start_link` in the block description and example.
   - "Recommended shape: paired trigger + tracker actions" (~498): same D6 repositioning as the design doc.

## Acceptance Criteria

- README subsection exists with the authoring example, sentinel semantics, `edit`-verb gating, link lifecycle, destination-page contract, and the D6 recommendation.
- Concept design.md Decision 5 and spec.md no longer present the paired pattern as the only shape; both describe `start_link` consistently with `makeWorkflowsConfig`'s validation (manifest/validator wins on any wording conflict).
- All cross-doc links resolve (relative paths verified).
- No client names anywhere (generic examples only — the design's `ticket-new` / `onboarding` vocabulary is fine).

## Files

- `modules/workflows/README.md` — modify — new "Tracker actions" authoring subsection.
- `designs/workflows-module-concept/action-authoring/design.md` — modify — Decision 5 `start_link` addition + D6 repositioning of the paired pattern.
- `designs/workflows-module-concept/action-authoring/spec.md` — modify — validation rules, tracker YAML section, recommended-shape section.

## Notes

- The design's Files-changed table names "README + concept docs (action-authoring Decision 5)". spec.md is included because the README declares it a schema source of truth alongside `makeWorkflowsConfig.js` — leaving it stale would contradict task 1's validator. Keep spec edits surgical (the three sections above).
- Do not document a retry/unlink path for cancelled children — the design accepts that dead end for v1 (Known limitation). If the README subsection mentions it at all, one sentence max.
- Demo-app examples belong to Part 45 (`track-company-setup`); don't add demo references here.
