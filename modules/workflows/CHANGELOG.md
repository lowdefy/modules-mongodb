# @lowdefy/modules-mongodb-workflows

## 0.29.0

## 0.28.0

### Minor Changes

- [#166](https://github.com/lowdefy/modules-mongodb/pull/166) [`e0aa5d0`](https://github.com/lowdefy/modules-mongodb/commit/e0aa5d0b4e532da730a60dd7876b0becbedc6718) Thanks [@Saiby100](https://github.com/Saiby100)! - `controlled_list` form components now accept `itemTitle` — a Nunjucks template rendered against each list item on the read-only view/review/overview surfaces to title the item's collapsible card. The item's fields are the template context (plus `_index`, the 0-based position), so a title can reference multiple fields and emit HTML. HTML in the list's own `title` is rendered too.

  **Breaking:** the previous `itemKey` property is removed. Replace `itemKey: name` with `itemTitle: "{{ name }}"`.

### Patch Changes

- [#166](https://github.com/lowdefy/modules-mongodb/pull/166) [`7bb6733`](https://github.com/lowdefy/modules-mongodb/commit/7bb673334360d26ba991b7c8006adaf3228d9f8f) Thanks [@Saiby100](https://github.com/Saiby100)! - Fix the shared `check-action-click` handler so clicking a check action in the workflow-progress / actions-on-entity panel on an action page no longer logs `Cannot read properties of undefined (reading 'methods')`. The handler always tried to open the fixed `check_action_modal` block, but that block is only dropped on entity-view pages — on action pages the CallMethod ran against a missing block and threw. The modal open is now gated on being on an entity page (detected via absence of `_url_query.action_id`); check clicks on action pages navigate instead.

- [#166](https://github.com/lowdefy/modules-mongodb/pull/166) [`0373652`](https://github.com/lowdefy/modules-mongodb/commit/0373652c1d95f53447234b13d47ba8d92d1d3939) Thanks [@Saiby100](https://github.com/Saiby100)! - Fix `selector` form component so its `extra` helper text renders. `extra` was being passed as a top-level block property instead of under `label`, where the Selector block reads it — so the helper text never showed. It now nests under `label`, matching every other field component.

## 0.27.0

### Minor Changes

- [#164](https://github.com/lowdefy/modules-mongodb/pull/164) [`786e198`](https://github.com/lowdefy/modules-mongodb/commit/786e198e5e3eb77342e90999b195fc515e9ae83d) Thanks [@Saiby100](https://github.com/Saiby100)! - The `multiple_selector` form component takes a `disabled` var (boolean, default `false`), wired to the block's `disabled` property. With the var unset, behaviour is unchanged.

- [#164](https://github.com/lowdefy/modules-mongodb/pull/164) [`786e198`](https://github.com/lowdefy/modules-mongodb/commit/786e198e5e3eb77342e90999b195fc515e9ae83d) Thanks [@Saiby100](https://github.com/Saiby100)! - The `selector` form component takes a `disabled` var (boolean, default `false`), wired to the block's `disabled` property. With the var unset, behaviour is unchanged.

## 0.26.0

### Minor Changes

- [#161](https://github.com/lowdefy/modules-mongodb/pull/161) [`506a8a4`](https://github.com/lowdefy/modules-mongodb/commit/506a8a42ae37d1e427997080d22771239da887cc) Thanks [@Saiby100](https://github.com/Saiby100)! - The `button_selector` form component takes a `validate` var (array, default `[]`), wired to the block's top-level `validate` config. It mirrors the existing `text_input` pattern, so a button selector can carry field-level validation rules like every other input field. With the var unset, behaviour is unchanged.

- [#161](https://github.com/lowdefy/modules-mongodb/pull/161) [`506a8a4`](https://github.com/lowdefy/modules-mongodb/commit/506a8a42ae37d1e427997080d22771239da887cc) Thanks [@Saiby100](https://github.com/Saiby100)! - The `controlled_list` form component takes a `label_span` var (number, default `0`), following the existing `button` / `alert` convention. The outer `Label` wrapper gets layout `span: 24 - label_span` with `push: label_span`, so the whole field shifts into the input column and lines up with the labelled fields above it. With the var unset (`0`), rendering is unchanged.

- [#161](https://github.com/lowdefy/modules-mongodb/pull/161) [`506a8a4`](https://github.com/lowdefy/modules-mongodb/commit/506a8a42ae37d1e427997080d22771239da887cc) Thanks [@Saiby100](https://github.com/Saiby100)! - The `date_selector` form component takes a `disabled_dates` var (object, optional), passed straight through to the block's `disabledDates` property (`min` / `max` / `dates` / `ranges`) so a field can block ranges like past dates. It is wrapped in `_build.if`, so `disabledDates` is only emitted when the var is set and existing callers are unchanged. This also applies to `date_range_selector`.

## 0.25.1

## 0.25.0

## 0.24.0

## 0.23.1

## 0.23.0

## 0.22.0

### Minor Changes

- [#138](https://github.com/lowdefy/modules-mongodb/pull/138) [`254289d`](https://github.com/lowdefy/modules-mongodb/commit/254289dcc89444eb4efa294f6feda47db7db06b8) Thanks [@Saiby100](https://github.com/Saiby100)! - Five selectors in the form-components library — `selector`, `multiple_selector`, `button_selector`, `radio_selector`, `checkbox_selector` — now take an `enum` var as an alternative to `options`. An enum map (`slug → { title, color, icon }`) is converted to options for you: the title becomes the label, the slug is the stored value, the colour tints the selected value and the icon shows on a `multiple_selector` tag. `options` wins when both are set, and an operator-valued `enum` (`_global: enums.x`, `_module.var: y`) still resolves. `tree_multiple_selector` stays `options`-only: a flat enum map cannot express the `primaryKey`/`parentKey` hierarchy it exists for, and for flat choices `multiple_selector` renders enum colours and icons that the tree drops.

  On read-only surfaces, an enum-driven selector now shows the entry's title. The `DataDescriptions` block reads the field's `enum` map off the form config and renders the matching entry's `title`, colour and icon instead of formatting the stored slug — so a `status` of `in-progress` with title "In progress" no longer displays as "In Progress". Overview action cards carry the `enum` map through, so they resolve too. Nothing else changes: an `options`-driven selector, an unknown value, and a field with no `enum` all keep their existing display.

  **Breaking:** the `enum_selector` component is removed — it was a `Selector`-only special case of what `selector` + `enum` now does. Replace `component: enum_selector` with `component: selector` and keep the same `enum:` map. Two behaviour differences to expect: the label is no longer hardcoded to `align: right / span: 12` (declare `label_inline` / `label_span` if you relied on it), and the enum's colour now actually tints the selected value, which the old component's option shape never did.

## 0.21.0

### Minor Changes

- [#133](https://github.com/lowdefy/modules-mongodb/pull/133) [`66d0e4a`](https://github.com/lowdefy/modules-mongodb/commit/66d0e4a1bbe58c1bf3b21e51496812f17d56ea19) Thanks [@Saiby100](https://github.com/Saiby100)! - Honour `show_comment` on `kind: check` actions. The flag chooses whether an action's working surface offers the optional free-text comment box — it has worked on form actions since it shipped, but check actions silently ignored it and always rendered the box. Declaring `show_comment: false` on a check action now removes it, on both the standalone check page and the in-context check modal.

  Each check action's declaration is honoured independently even though one `{workflow_type}-action` page serves them all. The flag is resolved from workflow config on every read (like `description` and `universal_fields`), so it is never stored on the action document — change it and redeploy, and in-flight actions pick it up with nothing to migrate.

  Only the **optional** comment is gated. The two mandatory comment inputs always render, because the engine needs their text: the reviewer's brief in the review-mode Request Changes modal, and the recovery note on an action sitting in the `error` stage. This matches what form actions already did.

  `show_comment` is now validated: a non-boolean value fails the build instead of being silently accepted. If an app authored a quoted `show_comment: "false"`, that build will now error — the quoted string was never honoured as `false`, so update it to a real boolean. The field is also now documented in the authoring grammar reference, where it was previously missing entirely.

- [#133](https://github.com/lowdefy/modules-mongodb/pull/133) [`98059af`](https://github.com/lowdefy/modules-mongodb/commit/98059af175190f5fea6975a69a033fd6e4c3e22e) Thanks [@Saiby100](https://github.com/Saiby100)! - The `checkbox_selector` form component takes `label_inline` and `label_span` vars, like the other field components. Previously its label was hardcoded to `span: 12 / align: right`, so a checkbox group could not sit inline with its siblings or use a different label width.

  This changes the default rendering: with neither var set, the label no longer gets `span: 12 / align: right`, matching `yes_no_selector` and the rest of the library. An action that relied on the old look should declare `label_inline: true` and `label_span: 12` explicitly. `colon: false` is still hardcoded.

- [#133](https://github.com/lowdefy/modules-mongodb/pull/133) [`7cc8b51`](https://github.com/lowdefy/modules-mongodb/commit/7cc8b5176e37f005751b9a63e3298b03fc519bd9) Thanks [@Saiby100](https://github.com/Saiby100)! - `checkbox_selector` now validates `required: true` the way `multiple_selector` does. Its value is an array, and Lowdefy's built-in `required` treats an empty array as present — so a required checkbox group would let submit through with nothing ticked. It now appends the same required-non-empty rule the other array-valued fields use (`_array.length > 0`, message "This field is required.").

  The component also gains a `validate` var, which it was missing entirely. Caller-supplied rules are concatenated ahead of the generated required rule, matching `multiple_selector`, `tree_multiple_selector`, `controlled_list`, `date_range_selector`, and `file_upload`.

- [#133](https://github.com/lowdefy/modules-mongodb/pull/133) [`1da82a6`](https://github.com/lowdefy/modules-mongodb/commit/1da82a6f27ef90bc536b847f2854104a8f1349ba) Thanks [@Saiby100](https://github.com/Saiby100)! - Raw blocks in an action `form:` now use `key`, not `id` — which is what makes their submitted values round-trip.

  A raw inline Lowdefy block (a `form:` entry with no `component:`) was documented as carrying its real `id`, on the reasoning that the id doubles as the state path just like a library component's `key`. That is true of the block tree, but it misses the second consumer of the authored `form:` array: the `form_meta` projection records only `component`/`key`/`required`/`title`/`validate`, and `GetWorkflowAction` allowlists the stored `form_data` slice by those keys. An entry with a bare `id` and no `key` has no `form_meta` entry, so its value **saved but was never read back** — blank on re-edit, and absent from the overview and review views.

  Raw entries now share the library's authoring vocabulary: `key` becomes the block id (and the `form_meta` key), and `title` is the overview/review display label. Both are stripped before the node reaches the page tree, since neither is a valid Lowdefy block property. Writing `key` and `id` on the same entry is now an error, as is a non-string `key`.

  This also makes **consumer-supplied field components** work. An app that needs a field the library doesn't cover, reused across several of its own actions, can now own a component file that emits a form entry and `_ref` it from the app-side workflow config — the ref resolves in app context, so it is not subject to the constraint that a module ref cannot escape its package root. Those components get full parity with the built-in library: state binding, value round-trip, overview rendering, id-collision checking, and `viewOnly`.

  Existing raw blocks authored with `id` keep building and rendering exactly as before — they were already not round-tripping, so nothing regresses. Switch them to `key` to fix prefill and display. The `key` → `id` mapping applies at `form:` entry positions only (top-level entries, and the `form:` of a structural component); inside a raw block's own `blocks:` array, keep using `id`.

## 0.20.0

### Minor Changes

- [#131](https://github.com/lowdefy/modules-mongodb/pull/131) [`8b25037`](https://github.com/lowdefy/modules-mongodb/commit/8b25037e8bd8c7692d9bd63f95e3ac4abc9ee4cb) Thanks [@Yianni99](https://github.com/Yianni99)! - The `checkbox_selector` form component takes a `direction` var (`horizontal` — the existing behaviour — or `vertical`). Setting it to `vertical` stacks the checkboxes one per line instead of flowing them across the row, which reads better once an action's option list is long enough that a wrapped row is hard to scan.

- [#131](https://github.com/lowdefy/modules-mongodb/pull/131) [`41fef2d`](https://github.com/lowdefy/modules-mongodb/commit/41fef2d792179f2b2dc9d18e7864c774fafefb64) Thanks [@Yianni99](https://github.com/Yianni99)! - Workflow and action-group overview pages: each action card now reads at a glance. The card header is tinted with its status colour and the status badge picks up the same pale-fill/outline/saturated-text treatment as the workflow status pill above it, so a long list of collapsed actions can be scanned without opening anything. The action message is emphasised, the link button carries a right-arrow, and a collapsed card is now just its coloured header instead of a header plus an empty white body.

  Uploaded files inside an action's data now download instead of showing "No files available" — both pages wire the files module's download policy.

  The title bar now states which record the workflow belongs to: a new line beneath the title shows the entity's id, linked straight to its record. Expand/collapse-all has moved into the title bar's actions area, freeing the row it used to occupy above the cards, and reads as a button rather than plain text. The group heading's icon is also aligned with its title rather than sitting above it.

## 0.19.0

### Minor Changes

- [#129](https://github.com/lowdefy/modules-mongodb/pull/129) [`339a42b`](https://github.com/lowdefy/modules-mongodb/commit/339a42b9d1766df645c82614da133c881124504f) Thanks [@Saiby100](https://github.com/Saiby100)! - Honour `universal_fields` on `kind: check` actions. The flag chooses which of the two action-level fields (`assignees`, `due_date`) an action's UI shows — it has worked on form actions since it shipped, but check actions silently ignored it and always rendered both. Declaring `universal_fields: [due_date]` on a check action now hides the assignees chip and drops the assignees input from the ✎ edit modal, on both the standalone check page and the in-context check modal.

  Each check action's declaration is honoured independently even though one `{workflow_type}-action` page serves them all. The presence list is resolved from workflow config on every read (like `description`), so it is never stored on the action document — change it and redeploy, and in-flight actions pick it up with nothing to migrate.

  This is presence, not permission: hiding a field does not gate who may change it (use `access:` for that), and a hidden field is never written or cleared, so narrowing the list on an action that already has assignees stops showing them rather than wiping them. `universal_fields` is now documented in the authoring grammar reference, where it was previously missing entirely.

## 0.18.0

### Minor Changes

- [#123](https://github.com/lowdefy/modules-mongodb/pull/123) [`fb72ec0`](https://github.com/lowdefy/modules-mongodb/commit/fb72ec081a64eb0bced8856758e635effd96b2a4) Thanks [@Yianni99](https://github.com/Yianni99)! - Action-form text fields (`text_input`) support native max-length capping. A new `max_length` field option maps to the TextInput `maxLength` property, stopping input at the limit instead of erroring after over-long input; `show_count` maps to `showCount` for a live "n/max" counter and defaults to on whenever `max_length` is set.

- [#126](https://github.com/lowdefy/modules-mongodb/pull/126) [`79824a6`](https://github.com/lowdefy/modules-mongodb/commit/79824a615dabb129038dfc7b618ee3a361d6ede9) Thanks [@Yianni99](https://github.com/Yianni99)! - Workflow action pages support an optional wide layout. Setting `page_layout: wide` on a workflow renders all of its action pages — view, edit, review, error, and the per-workflow check page — with the workflow-progress panel on the left, the form expanded to the full width, and the record's Details and History moved into a right-side drawer opened from a header button. Workflows that omit `page_layout` (or set it to `standard`) keep the existing three-column layout unchanged, and an unrecognized value is rejected at build time.

- [#123](https://github.com/lowdefy/modules-mongodb/pull/123) [`fb72ec0`](https://github.com/lowdefy/modules-mongodb/commit/fb72ec081a64eb0bced8856758e635effd96b2a4) Thanks [@Yianni99](https://github.com/Yianni99)! - Workflow and action-group overview pages: the back arrow now returns to the previous page instead of always jumping to the entity view (the entity stays reachable via the breadcrumb), and each action is individually collapsible with an Expand/Collapse-all toggle, all collapsed by default.

  Adds two per-action options: `show_comment` (default `true`) — set `false` to hide the free-form comment box on an action's edit and review pages; and `pages.edit.validate_on_draft` (default `false`) — set `true` to validate the form (like Submit) before the edit page's Save Draft saves.

## 0.17.0

## 0.16.0

### Minor Changes

- [#118](https://github.com/lowdefy/modules-mongodb/pull/118) [`cdd1772`](https://github.com/lowdefy/modules-mongodb/commit/cdd1772bdd70ac5d01f8cc6cab245924a07b8748) Thanks [@Saiby100](https://github.com/Saiby100)! - Add a checkable-tree multi-select field for workflow action forms. Report types (or any grouping) show as parent nodes and their items as checkable leaves; checking a group selects all its items. The selection now also renders on the read-only view page instead of showing nothing.

## 0.15.0

### Minor Changes

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`8923ca1`](https://github.com/lowdefy/modules-mongodb/commit/8923ca1501e8ae7af3ee721bd9738134d0f03681) Thanks [@Yianni99](https://github.com/Yianni99)! - Add the **open-actions** component — a compact, colour-keyed card list of an
  entity's OPEN workflow actions, for hosts that want a lighter summary than
  the full `actions-on-entity` stepper. Takes the same `entity_id` +
  `entity_connection_id` vars, fetches via the existing `get-entity-workflows`
  endpoint, flattens every workflow's groups, and keeps only non-terminal
  actions (everything except `done`/`not-required`), styled off the
  `action_statuses` enum. Actions-only — never reads tasks or activities.

## 0.14.1

## 0.14.0

### Minor Changes

- [#114](https://github.com/lowdefy/modules-mongodb/pull/114) [`f8b6d19`](https://github.com/lowdefy/modules-mongodb/commit/f8b6d197d010ce025a6e6443184f079d6170fe66) Thanks [@Saiby100](https://github.com/Saiby100)! - Add the WorkflowProgress block and the workflows module's `workflow-progress` component — a presentation variant of `actions-on-entity` that renders an entity's workflows as collapsible sections of grouped, status-colored action buttons, with progress rings, done-fractions, and the shared check-action click handling baked in.

## 0.13.0

## 0.12.0

### Minor Changes

- [#105](https://github.com/lowdefy/modules-mongodb/pull/105) [`b853551`](https://github.com/lowdefy/modules-mongodb/commit/b85355143b18f2a76d7f8ff77fdd7080acf6a619) Thanks [@Saiby100](https://github.com/Saiby100)! - Extend the form-field library. Add a `phone` field (wraps `PhoneNumberInput` —
  the form-side counterpart to the `phoneNumber` view field type), add
  `disabled`/`extra` vars to `text_input`, and `disabled`/`theme` vars to
  `button_selector`. Also migrate `location` off the deprecated
  `layout.contentGutter` (→ `layout.gap`), which newer Lowdefy builds reject.
  Together these let consuming apps author read-only text, themed toggles, and
  phone inputs as first-class library components instead of raw blocks.

### Patch Changes

- [#105](https://github.com/lowdefy/modules-mongodb/pull/105) [`d913ed6`](https://github.com/lowdefy/modules-mongodb/commit/d913ed626c972f103ce297ade1db425a3c0e864d) Thanks [@Saiby100](https://github.com/Saiby100)! - Fix outer-card suppression on the form-action edit/error pages. The templates
  dropped the outer form card whenever the first form entry declared a sub-form,
  assuming it owned its own card chrome — but only the `section` field renders a
  Card. A form led by a `controlled_list` (or `box`/`label`/`file_upload`) thus
  rendered with no card, and its comment input fell outside any card. Suppression
  now triggers only when the first entry's component is `section`.

## 0.11.0

## 0.10.1

## 0.10.0

### Patch Changes

- [#94](https://github.com/lowdefy/modules-mongodb/pull/94) [`18d8876`](https://github.com/lowdefy/modules-mongodb/commit/18d8876916b21bad8690861ddf60f6c1d02bfeb6) Thanks [@Yianni99](https://github.com/Yianni99)! - Make action edit-page button titles configurable

  The edit page's progress ("Save Draft") and submit ("Submit") button titles can
  now be overridden per action via `page_config.buttons.progress.title` /
  `page_config.buttons.submit.title` (defaults unchanged). This lets an app relabel
  e.g. a perpetual-log action's "Save Draft" button to "Save".

- [#94](https://github.com/lowdefy/modules-mongodb/pull/94) [`466e976`](https://github.com/lowdefy/modules-mongodb/commit/466e976d9cdc31d63585cd4a825c9cd8d9b7cc93) Thanks [@Yianni99](https://github.com/Yianni99)! - Add `on_change` event support to workflow form field components

  The `button_selector`, `number`, `radio_selector`, `checkbox_selector`,
  `checkbox_switch`, `text_input`, `text_area`, `enum_selector`, `date_selector`,
  `date_range_selector`, and `tiptap_input` field components now accept an
  `on_change` var (mirroring `selector` / `yes_no_selector`) that wires to the
  block's `events.onChange`. Previously these fields silently dropped any authored
  field-level change handler, so form logic like "clear dependent field when this
  one changes" only worked on a handful of field types.

- [#94](https://github.com/lowdefy/modules-mongodb/pull/94) [`f1d8f6c`](https://github.com/lowdefy/modules-mongodb/commit/f1d8f6cefa4cee19f838795d91403851fea4027d) Thanks [@Yianni99](https://github.com/Yianni99)! - Add a role-filtered simple contact selector

  New `role-contact-selector` contacts component: a Selector (or MultipleSelector
  via `mode`) of active contacts scoped to one or more roles (matched against
  `apps.<app_name>.roles`), storing a denormalized `{ contact_id, name, email }`
  value — object in single mode, array in multiple — so read-only views render it
  as a contact (name + link). New `role_contact` and `role_contact_multiple`
  workflows form fields wrap the single- and multiple-select cases. A lighter
  alternative to the rich contact picker (`contact`) when a form only needs to pick
  existing contacts in a given role.

- [#94](https://github.com/lowdefy/modules-mongodb/pull/94) [`c93ad39`](https://github.com/lowdefy/modules-mongodb/commit/c93ad39a0a0c65c2a4ee21e4e49d013f037a7681) Thanks [@Yianni99](https://github.com/Yianni99)! - Edit-page Save Draft now sends the `comment` / `comment_visibility` inputs with the progress call and clears them after a successful save, matching the check page's progress reseed — so a draft comment is no longer folded into a later event on the next Save Draft.

## 0.9.2

### Patch Changes

- [`384da61`](https://github.com/lowdefy/modules-mongodb/commit/384da6108b4c5ef599ff075ea6368eb95d2da050) Thanks [@JohannMoller](https://github.com/JohannMoller)! - **Fix: group `on_complete` routines were never dispatched** — `makeWorkflowApis` emitted the `{type}-group-{id}-on-complete` InternalApis and `planSubmit` computed `completedGroups`, but nothing ever fired the endpoints, so an authored group `on_complete` silently never ran (the docs promised the engine fires it). A new `dispatchGroupOnComplete` phase now fires each completed group's routine post-commit, after the tracker cascade and ahead of the post-hook.

  Fan-out covers **both the submitted workflow and any parent workflow** reached by tracker propagation: when a child completes and a parent group thereby transitions to `done`, that parent group's `on_complete` fires too, with `context.workflow` set to the parent doc. `planTrackerLevel` computes each cascade level's completed-group diff; the submit endpoint carries a build-resolved `workflow_type → group_id → endpoint` bundle (own workflow + ancestors) on `params.group_on_complete`, and the dispatcher resolves each completion by its `workflow_type` (same `_module.endpointId` mechanism as hooks). The payload mirrors the post-hook `context` so a routine can reach the committed workflow doc. Failures propagate after writes have landed, so `on_complete` routines must be idempotent — the same contract as post-hooks. Does not fire on cancel or close.

- [`ad5bf9f`](https://github.com/lowdefy/modules-mongodb/commit/ad5bf9fd599ad4c4a82641562e45ca73d22029e6) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Check-action modal header restructure** — the compact modal header is split into two rows: status pill · message title · in-flow close on the top row, and the assignee / due-date chips on their own right-aligned row below (a long title no longer fights the chips for width). The modal sets `closable: false` — an in-flow close button replaces the native floating X, which had no title strip to live in and overlapped the header; mask-click and Esc still close.

  The workflow-closed banner moved below the header (title-then-notice reading order), and the signal button bar now hides wholesale on a closed workflow instead of showing disabled buttons.

- [`378c216`](https://github.com/lowdefy/modules-mongodb/commit/378c2166ed3eb3ee56aa1f780c7441a2ae356d45) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Entity-context overview eyebrow** — the two workflow overview pages (`workflow-overview`, `workflow-group-overview`) now render an eyebrow that names the entity the workflow hangs off (`{type}: {name}`, e.g. "Company: Acme Corp") above the title, instead of the static "Workflow" label. Sourced from the `workflow.entity_link` on the overview responses via a shared `overview-entity-eyebrow` component, with a `title`-only fallback until the instance name resolves.

## 0.9.1

### Patch Changes

- [#86](https://github.com/lowdefy/modules-mongodb/pull/86) [`1d7160c`](https://github.com/lowdefy/modules-mongodb/commit/1d7160cd75a13318c1405542bef791a1319fdda2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Action fields header polish (Part 67)** — the universal-fields chips row is relabelled and restructured into a labelled two-field strip: an **Assignees** list (with `Unassigned` / `+N` overflow states, each assignee's avatar linking to the contact) and a due-aware pill (`No due date` placeholder, overdue styling). The templates and `check-action-surface` now pass `assignee_docs` as a path string and expose the action's `stage` leaf to the header. `contacts` becomes a build-time dependency of the always-present chips (for the avatar link).

- [#86](https://github.com/lowdefy/modules-mongodb/pull/86) [`1d7160c`](https://github.com/lowdefy/modules-mongodb/commit/1d7160cd75a13318c1405542bef791a1319fdda2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Overview progress breakdown (Part 66)** — the two workflow overview pages now render a **segmented status bar** in place of the single-colour antd `Progress` line. One coloured segment per action state (`done, in-review, changes-required, error, in-progress, action-required, blocked`, `not-required` excluded), sized by each state's count and coloured from the shared `action_statuses` enum's `titleColor`, so the bar shows not just _how much_ is done but _what state the rest is in_. Built as a shared `Html` + `_nunjucks` component (`overview-progress-bar.yaml`) `_ref`-ed by both pages.

  The percentage is corrected to `done / (total − not_required)` — waiving an action removes it from the pool rather than counting it as filled — and the caption reads `{done} of {pool} done · {n} not required`, so the green `done` segment's width equals the percentage exactly.

  Because the counts are now derived on read, the denormalised `summary` / `groups[]` cache is **dropped from the workflow doc**, making the action docs the single source of truth. A new pure `summarizeStatuses(actions)` counter feeds the three overview resolvers; `GetWorkflowActionGroupOverview` re-sources its existence guard, `id`, `status`, and `summary` from the loaded actions / config, and `GetEntityWorkflows` recomputes group `status` from grouped actions. The write path stops persisting `summary` / `groups`, and `planSubmit`'s `completed_groups` diff recomputes both sides from actions via `recomputeGroups` (behaviour-equivalent, no staleness). No migration — the module is unreleased.

## 0.9.0

### Minor Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`bf0015f`](https://github.com/lowdefy/modules-mongodb/commit/bf0015f6db25223ba8c0160b27acfcb40d9385f3) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Initial release of the `workflows` module** — a multi-workflow engine for entity-scoped business processes (sales pipelines, onboarding checklists, compliance reviews, service orders, and any entity with a structured, role-gated lifecycle).

  Apps declare workflow YAML (`workflows_config`, one entry per workflow type); the engine renders entity-scoped action lists and submits lifecycle transitions through engine-managed handlers. Highlights:

  - **Signal-driven FSM** — a submission carries a _signal_ that the engine resolves against a per-kind finite-state machine, so authors never hand-write status transitions.
  - **Resolver-emitted surface** — two static overview pages, six operational APIs, and a dynamic surface derived from the app's config: a per-verb page set per form action, one `{workflow_type}-action` page per workflow, and one submit endpoint per form/check action. Every action page renders in the same three-tier workspace.
  - **Authoring grammar** — action kinds, role-gated `access` (multi-app scoped via `app_name`), inline `hooks` and `trackers`, action groups with blocking, and an inline `entity.data` routine that returns host-shaped data about the entity instance.
  - **Built-in form components** and a universal-fields surface wrapping the `contact`, `user`, file, and event components from sibling modules.

  Depends on the `layout`, `events`, `notifications`, `contacts`, and `user-account` modules, and on the `@lowdefy/modules-mongodb-plugins` `WorkflowAPI` connection.

  Full documentation lives under `docs/workflows/` — start with the module index and the mental-model concept, then the authoring grammar, FSM-and-signals, and required-indexes references.
