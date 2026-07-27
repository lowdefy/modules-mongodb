# Review 1 — Cross-checks against shipped parts 16 / 17 and the user-admin schema

Parts 16 (`page-templates`), 17 (`shared-pages`), and 18 (`entity-components`) are already in `_completed/` and ship a stub at `modules/workflows/components/universal-fields/universal-fields.yaml`. The shipped templates already `_ref` this stub with the exact vars the design specifies (`mode`, `kind`, `action_data`). Most of the design lines up with what's in-tree; the findings below are the gaps and contradictions that fall out of comparing the design to the shipped neighbours and to the user-admin schema this part wants to consume.

## Contradictions with shipped neighbours

### 1. `required_after_close: true` is unreachable through the UI as currently specified

> **Resolved.** The design was conflating two axes — `required_after_close` is about workflow-close (it exempts the action from `CloseWorkflow`'s sweep and lets `SubmitWorkflowAction` accept writes when the workflow is `completed`/`cancelled`), not about the action's own stage going terminal. A surviving action keeps its non-terminal stage, so the existing editable-stage allowlist already lets it through — no URL-guard exception needed. Rewrote the lifecycle section to say so explicitly and dropped the "remains editable on the edit page even after terminal status" claim. Editing universal fields on a `done` / `not-required` action remains out of scope in v1 (the deferred `-metadata` surface is the right home if a real app asks).

The "Lifecycle rules" section says:

> When `required_after_close: true`, the universal-fields band remains editable on the action's `edit` page even after terminal status; the engine's role gate is the only thing standing between the user and the write.

But part 16's stale-URL guard on `edit.yaml.njk` is hard-coded to redirect to `-view` whenever `status[0].stage` isn't in `[action-required, in-progress, changes-required]` — `done` and `not-required` aren't in that list. The shipped task-edit page (`modules/workflows/pages/task-edit.yaml:36-51`) has the same allowlist and the same redirect. So an action sitting in `done` with `required_after_close: true` never reaches the universal-fields band — the page bounces to `-view` in step 3 of the onMount sequence.

The escape hatch that already exists is `_input: skip_status_redirect`, which the review page's `Edit` button passes (`modules/workflows/templates/edit.yaml.njk:64-66`). That keeps the door open for reviewers round-tripping during `in-review`, but nothing in v1 sets that flag for `done` / `not-required` actions.

Either:

- The lifecycle table needs to spell out that **post-close edits require an extra navigation path** that sets `skip_status_redirect: true` (an "Edit metadata" affordance on the view page that the design has explicitly deferred under "Out of scope"), OR
- The edit template's allowlist needs an exception when `action.required_after_close === true`, and that exception needs to be added as a contract change on part 16.

As written, `required_after_close: true` only takes effect when the user can already get to the edit page — which is "the stage was non-terminal when the page loaded and then went terminal mid-edit." That's a much narrower contract than the design implies, and it should either be stated narrowly or the URL guard needs to be relaxed.

### 2. `event.metadata.fields_diff` doesn't exist

> **Resolved.** Dropped the `fields_diff` claim. The decision to keep universal-field writes on `submit_edit` stands on its other reasons (one write per user submit, single logical edit). Replaced the third bullet with an honest trade-off statement: today's engine-default timeline row shows status + comment; apps that need universal-field changes surfaced on the timeline use the pre-hook → `event_overrides` path (part 9) to stamp a custom title. A richer engine-default template that surfaces metadata diffs out of the box is left as a future engine-level enhancement, out of scope for part 24.

The "Interaction model" section justifies keeping universal-field writes on `submit_edit` by promising:

> The event-timeline cleanliness concern (assignee change blurs into status change) is solvable by surfacing the metadata diff in the event payload (`event.metadata.fields_diff`) rather than splitting interactions.

`fields_diff` is mentioned exactly once in the entire repo — in this design. It's not in part 6's design, part 13's design, part 9's `buildDefaultLogEventPayload`, or any shipped handler code. The decision is presented as "solved" but the implementation channel is unspecified and not staged on any other part.

Either drop the `fields_diff` claim (and accept that the event timeline shows status changes only, with universal-field updates inferable from the action-doc state), or add a concrete contract: where `fields_diff` is computed (handler step 5/6?), what shape (`{ field: { from, to } }`?), and which part owns the change. Without one of these, "keep writes on `submit_edit`" rests on a feature that doesn't exist.

## Schema / wiring errors in the assignees Selector spec

### 3. `profile.avatar` doesn't exist — the field is `profile.picture`

> **Resolved.** Corrected `user.profile.avatar` → `user.profile.picture` in the Selector return shape (per `contact-fields.md:33`).

Under "Display rules":

> **Assignees**: display mode shows avatar group + names (via the user-admin module's `user-avatar` component); edit mode shows a `Selector` populated from `users` — the request id is `selector_assignees`...

And under "Module-shipped requests added":

> ...returning `{ value: user._id, label: user.profile.name, avatar: user.profile.avatar }`

Per the contact-fields guide (`apps/demo/.claude/guides/contact-fields.md:33`), the auto-generated DiceBear avatar lives at `profile.picture`, not `profile.avatar`. `profile.name` is correct (computed `given_name + " " + family_name`).

### 4. `user-avatar` component doesn't exist; the existing one is `profile-avatar` in user-account

> **Resolved.** Part 24 now `_ref`s a new `user-avatar` component shipped by [part 24a](designs/workflows-module/parts/_completed/24a-user-account-selector-avatar/design.md) in the user-account module. Distinct from `profile-avatar` (which is a config fragment bound to the logged-in user and stays for the layout module's profile-menu slot). `user-avatar` takes a user-contacts doc via `vars.user` and renders picture + name.

The design says display mode renders "via the user-admin module's `user-avatar` component". `grep -r 'user-avatar' modules/` returns nothing. There is a `profile-avatar` component in `modules/user-account` (`designs/_completed/profile-menu 1/design.md:44`), but no `user-avatar` in user-admin. The design either needs to (a) name the existing component correctly and the module that ships it, or (b) commit to shipping a new avatar component as part of this part (and add it to "Component shipped").

### 5. `selector_assignees` duplicates an existing component without justification

> **Resolved.** Dropped the planned `selector_assignees.yaml` request entirely. Part 24's edit mode reuses the shared `user-selector` component instead. [Part 24a](designs/workflows-module/parts/_completed/24a-user-account-selector-avatar/design.md) migrates that selector from user-admin to user-account (user-account is universally present across apps; user-admin is optional) and Part 24 declares the new home as a dependency. The "Module-shipped requests added" section now reads "None."

The user-admin module already ships `components/user-selector.yaml` backed by `requests/get_users_for_selector.yaml`, which:

- Queries `user-contacts-collection` via `_module.connectionId: user-contacts-collection`.
- Filters to `apps.{app_name}.is_user: true` — i.e. only people who are users of this app.
- Returns `{ value: $_id, label: "${given_name} ${family_name} (${email})" }` sorted by label.

The proposed `requests/selector_assignees.yaml` would be a near-duplicate. Either:

- Reuse `user-admin/components/user-selector` (with an optional `vars.label` to swap to `profile.name`), drop the new request, and document the dependency, OR
- State explicitly _why_ a duplicate is needed (e.g. "we want avatar in the Selector, the user-admin one doesn't expose it"), and add the missing pieces to the user-admin selector instead of forking.

### 6. Missing `is_user` filter would assign actions to non-app users

> **Resolved.** Moot after #5 — the new design reuses user-account's `user-selector` (migrated from user-admin in part 24a), which already filters on `apps.{app_name}.is_user: true`. Documented this in part 24's "Display rules" bullet so the dependency is visible.

The proposed request matches the `user_contacts` collection with no filter clause shown. Per the data model, that collection holds **every contact** — including invited-but-not-signed-up people and contacts who aren't users of this app. Without `apps.{app_name}.is_user: true`, the Selector would let an author assign an action to a contact who can't log in. The existing `get_users_for_selector` already gates on this; the new request needs the same gate. The design should spell this out so the implementer doesn't re-discover it during code-review.

### 7. Cross-module connection wiring not addressed

> **Resolved.** Added a "Manifest dependency" sub-section: workflows gains `user-account` under `dependencies:`. No cross-module `connectionId` ref needed at the call site — both consumed components (`user-selector`, `user-avatar`) encapsulate their own connection wiring inside user-account. Part 24a is the carrier for the user-account-side changes.

`modules/workflows/module.lowdefy.yaml` declares only `layout` and `events` as dependencies (lines 23–27). The shipped workflows module owns `workflows-collection` and `actions-collection` connections — it doesn't own `user-contacts-collection`. To query that collection from a request shipped by workflows, the manifest needs a dependency on user-admin (or contacts) plus a cross-module connection reference (`_module.connectionId: { id: user-contacts-collection, module: user-admin }`). Neither is mentioned in the design. This is the load-bearing wiring step that turns "ship a selector request" from a one-file change into a contract amendment on the module manifest — it deserves its own bullet under "Module-shipped requests added".

## Underspecified surface

### 8. `kind: form` vs `kind: task` — design doesn't say what the var changes

> **Deferred to open questions.** Pending a separate discussion on whether universal-field writes on form-kind actions should split off from `submit_edit` into their own endpoint / interaction. If that resolves to a split, `kind` earns a real internal behavioural difference (which endpoint the band's submit-adjacent affordances target) and this finding flips to Resolved. If it resolves to "keep on the same endpoint," the `kind` var should be dropped as dead surface. See part 24 design.md → Open questions → "Universal-field writes on form-kind actions — same endpoint as `submit_edit`, or split?"

The "Component shipped" example takes a `kind` var (`'form' | 'task'`), but no section of the design says what differs between `kind: form` and `kind: task` _inside the component_. Per the ui spec (`workflows-module-concept/ui/spec.md:200-206`), the difference is positional — form actions put the band above the form body, task actions put it as primary content with the status selector below. That's a _page-level_ composition choice owned by parts 16 / 17, not a component-internal switch.

If the component renders identically regardless of `kind`, the var is dead weight and should be dropped from the `vars:` contract. If it does change something (icon? title? badge styling?), the design needs to say what. As shipped, the stub takes `kind` and ignores it; the design needs to either commit to a difference or drop the var.

### 9. Edit-mode example only — display-mode `action_data` binding unspecified

> **Resolved.** Added a "Binding convention by mode" sub-section with both edit (`_state.fields.*`) and display (`_request: get_action.*`) examples.

The component example under "Component shipped" shows `mode: edit` with `action_data` bound to `_state.fields.*`. But every shipped `mode: display` call site binds `action_data` to `_request: get_action.*` instead (e.g. `templates/view.yaml.njk:107-113`, `pages/task-view.yaml:125-131`). Both are valid — display mode reads from the loaded action doc; edit mode reads from primed form state — but the design only documents one. Add a second example or a sentence stating "in display mode, callers pass `_request: get_action.*`; in edit mode, they pass `_state.fields.*`" so the contract is unambiguous.

### 10. `description`'s input block type and "show more" affordance are unspecified

> **Resolved.** Pinned blocks: edit mode renders `TiptapInput`, display mode renders an `Html` block reading `description.html`. Stored as `{ text: string, html: string } | null` on the action doc — same shape `comment` already uses through the engine, with a parallel one-line amendment to engine spec line 132 carried under this part. Dropped the "show more" affordance from v1; long descriptions wrap (deferred truncation logged in Open questions for the case where it becomes a real problem).

"Display rules" says description "displays via" some unstated mechanism and "long descriptions truncate in display mode with a 'show more' affordance." Edit mode says "short text input" — `TextInput`? `TextArea`? `Paragraph` (Lowdefy doesn't ship a "show more" block by default — does this require an `Html` block? A custom component?). For an M-sized component these are the kinds of decisions that should be locked, since the alternative is "implementer guesses, reviewer disagrees, rework."

Concretely: pick the Lowdefy block per side, and if "show more" requires custom rendering, name where it lives (this component, or an `Html` + `_js` toggle inside).

### 11. No required-field signal — some actions need a mandatory assignee

> **Resolved.** Added a "Required-field signal" sub-section. Each action declares `universal_fields_required: { assignees?: boolean, due_date?: boolean, description?: boolean }` on its YAML (mirrors the `required_after_close` pattern — reserved field, resolver passthrough). Page templates pass the resolved config into the universal-fields component as a new `required` var; the component stamps `required: true` on the matching input blocks, and Part 16's `^fields\.` Validate regex handles the user-facing message. Action-authoring spec gets a corresponding reserved-field amendment carried under this part. Engine-side handler enforcement is deferred to Open questions — v1 trusts the input-block validator, with a follow-up if real API consumers bypass the form.

The design takes no position on whether `assignees` / `due_date` / `description` can be required. The engine spec describes them as `string[]` / `Date | null` / `string | null` — all nullable — but real workflows often want "you can't submit until you've picked an assignee." There's no `required` flag on the component vars, no per-action knob, no validation declaration. Part 16's submit button validates `^fields\.` (line 226), which would fire `Required` if the input declared it — so the rails are there, just not exposed.

Either commit to "v1 universal fields are never required; apps that need this declare equivalent fields on `form:`," or add a `required: { assignees?, due_date?, description? }` var to the component contract.

## Documentation / link rot

### 12. Broken link to contact-fields guide

> **Resolved.** Updated the relative path to `../../../../apps/demo/.claude/guides/contact-fields.md`.

Under "Module-shipped requests added":

> ...the unified user record per [contact-fields guide](.claude/guides/contact-fields.md)

The relative path from `designs/workflows-module/parts/24-universal-fields/design.md` resolves to `designs/workflows-module/parts/24-universal-fields/.claude/guides/contact-fields.md` — which doesn't exist. The actual file is at `apps/demo/.claude/guides/contact-fields.md`. Should be `../../../../apps/demo/.claude/guides/contact-fields.md` (or whatever the canonical pointer is once a project-level guides location is settled).

## Smaller things

### 13. "alongside the part-16 requests" is misleading

> **Resolved.** Bullet now states the request is a Selector options source, distinguishes it from the part-16 page-load requests, and clarifies "alongside" refers to file location only.

The design says `selector_assignees.yaml` ships "from the workflows module's `requests/` directory alongside the part-16 requests." Part 16's three requests (`get_action`, `get_workflow`, `get_entity`) are page-load requests for action / workflow / entity docs — `selector_assignees` is a _Selector option source_, queried from inside a single input block. The naming convention `selector_<thing>` exists for a reason (per CLAUDE.md). The framing "alongside" is fine for file location; it's misleading about the request's role. A one-liner clarifying that this is a Selector source (not a page-load request) would help future readers and the implementer.
