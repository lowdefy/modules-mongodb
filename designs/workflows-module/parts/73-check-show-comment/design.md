# Part 73 — Honour `show_comment` on check actions

`show_comment` declares whether an action's working surface offers the **optional** free-text comment box. It has worked on `kind: form` since it shipped and has **never** worked on `kind: check`: both check surfaces render the comment box unconditionally. This part closes that gap, and answers — once — which other top-level action properties are applicable to which kinds.

This is [Part 72](../72-check-universal-fields/design.md) again, one field over, and one step worse: `universal_fields` at least validated and reached the runtime config blob. `show_comment` had **no validator at all** and was not on `ACTION_FIELDS`, so a non-boolean value was accepted silently and the flag could not reach a runtime reader even in principle.

## The gap was never a decision

`show_comment` has no design document. Before this part it was documented in exactly one place — the `workflows_config` var description in `modules/workflows/module.lowdefy.yaml`, which described it as hiding the box "on the action's edit and review pages". That phrasing describes the form implementation, not an intended scope: nothing anywhere argues that a check action's comment box should be unremovable, and the field appeared in no reference or concept page.

The cause is the same structural asymmetry Part 72 documented, so the argument is not repeated here:

- Form actions get **per-action** pages (`makeActionPages.js` `emitForAction` early-returns on `action.kind !== "form"`), so any authored knob can be baked into `action_config` at build time.
- The check page is emitted once per workflow **type** (Part 56 D3) and routed by `?action_id`; `check-action-surface.yaml` is a component **dropped by host entity pages**. Neither knows which action it is showing at build time.

So the flag was read where it was cheap to read and silently dropped where it was not.

## Accepted pattern — the Part 72 pattern, reused verbatim

1. **Validate it.** A boolean when present, rejected otherwise, for every kind — placed inline beside the existing `allow_not_required` check in `validateAction`, its closest analogue (both are plain action-root booleans). This is the one behaviour change an existing app could notice: `show_comment: "false"` used to be accepted and truthy, and now fails the build. That is the intended correction — a quoted `"false"` was never honoured as `false`.
2. **Carry it on the runtime blob.** Added to `ACTION_FIELDS`, so it lands on `actionConfig` and `GetWorkflowAction` can see it.
3. **Resolve it per read** on the `GetWorkflowAction` envelope (`actionConfig.show_comment ?? true`) and gate the check surfaces on `_state: current_action.show_comment`.
4. **Normalize once at build time** for form pages (`action.show_comment ?? true` in `makeActionPages`), and drop the `default: true` fallbacks from the three form-template reads. The default now lives in exactly **two** code sites instead of four.

**Nothing is persisted.** Like `description` (Part 64) and `universal_fields` (Part 72), the flag lives in the workflow YAML, never on the action document — so an author's change applies to in-flight actions with nothing to migrate.

### No `resolveShowComment.js` module

Part 72 added `plugins/.../shared/render/resolveUniversalFields.js` because its value is three-shaped (`undefined` → both, `false` → none, array → verbatim) and the build-time and read-time normalizers had to be provably identical. A `?? true` does not earn a 47-line module. The coupling is carried by lock-step comments at both sites instead. If a third presence knob appears, revisit — two is not yet a pattern.

### Runtime `visible`, not `_build.if`

Unchanged from Part 72 D: `components/comment-input.yaml` already exposes a `visible` operator var that gates both the input and the shared/internal toggle, so **no component change was needed** — unlike the universal-fields components, which had to grow root gates. The check surfaces pass an `_or` whose edit and review branches are AND-ed with `_if_none: [{_state: current_action.show_comment}, false]`. The `_if_none` default of `false` keeps the box hidden until the request resolves, so it never flashes and then vanishes.

## D1 — the mandatory comments are exempt

`show_comment` gates the **optional** comment box only. Two comment inputs always render:

- the reviewer's brief in the review-mode **Request Changes** modal (`current_action.change_request_comment` — its own state path, with a required-validate);
- the **recovery note** on an action sitting in the `error` stage.

Both are inputs the engine needs the text of; hiding them would break the flow, not de-clutter it. This is also exactly what the form templates already do — `error.yaml.njk` and the two request-changes modals were never gated on the flag. The rule was previously an accident of which `_ref` sites happened to be wrapped; this part states it and documents it.

**Rejected:** gating the check comment in all three modes with a single expression. Simpler to write, but it would hide the error-stage recovery note on check while the form error page still shows it — a kind-dependent divergence in exchange for three fewer lines of YAML.

## Rejected alternatives

Both were already argued down in Part 72 and are rejected here for the same reasons, recorded so the question is not reopened:

- **Bake a `{workflow_type: {action_type: bool}}` map into both surfaces.** Puts every action's config on every page, and the modal is host-dropped so the host would have to carry the map too.
- **Emit per-check-action pages.** Reverses Part 56 D3, changes page IDs and deep-link URLs, and requires reworking `computeEngineLinks`.

## Audit — which top-level action properties apply to which kinds

The investigation that produced this part swept every top-level action key. Recorded here so the question is answered once rather than re-asked per field.

| Property                                                                                   | Status on non-form kinds                                                                                                                                                                     | Verdict                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `show_comment`                                                                             | silently ignored on check; unvalidated                                                                                                                                                       | **this part**                                                                                                                                                  |
| `description`                                                                              | already works on check via the envelope (Part 64)                                                                                                                                            | no gap                                                                                                                                                         |
| `hooks`, `event`                                                                           | already work on check — they ride the shared `{workflow_type}-submit` endpoint, not pages                                                                                                    | no gap                                                                                                                                                         |
| `allow_not_required`, `blocked_by`, `action_group`, `title`, `key`, `required_after_close` | on `ACTION_FIELDS`, engine-resolved for every kind                                                                                                                                           | no gap                                                                                                                                                         |
| `pages.{verb}.buttons.{signal}.visible` / `.disabled` / `.modal`                           | silently dropped on check                                                                                                                                                                    | structurally form-only — an operator tree or block tree cannot cross a JSON envelope and be re-evaluated (Part 46)                                             |
| `pages.{verb}.formHeader` / `formFooter`                                                   | silently dropped — and `docs/workflows/reference/authoring-grammar.md` **falsely claims** these are rejected at build time on non-form kinds. The only kind guard is `validateButtonsExtra`. | form-only (arbitrary block trees), but the missing `fail()` is a real defect → **follow-on ticket**                                                            |
| `pages.{verb}.buttons.{signal}.successMessage` / `.title`                                  | silently dropped on check; docs declare check toasts fixed                                                                                                                                   | plain strings, so they _could_ travel keyed by signal — but no concrete need exists. Reject at build time rather than build the surface → **follow-on ticket** |
| `pages.edit.validate_on_draft`                                                             | inapplicable — a check surface has no `form.*` state and no Save Draft (its `progress` button is "Mark Started")                                                                             | form-only; add the missing `fail()` → **follow-on ticket**                                                                                                     |
| `interactions`                                                                             | dead for **every** kind since Part 32 collapsed the status-override layers; still copied onto `action_config`, read by no template, listed in two stale comments                             | delete the residue → **follow-on ticket**                                                                                                                      |
| `notification_roles`                                                                       | documented in `docs/workflows/concepts/access.md` with **zero readers on any kind** and no validation                                                                                        | implement or delete the docs → **follow-on ticket**                                                                                                            |

The four follow-on tickets share one principle, the one Part 36's review stated and Part 72 restated: **a silently-dropped authored key is the defect.** Each should either honour the key or `fail()` on it. None of them is a check-parity gap — `show_comment` was the only property in that class.

## Demo and test coverage

Per-action independence on a **shared** page is the property worth guarding, so both consumers pair a `false` action with a defaulted one in the same workflow:

- **`apps/demo`** — `company-setup/kickoff-call.yaml` declares `show_comment: false`; its sibling `assign-account-manager.yaml` leaves it defaulted. Both are check actions on the one `company-setup-action` page. (This is the pairing Part 72 introduced for `universal_fields`; the two fields now cover the same two actions.)
- **`apps/workflows-test`** — `knob-behaviors` gains `quiet-check` (`false`) and `loud-check` (defaulted), asserted in `e2e/workflows/knob-behaviors.spec.js` on the one `knob-behaviors-action` page. The e2e flips each surface into **edit** mode before asserting, because the mode gate alone would otherwise satisfy a "hidden" assertion.
