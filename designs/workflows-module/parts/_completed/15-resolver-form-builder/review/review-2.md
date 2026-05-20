# Review 2 — v0 parity gaps surfaced after Part 15 implementation landed

Focus: comparing the shipped Part 15 resolvers ([makeActionsForm.js](../../../../modules/workflows/resolvers/makeActionsForm.js), [makeActionFormConfigs.js](../../../../modules/workflows/resolvers/makeActionFormConfigs.js)) against v0's equivalents at [`dist/workflows-module/ui/current_workflow_utils/resolvers/`](../../../../dist/workflows-module/ui/current_workflow_utils/resolvers/). Two v0 features have no v1 equivalent and aren't called out in the design's "Out of scope / deferred" section. A third deferral is cosmetic but worth tracking.

## Findings

### 1. `viewOnly` per-field flag — no v1 equivalent for hiding a single field on the edit page

> **Resolved.** Adopted option 1: `makeActionsForm` accepts a `mode: 'edit' | 'view' | 'review' | 'error'` var; `viewOnly: true` entries drop on `edit` and emit (with the `viewOnly` key stripped) on the other modes. Design updated in "In scope" and "Contract to neighbours"; follow-up implementation tracked as tasks-dir task 5.

v0's [`makeActionsForm.js:15`](../../../../dist/workflows-module/ui/current_workflow_utils/resolvers/makeActionsForm.js) filters entries whose `viewOnly: true` flag is set:

```js
const blocks = vars.form
  .filter(({ viewOnly }) => !viewOnly)
  .map(({ component, form, ...vars }) => ({ ... }));
```

A worked example uses it in production — [`dist/.../site-check.yaml:157-160`](../../../../dist/workflows-module/ui/example_workflow/device-installation/site-check.yaml):

```yaml
- key: form.validation.created
  component: label
  title: Validated
  viewOnly: true
```

The intent: "show on view-mode renders, hide on edit-mode renders." The author wants a timestamp/status field visible when the form is rendered read-only but suppressed when rendered as an editable form.

v1's Part 15 resolver has no `viewOnly` handling. The closest v1 mechanism is **whole-form alternate slices** (`form:` vs `form_review:` vs `form_error:`), but those are page-verb-scoped slices of the *entire* form, not per-field visibility within one slice. Per [part 16 design.md:19-24](../../16-page-templates/design.md), the **view page renders `form:` read-only** — the same array the edit page renders editable. There's no separate `form_view:` slice to put `viewOnly` fields under.

Authors moving from v0 to v1 lose this capability outright. Possible v1 paths:

1. **Add a `viewOnly` filter to `makeActionsForm` keyed off a render-mode var.** Templates pass `{ form, mode: 'edit' | 'view' }`; the resolver drops `{ viewOnly: true }` entries when `mode === 'edit'`. Small change, mirrors v0 semantics.
2. **Push the gating to the field's `visible:` operator with a page-mode state var.** Templates expose `_state: page_mode` or similar; authors write `visible: { _eq: [{ _state: page_mode }, view] }` per field. More flexible (also covers hide-on-view, hide-on-review), more author burden.
3. **Add a `form_view:` slice as a parallel to `form_review:`.** Most explicit, biggest authoring surface; doubles the YAML for any workflow that wants per-field visibility.
4. **Document the gap and accept the regression.** Authors who need this rewrite the affected actions to use the runtime `visible:` mechanism. Worth doing only if the worked example proves the case is rare and tolerable.

Whichever path lands, the design needs to call this out — either as "in scope" with a chosen mechanism, or "deferred" with the author migration path documented.

**Suggested fix:** add a "Per-field visibility / v0 `viewOnly` parity" bullet to either "In scope" (with one of options 1–3) or "Out of scope / deferred" (with option 4's migration note). Today the design is silent and the gap is invisible to anyone not cross-referencing v0.

### 2. `useCard` chrome wrap — claimed "moved to part 16" but not verified against v0 visual intent

> **Resolved.** Part 15 design's "Contract to neighbours" now records that form-body chrome belongs to part 16 (this resolver emits the block tree only, no outer container). Part 16 design's "Verification" adds an explicit form-card parity bullet calling out v0's shadow / gutter / justify tokens and the "suppress card when first entry owns its chrome" condition, so the parity check has a home before part 16 lands.

v0's [`makeActionsForm.js:11-13, 40`](../../../../dist/workflows-module/ui/current_workflow_utils/resolvers/makeActionsForm.js) conditionally wraps the form body in a `Card` block with a specific shadow style:

```js
const useCard = !vars.init && !vars.form[0]?.form && vars.useCard && vars.form.length > 0;
// ...
return useCard ? makeCard(blocks) : blocks;
```

And:

```js
function makeCard(blocks) {
  return {
    id: "_card_template_component",
    type: "Card",
    properties: { style: { boxShadow: "0px 5px 8px -3px rgba(0,0,0,0.1)" } },
    layout: { contentGutter: 12, contentJustify: "start" },
    blocks: blocks,
  };
}
```

v0 templates pass `useCard: true` from [`edit.yaml.njk:146`](../../../../dist/workflows-module/ui/current_workflow_utils/templates/edit.yaml.njk) and [`error.yaml.njk:133`](../../../../dist/workflows-module/ui/current_workflow_utils/templates/error.yaml.njk).

v1 [part 16 design.md:60-63](../../16-page-templates/design.md) commits to wrapping content in `layout.card` (from the layout module). This is a reasonable v1 replacement, but two open questions:

- **Does the `layout.card` block carry the same shadow / spacing?** v0's shadow (`0px 5px 8px -3px rgba(0,0,0,0.1)`) is a specific design token. If the layout module's card has different chrome, the v1 visual diverges from v0.
- **Is the wrap unconditional across all four templates?** v0 only wrapped `edit` and `error`. v0 conditionally suppressed the card when the first form entry had a sub-form (`!vars.form[0]?.form`) — the assumption being that `controlled_list`-style forms own their own outer chrome. v1 part 16 hasn't been implemented yet; whether it preserves the "suppress card when first entry is structural" rule, or always wraps, is unspecified.

**Status:** Not a Part 15 bug — chrome belongs to part 16. But the design should record (in part 16's design or in part 15's "Contract to neighbours") that the part-16 templates own the v0 `useCard` behaviour and the visual-parity check belongs to part 16's verification.

**Suggested fix:** add a one-line note to part 15 design's "Contract to neighbours" section pointing at part 16 for chrome wrapping, and add a verification bullet to part 16's design asserting visual parity with v0's `Card` wrap (or explicit documentation of the divergence).

### 3. `key: form_data.<action_type>` keyed-action storage path — not addressed by the metadata tree

> **Accepted.** Reviewer explicitly notes "No suggested change to Part 15" — the `$` substitution is a part 17 runtime concern. Tracked here for visibility; will surface in part 17 review if it bites.

Lower-priority and arguably out of scope, but worth recording: v0's `makeActionFormConfigs` emits the raw `form` / `form_review` arrays so overview pages can re-render them. v1's metadata tree drops to `{ component, key, required, title, validate }`. For **keyed actions** (where the same `action_type` has multiple per-instance records keyed by `key`), part 17's overview card needs to render each instance's values — but the metadata tree doesn't carry the storage path. Today part 17 has to derive it from `action_form_configs.{action_type}.form[i].key` (e.g. `form.devices.$._id`) and substitute `$` with the runtime instance key.

That's likely fine — the `$` substitution is a known runtime pattern — but the design doesn't say so explicitly. If part 17 hits this and finds it harder than expected, the resolver-side fix would be to emit a `storage_path:` alongside `key:` with the `$` already substituted per instance. That's a per-instance concern, not a per-type one, so probably a part 17 concern rather than part 15.

**Status:** Note only. No suggested change to Part 15. Track if part 17 review surfaces it.

## What's solid

- **Resolver pattern.** `(_, vars) =>` signature, default export, module-scoped cache, prefixed error messages — consistent with [makeActionPages.js](../../../../modules/workflows/resolvers/makeActionPages.js) and [makeWorkflowsConfig.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js).
- **Validation posture.** v1 catches three failure modes v0 silently passed through: unknown bare component names, missing required vars, and block-id collisions. Each throws with the offending name and the entry's `key` context.
- **Bare-vs-namespaced split.** v1 cleanly distinguishes library components from plugin-namespaced components (`my-plugin:foo`). v0 didn't model this — every name went through the same library lookup.
- **Sub-form `form:` → `blocks:` rename.** v1's rename localized inside the resolver keeps both the authoring vocabulary (`form:` per spec) and the library implementation (`blocks:` on the structural components) intact. v0 didn't have a coherent answer to the spec/library divergence.
- **Two emission paths.** v1's separation of `makeActionsForm` (substituted block tree, template-scope) from `makeActionFormConfigs` (metadata only, manifest-scope) avoids v0's pattern of mixing both into one per-action object — which made overview pages re-parse the form on every render.

## Top item to address

**Finding 1 (`viewOnly`)** is the only finding that affects authoring surface and has no current v1 path. Either pick a v1 mechanism and update the design (and Part 15 implementation) to support it, or commit to dropping it with a documented migration note for v0 users. Findings 2 and 3 are part-16 / part-17 concerns and can wait for those parts to land.
