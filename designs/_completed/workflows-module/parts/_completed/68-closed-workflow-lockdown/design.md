# Part 68 — Closed-workflow lockdown on form action pages

When a workflow is closed (`completed` or `cancelled`), its form action pages still render the **"Workflow closed"** banner but leave the signal buttons (Submit, Approve, Request Changes, …) fully clickable. Clicking one fires the submit endpoint, which correctly rejects the write — but the user only learns this after the round-trip. This part locks the closed state down on the client so a closed action's form pages are read-only: the working pages redirect to the read-only view, and every remaining action button is disabled. The check-kind surfaces (`action.yaml.njk` page + `check-action-surface.yaml` modal) already do this; this part brings the four form templates to parity.

## Proposed change

1. **One predicate everywhere.** Treat `closed_and_locked = action.workflow_closed AND action.required_after_close != true` — already the exact condition the closed banner renders on — as the single gate for banner, redirect, and button-disable across all form pages.
2. **Disable every signal button when `closed_and_locked`.** OR the closed gate into each button's existing `disabled` (which today binds only to the author override `page_config.buttons.*.disabled`, default `false`), across all four form templates — all 9 buttons, including the view page's **Edit** and **Request Changes**.
3. **Redirect working pages to view when `closed_and_locked`.** Add an onMount `redirect_workflow_closed` guard to `edit` / `review` / `error` that Links to the `view` page when the action is locked. `closed` is a harder stop than stale-status, so this guard **ignores** the `skip_status_redirect` escape hatch.
4. **Leave the check kind unchanged.** `action.yaml.njk` and `check-action-surface.yaml` already disable in place on the same predicate; they are single-surface (no separate view page), so redirect does not apply.
5. **Preserve the `required_after_close` carve-out.** A survivor of a closed workflow (`required_after_close === true`) is deliberately _not_ locked: no banner, no redirect, live buttons — its post-close submit must still succeed.

## Current state

Two families of action pages, both emitted by `modules/workflows/resolvers/makeActionPages.js`:

- **Check / FSM actions** → one `{workflow_type}-action` page (`templates/action.yaml.njk`) plus the in-context modal body (`components/check-action-surface.yaml`). Every signal button here already carries:
  ```yaml
  disabled:
    _and:
      - _state: current_action.workflow_closed
      - _ne:
          - _state: current_action.required_after_close
          - true
  ```
- **Form / custom actions** → separate `edit` / `view` / `review` / `error` pages (`templates/*.yaml.njk`). These render the closed banner on the same condition, but their buttons wire `disabled` only to the author override:
  ```yaml
  disabled:
    _var:
      key: page_config.buttons.submit.disabled
      default: false
  ```
  There is **no** `workflow_closed` term — hence live buttons on a closed workflow.

**Server contract (unchanged).** `GetWorkflowAction` (`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`) returns `workflow_closed` (`wfStage === "completed" || "cancelled"`, line 180) and `required_after_close` (`actionConfig.required_after_close ?? null`, line 307). `resolveButtons` does **not** consider closed, so the `buttons.*` booleans stay `true`; the submit endpoint (`SubmitWorkflowAction`) is the server-side backstop that rejects post-close writes. This part changes only client rendering — the server gate stays authoritative.

### How the gap is reached

`CloseWorkflow` (`.../CloseWorkflow/CloseWorkflow.js:83–106`) sweeps non-terminal actions to a terminal stage on close — **except** `required_after_close` survivors, which stay at their editable stage. So:

- A **swept** action lands on a terminal stage → the edit page's existing `redirect_stale_status` guard already bounces it to view. No gap.
- A **`required_after_close` survivor** → `closed_and_locked` is false → banner suppressed, stays editable. Correct, no change.
- The reachable gap: a **non-protected optional action left at `action-required` when the workflow auto-completes** (natural completion doesn't sweep leftover optional actions). Its stage is still in the edit page's editable allowlist `[action-required, in-progress, changes-required]`, so the stale-status guard does **not** fire → the edit page renders the closed banner over live buttons. This is the reported case.

## Key decisions

### D1 — A single `closed_and_locked` predicate drives banner + redirect + disable {#d1}

The banner already gates on `workflow_closed AND required_after_close != true`. Rather than invent a second condition, reuse that exact expression for the redirect and the button-disable. One predicate means banner, redirect, and disable can never disagree: if the banner is showing, the buttons are disabled and the working pages have redirected; if a `required_after_close` survivor shows no banner, it is fully live. ("One correct way.")

**Why keep the `required_after_close != true` term** even though the request was "just always disable all buttons on `workflow_closed`": a `required_after_close` action's entire purpose is to remain actionable after the workflow closes (its post-close submit is a deliberate carve-out — see `CloseWorkflow` sweep exception and `SubmitWorkflowAction`). Disabling it would break that feature _and_ leave a dead button with no banner to explain it. So "always disable when closed" is implemented precisely as "always disable when closed **and not** a `required_after_close` survivor" — identical to the banner, which is what the user is actually looking at.

### D2 — Working pages redirect to view; view disables its buttons {#d2}

Chosen mechanism (user): the working form pages (`edit`, `review`, `error`) redirect to the read-only `view` page when `closed_and_locked`, and the `view` page — the landing target — disables its remaining buttons (Edit, Request Changes). `view` always exists for a form action (`page_ids.view` is the base page; `edit`/`review`/`error` are optional), so the redirect target is always safe.

**Buttons are _also_ disabled on the working pages, not only on `view`.** The redirect fires in `onMount` after `get_action` + `SetState`, so there is a render frame where the working page paints before the Link resolves. Disabling the buttons on the same predicate closes that frame (no flash of live buttons) and makes each page correct independently of redirect timing. This is why the fix is applied uniformly to all 9 buttons rather than only to `view`'s two.

**The banner stays on all four templates** (unchanged). On the working pages it is transient — the correct, informative message during the pre-redirect frame — and on `view` it is the persistent notice. Removing it from the working pages would trade a harmless transient banner for extra churn; keep it.

### D3 — The closed redirect overrides `skip_status_redirect` {#d3}

`view` and `review` expose an **Edit** button that Links to the edit page with `input: { skip_status_redirect: true }`, so a viewer/reviewer can re-open the edit page for an action whose _stage_ would otherwise be bounced (`done`, `in-review`). A **closed** workflow is a stronger stop than a stale stage: the edit page must not be reachable at all for a locked action. So `redirect_workflow_closed` does **not** honor `skip_status_redirect` — it fires purely on `closed_and_locked`, and runs _before_ the stage-based `redirect_stale_status`.

In practice the two never collide from the UI: because `view`/`review` now disable their **Edit** button when `closed_and_locked` (D1), a locked action's Edit-link can't be clicked. The override is the defensive guarantee for a hand-typed/stale deep link.

## Worked shapes

**Button disable (form templates)** — OR the closed gate into the existing author override. Form pages read `action.*` (the check page reads `current_action.*`):

```yaml
disabled:
  _or:
    - _var:
        key: page_config.buttons.submit.disabled
        default: false
    - _and:
        - _state: action.workflow_closed
        - _ne:
            - _state: action.required_after_close
            - true
```

**Redirect guard (edit / review / error onMount)** — inserted after `set_entity_id`, before `redirect_stale_status`:

```yaml
- id: redirect_workflow_closed
  type: Link
  skip:
    _not:
      _and:
        - _state: action.workflow_closed
        - _ne:
            - _state: action.required_after_close
            - true
  params:
    pageId:
      _module.pageId:
        _var: page_ids.view
    urlQuery:
      _url_query: true
```

## Files changed

All under `modules/workflows/templates/`:

| File              | Change                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `edit.yaml.njk`   | Disable gate on `button_not_required`, `button_progress`, `button_submit`; add `redirect_workflow_closed` onMount step. |
| `view.yaml.njk`   | Disable gate on `button_request_changes` and `button_edit`. (No redirect — it is the target.)                           |
| `review.yaml.njk` | Disable gate on `button_edit`, `button_request_changes`, `button_approve`; add `redirect_workflow_closed` onMount step. |
| `error.yaml.njk`  | Disable gate on `button_resolve_error`; add `redirect_workflow_closed` onMount step.                                    |

No server, resolver, or config changes. No `docs/` var-schema changes (no new vars). Verify with `pnpm ldf:b`.

## Non-goals

- **Server-side changes.** The submit endpoint already rejects post-close writes and stays the authoritative gate; `resolveButtons` is not touched.
- **Check-kind surfaces.** `action.yaml.njk` and `check-action-surface.yaml` already disable on the same predicate and have no separate view page to redirect to — unchanged.
- **`required_after_close` behaviour.** Survivors stay fully actionable; this part must not lock them.
- **Removing the banner from the working templates.** Kept as the informative pre-redirect message (D2).

## Related

- Part 56 — three-tier action pages (the form/check template split).
- Part 64 — action description / banner layout model (banner placement + condition).
- Part 65 — check-action surface rework (the check-kind disable gate this part mirrors).
