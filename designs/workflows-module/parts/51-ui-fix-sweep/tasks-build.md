# Part 51 — Build list (ready now)

Mechanical/specified fixes with no open decisions. Work top-to-bottom; heavier items at
the bottom. Grouped by surface so commits stay per-package. Verify config with
`pnpm ldf:b` from `apps/demo`. See `design.md` for detail per fix.

## Block plugin (`plugins/modules-mongodb-plugins/src/blocks/...`)

- [x] **F4** — Timeline action affordance renders as a button, not a text link. `EventsTimeline.js:376-408` (`affordanceStyle` `<a>`/`<Link>`). Status-tinted button (mid-tone fill, accent text).
- [x] **F5** — Drop the informal "Go" default affordance title. `EventsTimeline.js:374` — now defaults to "View".
- [x] **F23** (D3) — `ActionSteps` pulls status colours from the shared `action_statuses.yaml` enum (new `actionStatusConfig` prop) instead of its hardcoded `actionStatusColorMap`. Removed the duplicate map; enum already has a distinct teal `in-progress`. Wired in `actions-on-entity.yaml`.

## Timeline ordering / engine (engine + module)

- [x] **F15** — Lead timeline reversed; latest belongs at top. Double-reverse bug: `GetEventsTimeline.js` `$sort:{date:-1}` + `workflows-events-timeline.yaml:93-96` `reverse:true` + `EventsTimeline.js:685`. Pick one place to reverse. **Fix:** engine `$sort:{date:-1}` stays the single source of truth; changed `workflows-events-timeline.yaml` `reverse` var default `true`→`false` so the block renders in array order (latest at top). Var kept for opt-in oldest-first.
- [ ] **F12** — Timeline action order follows workflow order (currently events `date`-desc, cards by `sort_order` only within an event). `GetEventsTimeline.js`.
- [ ] **F7** (D-resolved) — Timeline avatars resolve via the engine instead of falling to initials. Add a `$lookup` in `GetEventsTimeline.js` on the event user id → `user-contacts._id`, projecting `profile.picture` into `event.created.user.picture` (block reads `user.picture` at `EventsTimeline.js:85`, falls back to `getInitials` when absent). Code-time: (1) confirm join key `event.created.user.id` === `user-contacts._id`; (2) ensure the connection resolves the `user-contacts` collection name (it currently targets the events collection).

## Module YAML (`modules/...`)

- [ ] **F1 / F2 / F6** (D1) — Route action template pages + overview/group-overview through the shared title-block with a real title and `show_back_button: true`. Retire hand-rolled `entity_back_button`. `templates/{view,edit,review,error}.yaml.njk`, `workflow-overview.yaml:137-152`, `workflow-group-overview.yaml:132-147`.
- [ ] **F8** (D4) — Fuller workflow-overview header (more than just "Onboarding"). `workflow-overview.yaml:63-74`.
- [ ] **F9** — Overview action cards: add gap + group by action group. `workflow-overview.yaml:153-294`.
- [ ] **F17** — Fix actions-on-entity header wrapping onto the steps. `components/actions-on-entity.yaml:34-127`.
- [ ] **F20** (D4) — Surface each action's title/`description` alongside the status message on cards, rows, and ActionSteps. `kickoff-call.yaml:13-15` + card/row/ActionSteps render.
- [ ] **F11** (D-resolved) — Qualify "Contact name" → reusable contact field. New `components/fields/contact.yaml` wrapping the contacts module's `contact-selector` export (`_ref: { module: contacts, component: contact-selector }`), storing denormalized `{ contact_id, name, email, verified }`; passes field vars (id, label, required) through. Add a `contacts` dependency to the workflows module manifest. `apps/demo/.../onboarding/qualify.yaml:15-18`. Open sub-detail (non-blocking): final var pass-through surface, and whether to also expose `basic-contact-selector` for read-only pick-existing later.
- [ ] **F22** (D-resolved) — Timeline cards open the check-action modal instead of navigating; handler baked into both hosts, no consumer onclick. Extract the kind-branch handler into shared `components/check-action-click.yaml` (`check` → SetState `check_action_modal.action_id` + CallMethod `setOpen`; else → Link to `action.link`) and wire it by default into both `actions-on-entity.yaml` (replacing inline copy lines 73-105) and `workflows-events-timeline.yaml`. **Delete `on_action_click`** (var + its `_build.if` null-guard, wrapper lines 64-78) from the component and the manifest. Add **`include_modal` flag** (default `false`) on `workflows-events-timeline`: when `true`, the wrapper bundles the `check-action-modal` `_ref` itself (for timeline-only pages). Document the rule "set `include_modal: true` on a timeline with no action surface" in manifest + README. Demo `lead-view.yaml` already mounts `actions-on-entity` (the modal) → leave `include_modal` default, nothing to add.
- [ ] **F19** (D2, partial) — "Assign account manager" check action. **(1)** Add an Edit affordance to `check-action-surface.yaml` view mode (parity with the form `view.yaml.njk` `button_edit`). **(2)** Modal opens in `view` despite correct data — runtime shape mismatch; fix via live env: right after open, inspect `current_action.status.0.stage` (expect `"action-required"`; confirm `status` is a newest-first array) and `current_action.allowed.edit` (expect boolean `true`; confirm `allowed` arrives at the top level of the modal's `GetWorkflowAction` response) — `check-action-modal.yaml:56-65,91-125`. Cause **(3)** empty body deferred to Part 24 (universal-fields stub).

## Demo (`apps/demo`)

- [ ] **F25** (D7) — Polish demo create/lifecycle event messages (verb-led, distinguishable) + lean on `event_types` icon/colour. ("Test 2 created" barebones.)
- [ ] **F18** (D-resolved) — Billing-details submit updates the company doc via a `submit` **post-hook** (not pre-hook, not the dropped `entity_update`). `hooks: { submit: { post: { routine: [ MongoDBUpdateOne, ... ] } } }` against the companies collection — read entity id + billing fields off `buildHookPayload.js` (`context.workflow`/`context.action` + submitted form data), `$set` with a `change_stamp`. `apps/demo/.../company-setup/billing-details.yaml`. First post-hook precedent in the repo. Authoring detail: exact `_payload` paths off `buildHookPayload.js` at write time.

## Heavier — forms / file upload (do last)

- [ ] **F16** (D5) — File upload broken: `upload_files` request not on page. Template must provide the S3 upload (and download) request(s) when a form has a file field, built-in. `file_upload.yaml`, `templates/edit.yaml.njk`. **Root — do first in this cluster.**
- [ ] **F13** — Quote action gets a file upload. Demo config only, after F16. `apps/demo/.../onboarding/send-quote.yaml:14-21`.
- [ ] **F10** — Submit returns to the entity + shows a success prompt, built-in. `templates/edit.yaml.njk` submit/modal `onClick`/`onOk`.

## Lowdefy / theme (fix in the lowdefy repo, not this module)

Not a workflows-module bug — the workflows config plumbs `required`/`validate` through correctly. Root cause is app-wide Lowdefy/theme. Listed here so they're not lost; fix lands in the lowdefy repo / demo theme.

- [ ] **F14** — Validation indicator colour is wrong.
- [ ] **F21** — Required red star (asterisk) on required fields.
