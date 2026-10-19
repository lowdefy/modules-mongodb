# Task 9: `apps/demo` showcase — `send-quote` becomes a custom action

## Context

(Depends on tasks 2, 3, 4 — the build must accept `kind: custom`, validate its
cells, and the runtime must route its links. Independent of tasks 7/8, which cover
the `workflows-test` e2e fixture; this task is the **demo** showcase.)

`apps/demo` exercises every module and currently demonstrates three of the four
action kinds — `form`, `check`, `tracker` — but never `custom`. This task adds the
missing kind by converting the demo's existing `send-quote` action (onboarding
workflow, entity = Lead) from `kind: form` to `kind: custom`, backed by a new
app-owned `quote-builder` page. See `design.md` §Demo showcase.

Relevant existing files:

- `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml` — the
  action today: `kind: form`, `action_group: quoting`, `blocked_by: [qualify]`,
  `access.demo` with `review: [admin]`, a two-field `form:`
  (`form.quote_total` + `form.notes`), and a `status_map` (message-only cells).
- `apps/demo/pages/leads/` — the app-owned lead pages (`lead-view.yaml`,
  `lead-list.yaml`, `lead-new.yaml`). The new page lands here.
- `apps/demo/lowdefy.yaml` — `pages:` array registers each page via `_ref`
  (e.g. `- _ref: pages/leads/lead-view.yaml`).
- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — the headline happy-path
  spec; its `send-quote` section drives the form edit page + `workflow-action-review`.

The supported load path for an app page (verified against the module's own action
page, `modules/workflows/templates/action.yaml.njk` — formerly `check.yaml.njk`,
renamed in task for proposed-change item 4): `_ref` the module request
`requests/get_workflow_action.yaml` keyed on `?action_id`, read its `.allowed` /
`.buttons` / `.status`, derive `edit`/`review`/`view` mode with the same ladder the
module page uses, and call the `{workflow_type}-submit` endpoint via
`_module.endpointId`.

## Task

1. **Convert the action** — `…/onboarding/send-quote.yaml`:
   - `kind: form` → `kind: custom`; **delete the `form:` block** (custom rejects it).
   - Keep `action_group: quoting`, `blocked_by: [qualify]`, and the existing
     `access` (including `review: [admin]`).
   - Add a `link:` cell to every working stage of `status_map`, pointing at the app
     page id with the `action_id` sentinel (no `view_link` — observers fall back to
     the shared `onboarding-action` page, exercising the default observer path):

     ```yaml
     status_map:
       blocked:
         demo: { message: Build the quote once the lead is qualified. }
       action-required:
         demo:
           message: Build and send the quote for approval.
           link: { pageId: quote-builder, urlQuery: { action_id: true } }
       in-progress:
         demo:
           message: Quote in progress.
           link: { pageId: quote-builder, urlQuery: { action_id: true } }
       in-review:
         demo:
           message: Quote awaiting approval.
           link: { pageId: quote-builder, urlQuery: { action_id: true } }
       changes-required:
         demo:
           message: Reviewer requested changes.
           link: { pageId: quote-builder, urlQuery: { action_id: true } }
       done:
         demo:
           message: Quote approved and sent.
           link: { pageId: quote-builder, urlQuery: { action_id: true } }
     ```

2. **New app page** — `apps/demo/pages/leads/quote-builder.yaml` (page id
   `quote-builder`, matching the `link.pageId`):
   - On mount, guard `?action_id` presence, then load the action by `_ref`-ing the
     module request `requests/get_workflow_action.yaml`. Spread the response and
     derive `current_action.mode` (`edit`/`review`/`view`) from `status.0.stage` +
     `allowed` — copy the ladder verbatim from `templates/action.yaml.njk`.
   - Render the **bespoke** surface a flat `form:` can't express: a `ControlledList`
     of quote line items (description + amount) with a live-computed total, plus a
     notes field. This is the justification for the kind — keep it genuinely richer
     than two inputs, but no heavier than the demo needs.
   - On submit: (1) persist the quote subdoc to the lead via an app-owned
     `update_lead_quote` request (a `MongoDBUpdateOne` on `leads-collection`,
     `$set`-ing `quote.line_items` / `quote.total` / `quote.notes` + a change
     stamp), then (2) call the module submit endpoint:

     ```yaml
     - id: submit_quote
       type: CallApi
       params:
         endpointId:
           _module.endpointId: { id: onboarding-submit, module: workflows }
         payload:
           action_id: { _url_query: action_id }
           signal: submit # actor; admin reviewer uses approve / request_changes
     ```

     The reviewer (admin) path calls the same endpoint with `approve` /
     `request_changes` from review-mode buttons. (Two non-atomic requests — the
     documented recommended path; the atomic alternative, a `hooks.submit.pre`
     routine on the action, is noted in `design.md` §App-side shape and is out of
     scope here.)

3. **Wire it** — `apps/demo/lowdefy.yaml`:
   - Add `- _ref: pages/leads/quote-builder.yaml` to `pages:`.
   - Add the `update_lead_quote` request (co-located with the page per the
     project's file-structure conventions).

4. **Rewrite the e2e** — the `send-quote` section of
   `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`:
   - Replace the navigation-to-form-edit-page + `form.quote_total`/`form.notes`
     fill + `workflow-action-review` approval with: click the rendered `send-quote`
     action-row link (now carrying the concrete action `_id`) → lands on
     `quote-builder` → build the quote → submit → assert the action reaches
     `in-review` → approve as admin → assert `done`.
   - Keep the rest of the happy-path untouched.

5. **Build check:** from `apps/demo`, `pnpm ldf:b` (no secrets/network needed) —
   confirm the converted config + new page + request compile.

## Acceptance Criteria

- `send-quote.yaml` is `kind: custom`, has no `form:` block, retains its
  `access`/`blocked_by`/`action_group`, and authors `link:` cells with the
  `action_id` sentinel on every working stage.
- `apps/demo/pages/leads/quote-builder.yaml` exists, loads the action by
  `?action_id` via the module `get_workflow_action` request, derives mode, renders
  a line-items builder, persists the quote to the lead, and calls
  `onboarding-submit` with the nullary signal.
- The page and `update_lead_quote` request are registered in
  `apps/demo/lowdefy.yaml`.
- The `onboarding-happy-path` spec's `send-quote` section drives the
  `quote-builder` page (submit → in-review → admin approve → done) and the overall
  spec still passes.
- `pnpm ldf:b` (from `apps/demo`) compiles with no config errors.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml` — modify — convert form → custom; drop `form:`; add `link:` cells.
- `apps/demo/pages/leads/quote-builder.yaml` — create — the app-owned bespoke quote builder.
- `apps/demo/pages/leads/requests/update_lead_quote.yaml` (or page-local) — create — the domain write the page calls before submitting.
- `apps/demo/lowdefy.yaml` — modify — register the page (and request, if not page-local).
- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — modify — rewrite the `send-quote` section.

## Notes

- The whole point of the kind is "app owns the working surface", so `quote-builder`
  is genuinely app-owned (under `apps/demo/pages/`), not a module page. The shared
  `onboarding-action` page (module-supplied, the regeneralized Part 56 page) is the
  observer fallback and needs no app work here.
- This is a **showcase**, not the load-bearing correctness test — that remains the
  `workflows-test` spec (task 8). Keep the demo additions proportionate.
- Converting `send-quote` removes the demo's only `form`-with-review example, but
  `qualify`, `upload-po`, and company-setup's `billing-details` still cover the
  `form` kind; the review path stays covered here (admin review on the custom
  action) and in `workflows-test`.
