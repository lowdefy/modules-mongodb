# Review 1 — Design vs. concept spec, part-04/12/14 contracts, and shipped library

Reviewing [`designs/workflows-module/parts/15-resolver-form-builder/design.md`](../design.md) against the concept docs ([`workflows-module-concept/action-authoring/{spec,design}.md`](../../../../workflows-module-concept/action-authoring/spec.md), [`workflows-module-concept/design.md`](../../../../workflows-module-concept/design.md)), the part-04 normalized-config contract, the part-12 page-shell shape already on disk ([modules/workflows/resolvers/makeActionPages.js](../../../../../modules/workflows/resolvers/makeActionPages.js)), and the **shipped** part-14 components at [modules/workflows/components/fields/](../../../../../modules/workflows/components/fields/). No part-15 code in scope yet.

## Real findings

### 1. Library `controlled_list`/`section`/`box`/`label` use `blocks:`, not `form:` — the design's authoring contract is broken on landing

> **Resolved (option 1 — resolver-side rename).** Added an explicit "Sub-form var name normalization" bullet to `makeActionsForm` scope. The resolver renames `form:` → `blocks:` on entries whose `component:` is in the sub-form-bearing allowlist (`controlled_list`, `section`, `box`, `label`, `file_upload`) before merging vars. Authors keep writing `form:` per the spec; library YAML keeps `blocks:`. Authoring vocabulary and library implementation each stay clean; the inconsistency is localized to the resolver.

Design `design.md:18-19` says the resolver walks each `form:` entry and recurses "into nested blocks (e.g. `controlled_list` rows that themselves declare a sub-form)." The concept spec at [action-authoring/spec.md:594-616](../../../../workflows-module-concept/action-authoring/spec.md) and the authoring example at [spec.md:600-615](../../../../workflows-module-concept/action-authoring/spec.md) both use **`form:`** as the var name for the sub-form on `controlled_list`:

```yaml
- component: controlled_list
  key: form.devices
  form:                                   # ← spec's var name
    - { component: label_value, ... }
```

But [modules/workflows/components/fields/controlled_list.yaml:23-25](../../../../../modules/workflows/components/fields/controlled_list.yaml) declares the var as **`blocks`**:

```yaml
vars:
  ...
  blocks:
    type: array
    default: []
```

…and the shipped README ([components/fields/README.md:556-581](../../../../../modules/workflows/components/fields/README.md)) documents the var as `blocks` too. Same divergence in `section.yaml:11`, `box.yaml:8`, and `label.yaml` (per part 14 task 7 / 6 notes). Part 14 task 1 ([14-form-components-library/tasks/01-scaffold-fields-directory.md:14-34](../../14-form-components-library/tasks/01-scaffold-fields-directory.md)) ported the canonical example with `form:` but task 7 silently flipped to `blocks` during the actual port — there's no review entry resolving the switch.

Today's authoring surface therefore has two answers to "what do you call the sub-form?" — the action-authoring spec/design and part 15's design say `form:`, the shipped components and README say `blocks:`.

Part 15 has three viable paths; pick one explicitly in the design:

1. **Renormalize in the resolver.** Part 15 rewrites `form:` → `blocks:` (and any other future synonyms) before merging vars. The resolver becomes the contract surface; library var names stay an implementation detail. Cheap, but the README needs a one-line note (`authors write 'form:', the resolver renames to the component's 'blocks'`).
2. **Standardize on `blocks:` everywhere.** Update the concept spec ([action-authoring/spec.md:594-615](../../../../workflows-module-concept/action-authoring/spec.md)), the concept design's `controlled_list` snippet ([action-authoring/design.md:598-617](../../../../workflows-module-concept/action-authoring/design.md)), and this design's example consumer (`controlled_list` rows declare `blocks:`). Most honest if the library shape isn't changing.
3. **Rename the library vars to `form:`** to match the authoring spec. Touches `controlled_list.yaml`, `section.yaml`, `box.yaml`, `label.yaml`, `file_upload.yaml`, README, and any callers under `apps/demo/`. Worth it only if `blocks:` reads worse on the authoring side.

Recommendation: option 1 (resolver-side rename, narrow allowlist of structural components that own a sub-form slot). It localizes the inconsistency to one diff in part 15 and keeps the spec's authoring vocabulary intact. Whichever path you pick, the design's "in scope" bullet about nested-block recursion needs to spell it out, because today's example reads as "match `form:` → `form:`" and the implementation doesn't do that.

### 2. "Unknown `component:` fails the build" contradicts pass-through for `<plugin-name>:foo`

> **Resolved.** Replaced the single "Unknown component" bullet with two explicit rules in Build-time validation: bare names (no `:`) must match a library file; namespaced names (containing `:`) pass through unchanged. Also moved the plugin-component carveout out of "Out of scope" — it's now part of the substitution rule, not a deferred feature.

`design.md:42` says: "Unknown `component:` value fails the build with a precise message." `design.md:48` says: "apps can use `component: <plugin-name>:foo` per Lowdefy patterns; this resolver passes them through unchanged."

These cannot both be true. A `component: my-plugin:device_selector` is by definition not in `components/fields/`, so the rule that fails on unknown names rejects it. The intended discrimination — flagged in [action-authoring/spec.md:619](../../../../workflows-module-concept/action-authoring/spec.md): "The resolver passes through any `component:` name it doesn't recognize as a library component" — is presumably **string contains `:`** (Lowdefy plugin-component syntax), but the design never says so.

**Suggested fix:** rewrite `design.md:42` to: "A bare `component:` value (no `:` separator) that doesn't match a library file fails the build. Names containing `:` (Lowdefy plugin-component syntax) pass through unchanged — the block tree carries them straight to the rendered page." Add a verification fixture for each branch.

This also matters because the build-time validation list at `design.md:40-44` lists "Unknown component" first, before the rule that defines what "unknown" means. A reviewer reading the design top-to-bottom hits the failing-validation bullet before the passthrough exception in "Out of scope" and concludes plugin components are rejected.

### 3. The "field metadata" claim doesn't survive contact with the library shape

> **Resolved.** Replaced the "(id, type, required) flat list" claim with a tree-shaped metadata schema in the rewritten `makeActionFormConfigs.js` section. Each node carries `{ component, key, required, title, validate }`. Structural components (`controlled_list`, `section`, `box`, `label`, `file_upload`) nest a recursive `form:` array — matching the authoring vocabulary, not a separate `children:` field. `component` is the author-facing `component:` name (interpretation (i) from the review). Dropped `default` from the metadata — no shipped library component carries a field-value default, so the field would always be empty.

`design.md:29` says `makeActionFormConfigs` emits a "Field metadata (id, type, required) flat list for templates to introspect — used by overview pages (part 17) to render read-only field values." But the library components don't carry an author-facing field type. Each component file at [components/fields/](../../../../../modules/workflows/components/fields/) declares Lowdefy block types — `TextInput`, `NumberInput`, `Selector`, `TiptapInput`, `ControlledList`, `DateRangeSelector`, `Label` (the wrapper around `controlled_list`'s real block), etc. — inside `config.type`, not against a normalized field-type vocabulary.

Two questions the design needs to answer:

a. **What does `type` mean in the emitted metadata?** Three plausible interpretations: (i) the `component:` name the author wrote (`text_input`, `controlled_list`); (ii) the rendered Lowdefy block type (`TextInput`, `ControlledList`); (iii) a normalized "field kind" (text/date/file/choice/structural). [Part 17 design.md:40](../../17-shared-pages/design.md) needs `(action_form_configs.{action_type}.form, .form_review)` to drive a read-only DataView — which means part 17 needs to switch on the *author's* component vocabulary to pick the right renderer for each field's value. That's interpretation (i). Spell it out.

b. **What about structural components** (`box`, `section`, `controlled_list`, `label`) **that wrap other components?** A `controlled_list` field doesn't have a primitive value at `form_data.{action_type}.{key}` — it has an array of sub-rows. The "flat list of (id, type, required)" hides the tree shape that part 17's overview cards need to render. Either the metadata is *not* flat (it preserves nesting) or part 17 needs a different shape.

Recommendation: drop "flat" from the metadata shape. Emit the tree: each node carries `{ component, key, required, title }` plus children (for structural components with sub-forms). Templates pick a renderer per `component` name. The "field types, validation, and defaults" claim in `design.md:7` is honest only if `validate` and `default` survive into the metadata too — which they don't appear to in the design's bullet list.

### 4. `makeActionFormConfigs` overlaps with `makeActionPages`'s `action_config` template var — pick which one carries `form` / `form_review` / `form_error`

> **Resolved (option B — per-page `_ref` to `makeActionsForm` at template render).** Added a "Two emission paths (committed)" section to the Goal. (a) Form block tree comes through part 12's `action_config.{form|form_review|form_error}` raw blocks; templates pass them into `makeActionsForm` via `_ref: { resolver }` at render time. This is the canonical path for `edit`/`view`/`review`/`error` pages. (b) `global.action_form_configs` carries per-action **metadata only** (not substituted block trees) — read by part 17's `workflow-overview`. The recursive-`_ref`-from-template spike is now load-bearing and stays in scope.

[Part 12's shipped resolver](../../../../../modules/workflows/resolvers/makeActionPages.js:6-24) already lifts the action's `form`, `form_review`, `form_error` fields onto every emitted page's `action_config` template var (lines 18-20 of that file). [Part 12 design.md:26](../../12-resolver-pages/design.md) makes this explicit:

> `action_config` — the action's config slice the template needs … plus build-time-only fields (`pages.{verb}`, `form`, `form_review`, `form_error`, `hooks`, `interactions`, `event`)

Part 15's `global.action_form_configs` is also keyed by `action_type` and carries `form` / `form_review` / `form_error`. So per-action templates have two routes to the same `form` block: (a) `vars.action_config.form` (from part 12's shell) and (b) `_global.action_form_configs.{action_type}.form` (from part 15). Either is fine for `edit`/`view`/`review` templates; part 17's `workflow-overview` only has route (b) since it isn't a per-action page.

This raises three concerns:

- **Drift risk.** Two emission paths over the same authored YAML. If part 4's normalized config narrows differently from the raw YAML part 12 reads (and the part 4 design at `04-workflow-config-schema/design.md:17` confirms it narrows for engine-runtime), one of these resolvers reads a stripped shape and the other reads raw. Part 15's design ([design.md:24](../design.md)) doesn't say which input it reads — `vars.workflows_config` directly, or `global.workflows_config`. The shape inside differs; pick.
- **What about substitution?** Part 12 passes the **raw, unsubstituted** `form:` block (just lifted off the action). Part 15's `action_form_configs.form` is the **substituted block tree** ("Field metadata flat list" or whichever shape finding 3 lands on). Templates calling `makeActionsForm` inside the page (the recursive-resolver spike path) re-substitute on every render. That's inefficient and duplicates work — the build-time substitution in `makeActionFormConfigs` and the template-render-time recursion both walk the same authored tree.
- **Contract to part 16.** [Part 16 design.md:15](../../16-page-templates/design.md) says: "Form body via `_ref` to part 15's `makeActionsForm` (or substituted-form fragment from `global.action_form_configs`)." The "or" hides the decision part 15 needs to make: does part 16 call the resolver recursively at template render, or read the pre-substituted block tree out of `global.action_form_configs`? If the latter, the recursive-resolver spike isn't load-bearing — it's only needed for nested-form recursion inside `makeActionsForm`, not for the form-body-into-template path.

**Suggested fix:** commit one source of truth. Two options:

- **Option A — `global.action_form_configs` is the only emission.** Part 15 substitutes once at build time. Per-action templates read `_global.action_form_configs.{action_type}.form` from page vars (or directly via `_global`). Part 12's `action_config.form` drops to keep one path. The spike becomes "does `_ref: { resolver }` work at module-manifest scope" (already verified — part 4 review 1 finding 5 confirms `getRefContent.js:29` handles it).
- **Option B — Per-page `_ref` to `makeActionsForm` at template render.** Part 15's `makeActionFormConfigs` only emits **metadata** (id/type/required tree), not the substituted block tree. The form body comes from `makeActionsForm` invoked from inside the template via `_ref: { resolver }`. The spike becomes load-bearing again.

Recommendation: option A. It removes the recursive-from-Nunjucks spike from the critical path, lets `makeActionsForm` be a pure helper used by `makeActionFormConfigs` (no Lowdefy boundary), and removes the part-12 / part-15 double-emission of `form` / `form_review` / `form_error`. The spike then becomes an open question rather than blocking part 15 delivery.

### 5. Recursion target — `_ref` self-call vs JS recursion — is conflated

> **Resolved.** Rewrote the spike section to separate the two mechanisms explicitly. (1) JS-internal recursion inside `makeActionsForm` ships unconditionally — plain JavaScript, no Lowdefy machinery. (2) Lowdefy `_ref: { resolver }` from inside a Nunjucks template is the load-bearing spike (now load-bearing per option B in finding #4). Spike fallback no longer means "flat emitter" — it means invoking the resolver at module-manifest scope and emitting results onto `global.action_form_bodies` instead. JS-internal recursion is unaffected by the spike outcome. Open question reworded accordingly.

`design.md:33-38` describes the spike as confirming "`_ref: { resolver }` works from inside a Nunjucks template at module scope." The fallback is "ship a flat emitter that doesn't recurse." But the recursion needed to substitute `controlled_list`'s sub-form is **JS recursion inside `makeActionsForm`** (the resolver walks the tree, hits a `component: controlled_list` with a sub-form, substitutes the wrapper, then walks the sub-form children recursively). This is bog-standard JS function recursion. It does not need Lowdefy's `_ref: { resolver }` machinery.

The `_ref: { resolver }` question only matters if **the template** (not the resolver) emits a `_ref: { resolver: makeActionsForm.js, vars: ... }` to render a slice of form inline. That's only needed if part 15 takes option B from finding 4 above.

[Concept design.md:288](../../../../workflows-module-concept/design.md) wording is ambiguous on which recursion it means; [action-authoring/design.md:867](../../../../workflows-module-concept/action-authoring/design.md) is clearer ("The recursion uses a relative path. When the resolver lives in the module package, the recursive `_ref` path inside templates is resolved against the template's source location"). The latter is the spike that matters; the former conflates two unrelated things.

**Suggested fix:** rewrite `design.md:31-38` to separate the two:

- **JS-internal recursion (uncontroversial).** `makeActionsForm` walks the form tree in JS. When it hits a structural component with a sub-form, it recurses into its own walker. No Lowdefy machinery involved. Ships unconditionally.
- **Lowdefy-`_ref`-resolver-from-template spike (controversial).** Only needed if the form body is rendered via `_ref: { resolver }` from inside a Nunjucks template. If finding 4 lands as option A (`global.action_form_configs` is the only emission), this spike is moot and the design can defer it.

### 6. "Required vars present" validation is implicit on the existing library shape

> **Resolved (required-only).** Kept the existing "required vars missing fail the build" bullet. Rejected the two additional checks the review proposed: type validation of author-supplied values and rejection of unknown vars. Required-presence is enough to catch the load-bearing failure mode (omitted `key:` on a library component leaves the rendered block with an unresolved id). Type mismatches and unknown vars surface at Lowdefy render time, where the failure mode is still build-error-equivalent in dev. Library `vars:` declarations stay as documentation; the resolver doesn't enforce them beyond `required: true`.

`design.md:43` says missing required vars fail the build. The library files do declare which vars are `required: true` ([text_input.yaml:4](../../../../../modules/workflows/components/fields/text_input.yaml), [controlled_list.yaml:3](../../../../../modules/workflows/components/fields/controlled_list.yaml), etc.). The resolver needs to read each component file's `vars:` block and check author input against it.

Three things the design doesn't say:

- **Type validation.** `vars:` declares types (`string`, `boolean`, `array`, `number`). Does the resolver check `key: <author-supplied>` matches the declared type? Part 14 design's open question ([14-form-components-library/design.md:64](../../14-form-components-library/design.md)) defers the strictness call here. Pick: yes (and document the error shape) or no (and remove the `type:` field from the library's `vars:` declarations to keep them honest).
- **Unknown vars.** What if the author writes `{ component: text_input, key: foo, color: red }` and `color` isn't in `text_input.yaml`'s `vars:`? Lean reject (cheap, catches typos like `requried`); document.
- **The `key` var is part of the substituted output.** Library components use `id: { _var: key }`. If the author omits `key`, the rendered block has an unresolved `_var: key` (or, with `default:` semantics, an empty string id — causing later collisions). The "required vars present" check is the only protection. Don't skip it for "structural" components.

**Suggested fix:** add three explicit bullets under "Build-time validation":

> - Type-check author-supplied var values against the component's `vars:` declarations (`type: string|boolean|number|array`).
> - Reject author-supplied vars not declared in the component's `vars:` block ("unknown var `<name>` for component `<component>`").
> - Verify every var marked `required: true` in `vars:` is supplied by the author.

### 7. Block-id collision check at line 44 is under-specified for keyed actions

> **Resolved.** Rewrote the collision-check bullet to specify "within a single substituted form tree" and to call out wrapper ids derived via `_string.concat` (e.g. `controlled_list`'s `{key}_label`). Cross-form `form:`/`form_review:` collisions stay deferred to authors (separate "Out of scope" bullet). Keyed-action concern is a non-issue — the resolver doesn't splice the action's `key:` into rendered block ids, so there's nothing to guard against.

`design.md:44`: "Block id collisions within a form fail the build." Library components derive their ids from the author's `key:` ([text_input.yaml:28-29](../../../../../modules/workflows/components/fields/text_input.yaml)). So author-side `key` uniqueness within `form:` is what matters. But:

- **Cross-form keys are out of scope ([design.md:49](../design.md)) by design** — `form:` and `form_review:` keys can collide because authors are told to pick non-colliding names.
- **Wrapper components** like `controlled_list` emit a wrapper id (`{key}_label`) and an inner id (`{key}`) — see [controlled_list.yaml:29-30](../../../../../modules/workflows/components/fields/controlled_list.yaml) and the spec's discussion at [14/tasks/07:32](../../14-form-components-library/tasks/07-port-structure-actions.md). Two author-side keys that happen to end in `_label` could collide with another's wrapper. Cheap edge but worth a test.
- **Keyed actions** ([spec.md:317-351](../../../../workflows-module-concept/action-authoring/spec.md)). For keyed actions, `form_data.{action_type}.{key}.{field}` is the storage path, but the rendered block ids stay the same per instance (the runtime URL carries `?action_id=...&key=...`). Block-id uniqueness is per-form, not per-instance — `controlled_list` rows use `form.devices.$.foo` (the `$` is Lowdefy's list-row binding, not a key). Confirm the resolver doesn't mistakenly add `key` into rendered block ids.

**Suggested fix:** rewrite line 44 to: "Block id collisions within a single substituted form tree (including wrapper ids derived via `_string.concat`) fail the build with the offending ids and their component names." Add a fixture: two `text_input` fields whose `key`s differ only by a suffix that collides with another component's wrapper-id pattern.

## Smaller items

### 8. "Universal-fields renderer" open question at `design.md:70` already has a committed answer

> **Resolved.** Dropped the open question from `design.md`. Universal fields (`assignees`, `due_date`, `description`) render in page templates per part 16 and part 14 README — already committed and not in scope for `makeActionsForm` or the form library.

[Part 16 design.md:14](../../16-page-templates/design.md): "Universal-fields block (`assignees`, `due_date`, `description` inputs)" — confirmed lives in templates. [Part 14 README:15-19](../../../../../modules/workflows/components/fields/README.md): "`assignees`, `due_date`, and `description` are **not** part of the library — they render in the page templates." [Part 14 design.md:35-37](../../14-form-components-library/design.md): "the universal-fields-vs-form boundary: assignees / due_date / description are not part of the library; they render in the page templates (part 16) via the page chrome."

The decision is committed in three places. Open question 2 ("Whether to ship the universal-fields renderer in this part or in templates") can be closed in this design with: "Universal fields render in page templates (part 16). Confirmed by part 14 README and part 16 design — not in scope for the form library or `makeActionsForm`."

### 9. `form_error` defaulting rule belongs in the spec, not the resolver design

> **Resolved (match v0, not the spec wording).** Added an explicit "No `form_error` defaulting" bullet to `makeActionsForm` scope. When `form_error:` is absent, the resolver passes it through unchanged; templates default to `[]` (empty form body). v0's error template at [`dist/workflows-module/ui/current_workflow_utils/templates/error.yaml.njk:134-137`](../../../../../dist/workflows-module/ui/current_workflow_utils/templates/error.yaml.njk) does exactly this: `_var: { key: action_config.form_error, default: [] }`. The concept spec's "defaults to the action's `form:` block" wording is overridden by v0's actual shipped behavior — empty form is the v1 commitment. The example_workflow corpus also confirms apps that want recovery context write a different `form_error:`; apps that don't want one ship an error page with the failure-context banner alone.

`design.md:15`: "For each form action's `form:` block (and `form_review:` and `form_error:` if present)…" The spec at [action-authoring/spec.md:285](../../../../workflows-module-concept/action-authoring/spec.md) says: "The error form schema defaults to the action's `form:` block. Apps that need a different recovery schema declare a `form_error:` block parallel to `form:` / `form_review:`; otherwise the submitter's form schema is reused."

Part 15's design doesn't say whether `makeActionFormConfigs` populates `action_form_configs.{action_type}.form_error` with the `form:` block when `form_error:` is absent, or leaves it `undefined` and pushes the default-to-`form` logic into the template. Pick: if templates handle the default, document. If the resolver does, say so explicitly in the metadata shape.

Recommendation: resolver-side default. Templates that read `_global.action_form_configs.{action_type}.form_error` get a populated block tree unconditionally; the template doesn't need conditional logic. Add a bullet to "in scope" under `makeActionFormConfigs`.

### 10. Spike-outcome documentation pointer at `design.md:64` points at part 14's README

> **Resolved.** Repointed the spike-outcome doc target to `modules/workflows/resolvers/README.md` (or inline in the resolver source). Cross-module README write to part 14's territory dropped.

`design.md:64`: "Spike outcome documented in `modules/workflows/components/fields/README.md`."

That README is part 14's territory and is the field-component reference for authors. The recursion-spike outcome is a part-15 implementation detail (and, depending on finding 4, may not exist at all). It doesn't belong there.

**Suggested fix:** document the spike outcome in a part-15 file — either a new `resolvers/README.md` (where `makeActionsForm` and `makeActionFormConfigs` will live anyway and one doesn't exist yet) or inline in the resolver's source. Drop the cross-module README write.

### 11. No "Depends on" entry for part 12

> **Resolved.** Added part 12 to "Depends on" with the explicit contract: templates pass `action_config.{form|form_review|form_error}` from part 12's emitted shells into `makeActionsForm` via `_ref: { resolver }`. The dependency is real under option B (finding #4).

[Part 12](../../12-resolver-pages/design.md) emits the page shells that template-render-time `_ref` into `makeActionsForm` (per [part 12 design.md:78](../../12-resolver-pages/design.md): "Part 15 is invoked via `_ref` from inside the templates this resolver wires up"). If finding 4 lands as option B, part 15 has a hard dependency on part 12's emitted shell shape (it relies on the `vars.action_config.form` path part 12 passes in). If option A, the dependency is only via part 16's templates, not part 12 directly.

Either way, [design.md:53](../design.md) lists only parts 4 and 14. Add part 12 to "Depends on" (or document explicitly that this part is independent of part 12 and only meets it at part 16).

### 12. Verification list doesn't cover the `<plugin-name>:foo` passthrough or default-form-error rules

> **Resolved.** Extended the verification list with the three missing fixtures: (a) namespaced `component:` passthrough; (b) absent `form_error:` → metadata leaves it absent (no defaulting); (c) keyed action → one `action_form_configs` entry per action_type, no per-instance entries. Also tightened the existing fixtures to reference decisions from findings #1 (sub-form `form:` → `blocks:` rename), #2 (bare-vs-namespaced discrimination), and #3 (metadata tree shape).

`design.md:57-64` lists five unit tests + a "spike outcome" item. Missing:

- Passthrough fixture: `{ component: my-plugin:foo, ... }` survives substitution unchanged.
- `form_error:` absent → metadata has populated `form_error` defaulting to `form:` (if finding 9 lands as resolver-side default).
- Keyed action: `key:` set → `action_form_configs` is keyed by `{action_type}` (single entry, not per instance — instance keys are runtime, not build-time).

Add three fixtures.

## What's solid

- **Per-action keying.** [design.md:24](../design.md) keys `action_form_configs` by `{action_type}` (or `{action_type}.{key}` for keyed actions) — but the second form is wrong: per-finding 12, keys are runtime concerns, and there is one config per **action type** in the workflow YAML regardless of how many instances spawn. Reword to: "keyed by `{action_type}` — the action_type is the schema identity; per-instance keys vary at runtime and don't affect schema."  (Marking solid only for the action_type key; the parenthetical is a minor correction.)

> **Resolved (parenthetical correction).** The original "or `{action_type}.{key}` for keyed actions" wording was dropped during the finding #4 rewrite of `makeActionFormConfigs.js`. New wording: "keyed by `{action_type}` (the action_type is the schema identity; per-instance keys on keyed actions vary at runtime and don't affect schema, so they don't appear in this map)." Verified at the rewritten section in design.md.
- **Scope discipline.** Cross-form id dedup deferred to authors, custom-component support out of scope. Clean cuts.
- **Contract-to-neighbours section.** Names the three downstream consumers (parts 12, 16, 17) explicitly. Good handoff shape.
- **No engine touchpoints.** Pure build-time resolver. Failure mode is build failure — easy to debug, easy to fix without redeploys.

## Top three to address before the design closes

1. **Finding 1** (`form:` vs `blocks:` mismatch) — this is the only finding that fails the design on contact with the existing repo state. Either resolver-side rename or update the spec / library to match.
2. **Finding 4** (double-emission via parts 12 + 15; pick one source of truth) — affects the spike scope (finding 5) and part 16's `_ref` strategy. Decide before part 15 implementation starts so part 16 has a single contract.
3. **Finding 3** (metadata shape and "flat" vs tree) — load-bearing for part 17's overview cards; the design's current "(id, type, required) flat list" doesn't model structural components.
