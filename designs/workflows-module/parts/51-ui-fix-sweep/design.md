# Part 51 — UI / bug fix sweep

A batch of UI and behavioural defects found while exercising the workflows module through the demo (onboarding + company-setup flows). Most are small surface fixes; a few expose real module gaps (file-upload request plumbing, check-action surface dead-ends) and one cluster is blocked on **Part 24** (the universal-fields renderer is still a stub). This part collects them, groups them by theme, and triages scope — separating genuine module fixes from a Part 24 dependency and from an app-wide Lowdefy/theme bug that does not belong here.

## Proposed change

Grouped by theme (detail + verified file locations in [Fix catalogue](#fix-catalogue)):

1. **Title + back-link consistency** — action template pages and the overview/group-overview pages bypass the shared title-block; route them all through the title-block with a proper back link (F1, F2, F6).
2. **Timeline rendering & ordering** — in the `EventsTimeline` block: render the action affordance as a button, drop the informal "Go" default, resolve the user avatar `src`, and fix ordering so the latest entry is at the top and action order follows the workflow (F4, F5, F7, F12, F15); wire the demo timeline to open the check-action modal instead of navigating (F22).
3. **Overview & action cards** — give the workflow-overview a fuller header, add gap and action-group grouping to the overview cards, fix the actions-on-entity header that wraps onto the steps, rewrite the `blocked`-status messages so they describe the action instead of naming the blocker, drive `ActionSteps` status colours from the shared enum, and fix the wrong "no data" empty states on done actions in the overview cards (F8, F9, F17, F20, F23, F26).
4. **Forms — file upload & submit lifecycle** — wire the S3 upload (and download) request into the action template so `file_upload` fields work, make submit return to the entity with a success prompt built in, and add a contact-selector field (F10, F11, F13, F16).
5. **Demo config** — add a billing-details → company-doc hook (F18).
6. **Event message copy** — rework engine default event titles into per-signal verbs from human titles ("Sam Tolmay submitted Send Quote") instead of "marked send-quote as in-review" (F24 — **done in [Part 53](../_completed/53-titles/design.md)**); polish the demo/events create + lifecycle messages so events are distinguishable (F25).
7. **Check actions (Part 24-bound)** — the check-action surface is non-functional for no-form check actions because universal-fields is a stub, the view surface is a dead-end with no edit affordance, and the in-context modal opens in `view` mode despite correct data (F3, F19). Scope decision required (see [D2](#d2)).

Explicitly **excluded**: the required-label / validation-indicator defect (F14, F21) — it is an app-wide Lowdefy/theme bug, not a workflows-module issue (see [Non-goals](#non-goals)).

## Key decisions

### D1 — Consolidate title + back link onto the shared title-block {#d1}

F1 (no title on action template pages), F2 (no back button on the form template), and F6 (awkward standalone back button on the overview pages) are one underlying gap: the shared title-block (`modules/shared/layout/title-block.yaml`) already supports `title`, `page_actions`, and `show_back_button`, but the action templates set `hide_title: true` / pass no title, and the overview pages set `hide_title: true` and hand-roll a header + a standalone `entity_back_button`. Fix once: render these surfaces through the title-block with a real title and `show_back_button: true`, and retire the hand-rolled back buttons. One mechanism, consistent placement.

### D2 — Check-action scope: fix the surface here, leave the field body to Part 24 {#d2}

F19 ("Assign account manager" is fully broken) decomposes into three causes, two of which are fixable here and one of which is Part 24:

- **Empty body (Part 24).** A `kind: check` action with no `form:` renders its entire interactive body through `components/universal-fields/universal-fields.yaml`, which is the **Part 24 stub** (`Box, visible:false`). Until Part 24 ships, check actions have no fields. Same root as F3. **This part does not absorb the universal-fields renderer** — it depends on Part 24 for the body. (Alternative considered: pull a minimal renderer forward into Part 51 — rejected as scope creep that would collide with Part 24's design.)
- **View-surface dead-end (fix here).** `check-action-surface.yaml` in `view` mode exposes no signal buttons and **no edit-nav affordance** — unlike the form view template (`view.yaml.njk`) which has a `button_edit`. Add an Edit affordance to the check surface's view mode so a viewed check action is never a dead-end.
- **Modal opens in view mode (fix here, needs live debug).** The defect is reproduced via the actions-on-entity **modal** (also on `schedule-followup`). The live action doc is correct — `status[0].stage = action-required`, `access.demo = {view, edit: true}`, `demo.links.edit` present, `kind: check` — so `allowed.edit` is `true` and the modal's `set_mode` *should* derive `edit`. It derives `view` instead. The engine and data are verified correct; the bug is in the modal's `onOpen` → `set_mode` runtime path (`check-action-modal.yaml:91-125`) — either `current_action` is missing `allowed`/`status` when `set_mode` runs, or the nested `_if`/`onOpen` ordering misfires. Resolve by inspecting `current_action` state immediately after the modal's open handler in a running env.

### D3 — One palette for action status, sourced from the enum {#d3}

`ActionSteps` hardcodes its own `actionStatusColorMap` (`ActionSteps.js:18-27`), where `action-required` (`--ant-color-primary`) and `in-progress` (`--ant-color-info`) are both blue and read as the same colour (F23). Every other surface (overview cards, check-surface, timeline) pulls colours from the shared `action_statuses.yaml` enum. **Decision (user): ActionSteps uses the enum too** — single source of truth, with a distinct teal in-progress defined in the enum. Removes the duplicate map and the drift it caused.

### D4 — Status messages describe the action; don't render extra titles {#d4}

A blocked action shows only its `status_map` message ("Awaiting account manager assignment.") — which describes the *blocker*, never the action itself (F20). An earlier revision of this part proposed surfacing the action's `title`/`description` alongside the status message on cards, rows, and ActionSteps. **Reversed (user):** the status message *is* the action's label everywhere it appears, so don't render extra titles — fix the message instead. The message should describe the action; "blocked by XYZ" copy that only names the blocker is simply a bad message. Rewrite the offending `status_map` entries — chiefly the `blocked` messages — to lead with the action and fold the gating condition in ("Schedule the kickoff call once an account manager is assigned."). Copy-only; no rendering change. (F8, a thin overview *header*, is a separate header fix — not part of this.)

### D5 — File fields need request plumbing in the template, built-in {#d5}

F16 (file upload in "upload PO" errors: request not defined) is the root cause of F13 (quote should have a file upload — it would hit the same wall). The `file_upload` field renders an `S3UploadDragger` with `s3PostPolicyRequestId` defaulting to `upload_files`, but the action template (`edit.yaml.njk`) defines only `get_workflow_action` + `get_entity`. **The template must provide the S3 upload (and download) request(s) when a form contains a file field** — built in, not author-configured. Fix F16 first; F13 then becomes a demo-config addition. (The symmetric `file_download` field likely needs an S3 get-policy request too.)

### D6 — Rework default event messages: per-signal verbs from human titles {#d6}

> **Superseded by [Part 53 — Titles strategy](../_completed/53-titles/design.md) (implemented).** The per-signal verb map and human-title plumbing described below shipped there: `planEventDispatch.js`'s `DEFAULT_SIGNAL_TITLES` replaced the `action-event` catch-all, and the action `title` is resolved build-time (`makeWorkflowsConfig.js`, `action.title ?? humanizeSlug(type)`) — resolving the F24 open question toward **optional with a `humanizeSlug(type)` fallback**. Retained here for history only; no work remains in Part 51.

The engine's default event titles (`planEventDispatch.js:13-23`, `DEFAULT_TITLES`) are barebones and machine-y on two axes (F24): (a) a **single** generic template — `DEFAULT_TITLES['action-event']` = "marked {{ action.type }} as {{ status_after }}" — is applied to *every* submit signal (`:139`), even though the event type is already `action-${signal}` (`:137`) so the signal is known; and (b) it interpolates raw machine values (`send-quote`, raw stage `in-review`, `workflow_type`). Result: "Sam Tolmay marked send-quote as in-review". Lifecycle events ("Sam Tolmay started onboarding") are similarly thin.

Rework in three layers:

1. **Per-signal verb templates** — use the signal (already on the event type) to pick a natural verb instead of "marked … as …":
   - `submit` → "submitted **{action title}**" (or "completed" when `status_after === done`)
   - `approve` → "approved **{action title}**"; `request_changes` → "requested changes on **{action title}**"
   - `progress` → "started **{action title}**"; `not_required` → "marked **{action title}** as not required"
   - `resolve_error` → "resolved an error on **{action title}**"
   - lifecycle: "started **{workflow title}**", "cancelled **{workflow title}**", "closed **{workflow title}**"
2. **Human titles, not enum/type values** — action `title`, workflow config `title` (already exists — use it instead of `workflow_type`), and the stage's `.title` from the `action_statuses` enum (make the enum available to the planner render context).
3. **Action short title** — actions have no human title today (only `type` + a longer `description`). Add a `title` to the action config, used by these templates. Whether it is **required** vs **optional with a `type`-prettified fallback** is an open question (below).

The engine already has a 3-source override chain (engine default → YAML `event_overrides[signal]` → pre-hook return), so apps can already customise per signal — this only improves the **defaults**.

This is an engine change (per-signal templates + richer render context) plus a config-schema addition (the action `title` var, documented in the manifest).

**Entity in the message — deferred (recommendation).** Including the entity name + a link ("…for Acme Corp") was considered and is **not** proposed for now: the timeline almost always renders on the entity's own page (lead-view, company-view), where naming the entity is redundant. The entity link only earns its keep in a cross-entity feed (global activity page, notifications) that does not exist yet — "build for what exists." It would also require an app-supplied `entity_page_url`-style var (cf. `contact_page_url` for avatars). Revisit when a cross-entity feed lands.

### D8 — Overview card body: fix the two wrong "no data" states on done actions {#d8}

Both overview pages render an action-card body that is one of: `body_dataview` (DataDescriptions) when `workflow.form_data[type|type.key] != null`, else `body_empty` (the literal "No data submitted yet."). On **done** actions both branches misfire (F26):

- **Form action with data → "No data to display".** That string is DataDescriptions' own empty state (`DataDescriptions.js:24-25`), which fires when no fields resolve. Both overview connections set `form_meta = actionConfig?.form_meta ?? null` identically (`GetWorkflowOverview.js:100`, `GetWorkflowActionGroupOverview.js:86`), so this is shared, not a group-vs-workflow divergence. **Leading cause — DataDescriptions does not auto-render nested objects in the config path.** Because the card passes `form_meta` (a `formConfig`), DataDescriptions takes `buildStructureFromConfig` → `processConfigItems`, where a simple `key` field whose value is a **plain object** is explicitly skipped (`processConfigItems.js:82-83` "Skip plain object"; `detectFieldType` returns null for bare objects). Nested structure renders **only** when the config declares it as a `section` / `box` / `controlled_list` (`key` + nested `form`). The old dataview-style recursive object walk (`buildStructureFromData:18-22`) runs **only when there is no `formConfig`** — never on the overview. So if a done action's `form_data` nests values under object keys while `form_meta` declares flat fields, every such field is dropped → empty groups → "No data to display". **Verify with a real done-action doc:** is `form_meta` non-null, and does the stored `form_data[type]` shape (from `planFormDataMerge`) nest objects under keys that `form_meta` declares as flat fields? **The fix direction is an open decision the user wants to own** (see Open questions) — whether DataDescriptions *should* auto-render nested objects even when a `formConfig` is present, or whether nesting must always be declared in config. Don't pick a fix until that behaviour is decided.
- **Check action → "No data submitted yet."** Check actions have no `form:`, so `form_data[type]` is correctly null and `body_empty` shows — but the message is wrong: a check action never *submits form data*; its content is the universal fields (assignees / due_date / description) + completion. Fix: for `kind: check`, don't render the "No data submitted yet." copy — show the check's fields (Part 24-bound) or a neutral completed state, not a missing-data message.

### D7 — Demo / events-module message polish is a separate layer {#d7}

The "can't tell which event is what" symptom and the barebones "Test 2 created" row at the top of a fresh timeline are **not** the workflows engine defaults — "Test 2 created" is an events-module *create* event for the lead, distinct from workflow events. Two fixes, both outside the engine templates: (a) lean on the `event_types` config (icon + colour per type) so event kinds are distinguishable at a glance; (b) give the demo's create/lifecycle events richer, verb-led messages. Tracked as a demo + events-config sub-item.

## Fix catalogue {#fix-catalogue}

Status legend: **module** = workflows-module fix; **demo** = demo-config change; **block** = plugin block change; **P24** = blocked on Part 24; **OOS** = out of scope (tracked elsewhere).

| ID | Summary | Where | Class |
|----|---------|-------|-------|
| F1 | No title on action template pages | `templates/{view,edit,review,error}.yaml.njk` (title from `page_config.title`, default null → `hide_title`) | module (D1) |
| F2 | No back button on the form template | same templates — `show_back_button` never passed (`page.yaml:222-225`) | module (D1) |
| F3 | Comment/body whitespace on action template | `components/universal-fields/universal-fields.yaml` is the Part 24 stub | P24 |
| F4 | Timeline action link renders as text link, not button | `EventsTimeline.js:376-408` (`affordanceStyle` `<a>`/`<Link>`) | block |
| F5 | "Go" default affordance title is informal | `EventsTimeline.js:374` (`(link && link.title) \|\| "Go"`) | block |
| F6 | Awkward standalone entity back button on overview pages | `workflow-overview.yaml:137-152`, `workflow-group-overview.yaml:132-147` | module (D1) |
| F7 | Timeline avatar `src` not resolved → initials placeholder | `EventsTimeline.js:78-123` (`user.picture` absent); likely `GetEventsTimeline.js` doesn't join avatar | block + engine |
| F8 | Workflow-overview title too thin (just "Onboarding") | `workflow-overview.yaml:63-74` | module |
| F9 | Overview action cards: need gap + group by action group | `workflow-overview.yaml:153-294` | module |
| F10 | Submit should return to entity + show success prompt, built-in | `templates/edit.yaml.njk` submit/modal `onClick`/`onOk` (no redirect/feedback) | module |
| F11 | Qualify "Contact name" should be a contact selector | `apps/demo/.../onboarding/qualify.yaml:15-18`; **no contact field exists** in `components/fields/` | module (new field) + demo |
| F12 | Timeline action order should follow workflow order | `GetEventsTimeline.js` (events `date`-desc; cards by `sort_order` only within an event) | engine |
| F13 | Quote action should have a file upload | `apps/demo/.../onboarding/send-quote.yaml:14-21` — blocked on F16 | demo (after D5) |
| F15 | Lead timeline reversed — latest should be at top | `GetEventsTimeline.js` `$sort:{date:-1}` + `workflows-events-timeline.yaml:93-96` `reverse:true` + `EventsTimeline.js:685` → double-reverse | engine + module |
| F16 | File upload broken: `upload_files` request not on page | `file_upload.yaml` needs `upload_files`; `templates/edit.yaml.njk` doesn't define it | module (D5) |
| F17 | actions-on-entity header wraps onto the steps | `components/actions-on-entity.yaml:34-127` (title + button + ActionSteps flat siblings) | module |
| F18 | Billing-details submit should update the company doc (hook) | `apps/demo/.../company-setup/billing-details.yaml` (no hooks) | demo |
| F19 | "Assign account manager" check action fully broken | see [D2](#d2) — modal mode bug + dead-end view surface + P24 body | module + P24 |
| F20 | Blocked action message names the blocker, not the action | demo `status_map.blocked` messages (`kickoff-call.yaml`, `send-quote.yaml`, `schedule-followup.yaml`, `track-company-setup.yaml`, `upload-po.yaml`) — rewrite copy | demo (D4) |
| F22 | Timeline cards navigate to page instead of opening modal | Bake shared `check-action-click.yaml` handler into `actions-on-entity` + `workflows-events-timeline`; add `include_modal` flag; drop `on_action_click`. Demo page needs no wiring (`actions-on-entity` already mounts the modal). | module + demo (see decisions F22) |
| F23 | ActionSteps in-progress colour not distinct; use enum | `ActionSteps.js:18-27` hardcoded map | block (D3) |
| F24 | Default event messages barebones — per-signal verbs from titles | `planEventDispatch.js` (`DEFAULT_TITLES`) | **done in Part 53** (D6) |
| F25 | Demo/events messages indistinct ("Test 2 created" barebones) | events-module `event_types` + demo event authoring | demo (D7) |
| F26 | Overview cards: wrong "no data" empty states on done actions | overview pages `body_empty`/`body_dataview`; `form_meta` / `DataDescriptions.js:24-25` | module + engine (D8) |
| F14 | Validation indicator black, not green, on a new line | app-wide Lowdefy/theme | **OOS** |
| F21 | Required red star not showing on form items | app-wide Lowdefy/theme | **OOS** |

## Open questions

- **F19 modal mode bug** — needs a live env to inspect `current_action` after the modal `onOpen` handler. The data/engine path is verified correct; the bug is client-side in `check-action-modal.yaml`'s `set_mode`/`onOpen`.
- **F11 contact selector** — new reusable workflows field component (backed by contacts / user_contacts) vs. a demo-local selector wired to a contacts request? The field library has no person selector today.
- **F18 hook** — which side-effect primitive does the hook routine expose for an entity write (vs. `qualify.yaml`'s `:return:` action-spawn)? Confirm before authoring.
- **F22 design intent** — ~~should a standalone timeline default to modal-open or navigate?~~ **Resolved (see decisions F22):** the kind-branch handler is baked into both `actions-on-entity` and `workflows-events-timeline` by default (no consumer `on_action_click`); the modal stays a singleton mounted by `actions-on-entity`; a new `include_modal` flag (default false) lets a timeline-only page mount its own. Canonical entity page = zero-config.
- **F7 avatar** — confirm `GetEventsTimeline` is the place to join the user avatar `src` into each event's user.
- ~~**F24 action title** — should an action `title` be **required** on every action config (consistent authoring, no fallbacks) or **optional** with a `type`-prettified fallback?~~ **Resolved in [Part 53](../_completed/53-titles/design.md):** optional, with a build-time `humanizeSlug(type)` fallback (`makeWorkflowsConfig.js`); demo configs carry a `title` only where the slug humanizes wrong.
- **F26 — DataDescriptions nested-object behaviour (user to decide).** Today, with a `formConfig` present, DataDescriptions only renders nested structure that the config declares (`section`/`box`/`controlled_list`) and **drops plain object-valued fields** (`processConfigItems.js:82-83`); the recursive object walk runs only when there is *no* `formConfig`. **Decide the intended behaviour:** should DataDescriptions auto-render nested objects even when a `formConfig` is supplied (dataview-parity), or should nesting always have to be declared in config (and the form authoring/`form_meta` be responsible)? This drives the F26 form-action fix. *(User parked this to think about.)* Still verify, separately, whether `form_meta` is even non-null on the done-action card.

## Non-goals

- **F14 / F21 (required label + validation indicator)** — confirmed app-wide Lowdefy block/theme bug; the workflows plumbing (`makeActionsForm.js`, field components) passes `required`/`validate` through correctly. Track against the lowdefy repo / demo theme, not this part. (May bundle a demo-theme workaround only if the user asks.)
- **Shipping the universal-fields renderer** — that is Part 24; this part depends on it for the check-action body (D2).
- **Reworking the FSM, access model, or engine link computation** — all verified correct during this sweep; the fixes are presentational/wiring plus the file-request and modal-mode bugs.

## Related

- [Part 24 — universal-fields](../_next/24-universal-fields/) — blocks the check-action body (F3, F19).
- [Part 40 — simple/check action surfaces](../_completed/40-simple-action-surfaces/) — owns `check-action-surface.yaml`, `actions-on-entity.yaml`, the bundled modal (F17, F19, F22).
- [Part 46 — debundle workflow config](../_completed/46-debundle-workflow-config/) — created `workflows-events-timeline` + `GetEventsTimeline` (F4, F5, F7, F12, F15, F22).
