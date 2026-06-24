# Review 1

## Correctness

### 1. Worked examples reference the raw `enums/` map, dropping per-app display overrides

> **Resolved.** Changed the status-driven worked example to `_ref: components/workflow_lifecycle_stages.yaml` and added a Key-decisions note: callers pass the override-merged `components/` map (base enum + per-app `*_display`), never the raw `enums/` map, so app colour/label overrides survive. The brand-new action-group enum is the documented exception — it has no override var, so it is referenced directly (see #1 follow-on naming decision and new-enum section).

The status-driven worked example (design.md:75–86) wires:

```yaml
status_enum:
  _ref: enums/workflow_lifecycle_stages.yaml
```

But the current page does **not** read the raw enum — `workflow-overview.yaml:27,35` and `workflow-group-overview.yaml:174,182` all `_ref: components/workflow_lifecycle_stages.yaml` / `components/action_statuses.yaml`. Those `components/` files are not plain enums:

```yaml
# modules/workflows/components/workflow_lifecycle_stages.yaml
_build.object.assign:
  - _ref: enums/workflow_lifecycle_stages.yaml
  - _module.var: workflow_lifecycle_stages_display
```

The `*_display` vars (`module.lowdefy.yaml:78,89`) are documented as per-app UI overrides — "Same merge semantics … UI-only". If the migration passes `status_enum: _ref: enums/...` it bypasses the merge, so any consuming app that customises a stage's colour/label via `workflow_lifecycle_stages_display` (or `action_statuses_display`) silently reverts to the base palette. This is exactly the kind of "no caller in this repo does it, but production might" capability CLAUDE.md warns about.

**Fix:** every migrated caller must pass `status_enum: { _ref: components/<enum>.yaml }` (the merged map), matching what the current badge code already resolves against. Update the three worked examples (design.md:82, 95-area, and the group-overview migration note at design.md:158–159) to say `components/`, not `enums/`. The design's "Key decisions" claim that the title block "consumes exactly these keys … any existing status enum is usable as-is" is fine — but the *caller* must point at the override-merged component, not the raw enum.

### 2. "Fold the eyebrow into the title `Html`" contradicts "the eyebrow is never skeletoned"

> **Resolved.** Closed the open question in favour of a separate eyebrow block. Updated Implementation shape (design.md) to mandate the eyebrow as its own sibling block above the title/subtitle block — with no `loading`/`skeleton` of its own — since `CategorySwitch.js:34` swaps the whole block to its skeleton tree, which would otherwise hide the eyebrow during loading.

The design states three times that the type eyebrow renders immediately and is **not** part of the skeleton swap (design.md:10, 35, 138 — "The type eyebrow is never skeletoned because it comes from static module config"). But the implementation shape (design.md:136) proposes:

> Likely folded into the existing title `Html` template as a leading `<div>` so title + subtitle + eyebrow stay one block for skeleton swapping

and design.md:138 puts `loading: { _var: loading }` + `skeleton:` on "the title/subtitle container". If the eyebrow lives inside that same `Html` block, then when `loading` is true the whole block is replaced by `LoadingBlock` (verified: `CategorySwitch.js:34` swaps the entire block to its `skeleton` tree when `loading && skeleton`), and the eyebrow disappears with it — directly violating the stated requirement.

The open question at design.md:180 ("separate block vs leading element … decide at implementation") surfaces this but doesn't resolve it. Per CLAUDE.md ("Resolve the open question; don't defer it") it should be decided now: the eyebrow **must be its own block**, separate from the skeletoned title/subtitle block, for the "never skeletoned" guarantee to hold. Recommend closing the open question in favour of a separate eyebrow block and updating design.md:136.

## Accuracy of "Current state"

### 3. `user-admin` has no `label` var and its "new" verb is "Invite", not "New"

> **Resolved.** No component change — `type`/`title` are arbitrary caller-supplied string expressions, so the component stays generic. Updated the design instead: added a "building the `type` string" conventions block (view → type alone; edit → `Edit {type}`; create → domain verb + type), generalized proposed-change #5 from "Edit/New" to "edit/create verb (New, Invite, …)", and added a user-admin worked example showing the literal `User` type, conditional `app_title` prefix, and "Invite" verb.

design.md:54 asserts "In every case `label` (or `app_title`) is already a module var — the entity type is configurable". For user-admin that's only half true: the entity type is the **literal** word `User`, prefixed by `app_title` — there is no per-entity `label`. Confirmed:

- `view.yaml:9` — `{% if app_title %}{{ app_title }} {% endif %}User{% if profile %}…`
- `edit.yaml:9` — `Edit {% if app_title %}{{ app_title }} {% endif %}User…`
- `new.yaml:9` — `Invite {% if app_title %}{{ app_title }} {% endif %}User…`

Two consequences the worked examples (design.md:107–120) don't cover:

1. The user-admin eyebrow is `{app_title} User` (e.g. `ACME USER`), not `{label}`. The generic `type: { _module.var: label }` example won't apply.
2. The user-admin create verb is **"Invite"** (and the save button "Send Invite"), not "New". The "New page" example (design.md:116–120) and Proposed-change #5 ("the 'Edit'/'New' verb") need a carve-out so the implementer produces `INVITE ACME USER`, not `NEW USER`.

design.md:155 acknowledges "`app_title`/`User` prefix → eyebrow" in the file list, but the prop-interface examples should reflect the Invite verb and the literal-`User` type so the migration is unambiguous.

### 4. Title nunjucks drop the honorific-period logic — migration fidelity

> **Resolved (auto).** Added `{{ '.' if profile.title }}` back into the contacts-view worked example (design.md) so the migration preserves the honorific period (`Dr.`).

The contacts-view worked example (design.md:96–99) simplifies the title to:

```yaml
template: "{% if profile %}{{ profile.title }} {{ profile.name | safe }}{% endif %}"
```

The real template (`contacts/pages/view.yaml:9`) is:

```
{{ label }}{% if profile %}: {{ profile.title }}{{ '.' if profile.title }} {{ profile.name | safe }}{% endif %}
```

— note `{{ '.' if profile.title }}`, which renders `Dr.` not `Dr`. The same `'.' if profile.title` appears in `user-admin/pages/{view,edit,new}.yaml:9`. The migration must preserve this period when it strips `{{ label }}: ` out of the title; the simplified example silently loses it. Minor, but it's the kind of detail that gets dropped when copying the example verbatim. Recommend the example keep the honorific period.

### 5. "Current state" inventory under-lists the affected nunjucks titles

> **Resolved (auto).** Softened "three different ways" to "several", added `activities/pages/view.yaml` as a fourth variant, and expanded the user-admin line to all three pages noting the `Edit`/`Invite` verb (design.md "Current state").

design.md:48–52 lists contacts/view (nunjucks), contacts+activities edit (`_string.concat`), and user-admin/view (nunjucks) as the "three different ways". But `activities/pages/view.yaml:30` is a fourth nunjucks form (`{{ label }}{% if title %}: {{ title | safe }}{% endif %}`), and user-admin edit/new are nunjucks with the `Edit`/`Invite` verb baked in. The Files-changed section (design.md:153–155) does list all of these, so this is an inventory gap in the narrative, not a missed file — but it undercounts the variants ("three different ways" is really four+). Worth correcting so the scope reads accurately.

## Traceability

### 6. The cited mockup file no longer contains the mockup

> **Resolved.** Rebuilt `mockups/mockup.html` to render the title-block visual spec (eyebrow, status pill with the enum colour contract, edit/new/invite eyebrow variants, and the loading-skeleton state) at the cited dimensions, so the citation is live again. Reworded design.md to note the Visual spec section is the source of truth and the mockup mirrors it.

design.md:124 says "Confirmed in browser mockups (`mockups/mockup.html`)" and design.md:129–130 quote precise values (pill `padding: 15px 14px`, `border-radius: 6px`, skeleton pill `~96×50`, etc.). The file `designs/title-block-type-status/mockups/mockup.html` is the blank Design-Companion template — its content region reads "All visual decisions locked — writing the design doc…" (mockup.html:211). None of the cited pill/eyebrow/skeleton visuals exist in it.

This isn't a design error (the visual spec in §"Visual spec" is self-contained and detailed enough to implement from), but the citation is dead — a reviewer or implementer who opens the mockup to check a dimension finds nothing. Either drop the "confirmed in mockup" claim and treat design.md:122–130 as the source of truth, or re-export the locked mockup into the file.

## Minor / implementation notes

### 7. The three-colour pill contract cannot ride antd `Tag`'s `color` prop

> **Resolved.** Added a note to the Implementation-shape "Status pill" bullet: the independent fill/border/text contract requires explicit `backgroundColor`/`borderColor`/`color` style bindings on a `Box`/`Html`, not antd `Tag`'s single-value `color` prop. Cross-referenced the related "no `Tag` in the skeleton tree" constraint from #8.

design.md:137 says the status pill "replaces the current `title-badge` `Tag`" and design.md:129 wants fill = `color`, border = `borderColor`, text = `titleColor` (three independent colours). The current badge (`title-block.yaml:54–82`) is a `Tag` whose `color` prop takes a *single* value (it passes `.titleColor` today). antd's `Tag color` doesn't expose separate fill/border/text; achieving the three-colour contract means styling the element directly (`.element { backgroundColor/borderColor/color }`) or using a `Box`/`Html`, not the `color` prop. The design leaves the pill block type "to be settled at implementation" — fine — but flag that the `Tag color` route is a dead end for this contract so the implementer reaches for explicit style bindings (as the current badge already partly does via the `.element` style block).

### 8. Confirm `loading`/`skeleton` plumbing reaches the title block — verified, no action needed

> **Resolved (auto).** No action needed — the reviewer confirmed the `loading`/`skeleton` mechanism is available without manifest changes (`blocks-loaders` is a default package). The constraint (no `Tag` inside the `skeleton:` tree) is already consistent with the design; noted for implementation.

For the record (the design doesn't assert this but it's load-bearing): the mechanism is real and available without manifest changes. `block.eval.loading` is honoured (`Block.js:92`), `block.eval.skeleton` triggers `LoadingBlock` (`CategorySwitch.js:34`), `Skeleton` ships in `@lowdefy/blocks-loaders`, and that package is a **default** package (`packages/build/src/defaultPackages.js:27`) — present in the demo build (`blockPackages.json`). So no plugin declaration is needed in the layout manifest. One constraint to respect: `LoadingBlock.js` warns that skeleton `type` must be a `blocks-basic` or `blocks-loaders` block — `Skeleton`, `Html`, `Box` all qualify; do **not** use `Tag` (antd) inside the `skeleton:` tree.
