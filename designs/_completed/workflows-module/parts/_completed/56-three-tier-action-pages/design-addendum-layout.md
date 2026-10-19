# Part 56 — Addendum: action-page layout revision (post-design visual review)

**Status:** amends the primary `design.md`. **Layer:** UI delivery only — the resolver/engine/envelope/schema changes in the primary design are unaffected. **Repo:** `modules/workflows/components/action-workspace.yaml`, `modules/workflows/templates/*.yaml.njk`, the Part 24 universal-fields composition, plus the layout `page` / `title-block` wiring this part already touches.

This addendum records the layout changes agreed after reviewing the three-tier workspace rendered against real content (the demo `onboarding` workflow). The primary design's **structure** stands — full-content-width header, three columns (left = `actions-on-entity`, middle = the action surface, right = entity context), per-workflow check page, the engine/envelope/config work. What changed is **where the action's universal fields live and how the right column and action bar are composed**. The motivating problems, from the render:

1. The full-span bottom action bar (`Save Draft` / `Submit`) wasted a horizontal band and read as detached from the form it submits.
2. The RHS universal-fields card (assignees / due / description as inline edit inputs) sat above the Details/History tabs in one undifferentiated card — it read as "leftover form fields slapped into the sidebar," and its tall inputs (the description rich-text especially) crushed the tabs below, so History got almost no vertical space.
3. The whole RHS conflated **editable metadata** (universal fields, saved by their own `Update`) with **reference context** (Details / History) in one card with no hierarchy.

Root cause: the right column was doing two unrelated jobs at once. The revision **relocates the universal fields out of the RHS** — atomic values to the title bar, the free-text note to the work column — which frees the RHS to be a single, calm context column.

**Mockup (source of truth for the visuals):** `mockups/option-c-converged.html` (toggles for Form/Check and description Set/Unset). `mockups/option-c.html` and `mockups/option-c-bold.html` are retained exploration history (chip-strip-in-RHS, and a bolder slim-rail/header-meta variant).

## Decisions

### DA1 — Universal fields leave the RHS; they render in three reconciled places

Part 24's three action-level universal fields (assignees / due_date / description) no longer mount as a card-less block in the RHS (primary D2). Instead, **display** is split by the shape of each value and **edit** is unified in a modal:

- **Assignees + due date → title-bar chips.** They render in the layout `page` component's right-aligned `page_actions` slot: assignees as overlapping avatars, due date as a date pill. These are atomic values that read at a glance and suit the compact identity strip.
- **Description → a prominent callout at the top of the middle column**, shown only when set (DA2).
- **Edit → a modal.** A pencil (`✎`) button beside the title-bar chips opens a modal containing all three universal fields as inputs (the existing assignees multi-selector, `DateSelector`, `TiptapInput`) plus the standalone **Update** button. The `Update` still calls the per-workflow `{workflow_type}-update-fields` endpoint exactly as today (Part 24) — only its host moves from an inline RHS button to the modal footer. The modal is always available, so a description can be **added** even when none is set (the callout is absent until then).

This is a deliberate change to how Part 24's component is **composed** on the workspace pages, not a change to the operation it performs. The in-context `check-action-modal` is still untouched — it keeps Part 24's in-body, all-in-one arrangement; this reconciliation is the workspace pages only.

### DA2 — Description is a callout at the top of the middle column, conditional on being set

The description is free-text context for whoever works the action ("returning customer referred by Acme; prioritise the contract review…"), so it wants to be **read**, not clicked open or shrunk to a chip. It renders as a tinted callout (accent-tinted box, "Description" label) at the **top of the middle column**, above the form body (form) / review subject (check) — a brief before the work.

- **Conditional:** rendered only when the action's description is set; when unset the callout is absent entirely (no empty placeholder), and the field is still editable via the DA1 modal.
- **Width:** middle-column width, not full content-width. A description is usually a sentence or two; the middle column is correctly proportioned for it and keeps it where attention already is. (Full content-width above the columns was considered and rejected as over-prominent for the typical length.)
- **Read-only**, consistent with the rest of the action body's display affordances; editing is the modal.

### DA3 — The action bar is a separate floating (sticky) card in the middle column

The form's `Save Draft` / `Submit` (and the check page's signal buttons) move **out of the full-span page footer into the middle column**, `position: sticky` so the bar floats above the column as the body scrolls. This couples the actions to the surface they act on, kills the full-width band, and reclaims vertical space.

- **No new positioning mechanism.** The bar is the existing `modules/shared/layout/floating-actions.yaml` (`Affix` + `Card`, flat `actions:` array), unchanged. It is simply **relocated** from a full-content-width page sibling into the shell's middle column — inside the constrained grid cell it spans only the column width. The shell exposes a single flat **`actions`** slot for it.
- **Workflow-contributed buttons reuse Part 36, not a new slot.** Part 36 (shipped) already concatenates author `pages.{verb}.buttons.extra` into the bar's flat `actions:` array via `_build.array.concat` (template-side), and explicitly rejected adding an `extras`/`leading` slot to `floating-actions` (its Out-of-scope: "the layout component already accepts an arbitrary `actions:` array and needs no change"). This addendum **inherits that pattern** — still one flat `actions:` array, no slot, no `floating-actions.yaml` change.
- **Extras on the left, verbs on the right — composed in the flat array.** The bar puts the **workflow extras on the far left** and the **template-shipped signal verbs on the far right**. Achieved purely by how the template composes the flat array — `_build.array.concat: [ page_config.buttons.extra, <grow spacer>, …signal buttons… ]` — where `<grow spacer>` is a content-less `Box` with `layout: { flex: 1 1 0 }`. The spacer absorbs the free space, pushing extras left and verbs right, which **neutralises the shared bar's `justify: end`** without changing it. This reorders Part 36's current composition (which appends extras after the signals); the reorder lives entirely in the workflows templates (A3) — `floating-actions.yaml` and its other callers are untouched. The earlier draft's `last saved …` status text is **removed**; the bar is just the buttons. (Check pages carry no `buttons.extra` — Part 36 scopes that out — so the check bar is signal verbs only, no spacer needed.)

### DA4 — The RHS drops its tabs; entity Details stacks above History

With the universal fields gone (DA1), the RHS has the vertical room to show both contexts at once, so the `Tabs[Details | History]` wrapper (primary D7 / shell spec) is **removed**:

- **Form:** RHS card = an entity **Details** section (the `entity_view.slot`) stacked above a **History** section; History fills the remaining card height and scrolls internally, so several timeline entries are always visible.
- **Check:** the `entity_view.slot` is the **middle** review subject (unchanged from primary D7), so the RHS is **History only**, filling the card.

No-jarring-shift still holds: the title-bar chips, the left panel, and the RHS History section stay put across form↔check; only the middle content and the presence of the RHS Details section change — the same kind-difference primary D7 already accepted, now expressed as a stacked section instead of a tab. The single-tab-as-heading rationale in the primary shell spec is obsolete (there are no tabs); plain section headers ("Details", "History") do that job.

### DA5 — Status pill stays left; left panel unchanged

Two confirmations, recorded so the mockups aren't misread as proposing changes here:

- **Status pill on the left of the title** — the standard `title-block` placement (`title-block.yaml:48-60`: back button → status pill → title column → right-aligned `page_actions`). An exploration that moved the pill to the right was rejected for consistency with every other module page.
- **Left panel keeps the standard full-text `actions-on-entity` steps.** A slim icon-rail variant (in `option-c-bold.html`) reclaims horizontal width but needs an `ActionSteps` change; it is **not** adopted here and stays a possible later refinement (it does not block this part).

## Revised shell — `action-workspace.yaml`

The shell stays layout-only and keeps `entity_connection_id` / `reference_field` (baked) and the `_state.entity_id` mount gate. The slot set changes:

- **Removed:** the `universal_fields` slot (universal fields no longer mount in the RHS — DA1) and the RHS `Tabs` wrapper (DA4).
- **`middle`** (required) — unchanged as the caller-supplied surface. The template composes the middle column as: the **description callout** (top, conditional — DA2) → the body (form fields / review subject + comment).
- **`actions`** (new) — block array, wrapped by the shell in the **sticky floating action card** at the bottom of the middle column (DA3). The template passes `[…workflow extra buttons…, …standard verbs…]`.
- **`details_slot`** — block array baked from `entity_view.slot`. On form it renders as the RHS **Details** section (gated non-empty); check passes it empty (its slot is the middle). DA4 changes only how it's rendered (stacked section, not a tab).
- The RHS card becomes: optional **Details** section (header + `details_slot`, when non-empty) stacked above a **History** section (header + `events-timeline`, fills + scrolls).

The header is still the layout `page` component's native chrome (primary D8), with one change to what the template wires into it:

- **`page_actions`** now carries the **universal-fields chips + edit button** (assignees avatars, due-date pill, `✎` → modal — DA1). This is the reversal of D8's "due date and assignees are deliberately not in the header" — they now live in the header's existing right-aligned actions slot, which is their natural home. The subtitle still carries the action's `message` (D8 unchanged); the eyebrow still the workflow title; the status pill still left (DA5).
- The template also mounts the **universal-fields edit modal** (opened by the `✎` button).

### Diagrams (revised)

```
FORM page
┌─────────────────────────────────────────────────────────────────────────┐
│ Home / Lead · Test 1 / Onboarding / Qualify              (breadcrumb)     │
│ [In Progress]  ONBOARDING                    👤👤  📅 Jul 12  [✎]         │  ← status (L) · eyebrow · title · page_actions chips (R)
│                Qualify · "Qualify the lead."                              │
├────────────────┬──────────────────────────────┬─────────────────────────┤
│ actions-on-    │ ┌ Description (callout) ─────┐│  ┌ Details ────────────┐ │
│ entity         │ └ (only when set) ───────────┘│  │ entity_view.slot    │ │
│ (current row   │ ┌ form body ────────────────┐ │  ├─────────────────────┤ │
│  highlighted)  │ │ contact / notes / …       │ │  │ History             │ │
│                │ └───────────────────────────┘ │  │ timeline (scrolls)  │ │
│                │ ┌ actions (floating/sticky) ┐  │  │                     │ │
│                │ │ [extra…]      Save  Submit │  │  │                     │ │
│                │ └───────────────────────────┘ │  └─────────────────────┘ │
└────────────────┴──────────────────────────────┴─────────────────────────┘

CHECK page
┌─────────────────────────────────────────────────────────────────────────┐
│ … breadcrumb …                                                            │
│ [In Review]  ONBOARDING                      👤👤  📅 Jul 12  [✎]         │
│              RCA Acceptance · "Review and accept the RCA."                │
├────────────────┬──────────────────────────────┬─────────────────────────┤
│ actions-on-    │ ┌ Description (callout, opt.)┐ │  ┌ History ───────────┐ │
│ entity         │ ┌ entity_view.slot ─────────┐ │  │ timeline (scrolls,  │ │
│                │ │ review subject (read-only)│ │  │ fills the card —    │ │
│                │ ├ comment ──────────────────┤ │  │ no Details section, │ │
│                │ └───────────────────────────┘ │  │ entity is the middle│ │
│                │ ┌ actions (floating/sticky) ┐  │  │ review subject)     │ │
│                │ │ [extra…]    Reopen  Accept │  └─────────────────────┘ │
│                │ └───────────────────────────┘ │                         │
└────────────────┴──────────────────────────────┴─────────────────────────┘
```

## Reconciliation with the primary design

| Primary                                                                                                                                                                                                  | Status under this addendum                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D2** — universal fields render in the RHS for both kinds                                                                                                                                               | **Superseded** (DA1). They leave the RHS: chips → title bar, description → middle callout, edit → modal.                                                                               |
| **D7** — Details = RHS tab on form, middle on check                                                                                                                                                      | **Amended** (DA4). Details/middle split by kind is **kept**; the RHS Details is now a stacked section, not a tab.                                                                      |
| **D8** — header is a compact identity strip; assignees/due deliberately **not** in the header                                                                                                            | **Partly reversed** (DA1/DA5). Assignees + due now render as `page_actions` chips in the header. Subtitle = `message`, status pill left, full-content-width title bar — all unchanged. |
| **Shell spec** — `universal_fields` slot + RHS `Tabs[Details? \| History]`                                                                                                                               | **Revised** (DA4/DA5). `universal_fields` slot removed; `actions` slot added; RHS de-tabbed to stacked Details + History.                                                              |
| Everything else (per-workflow check page D3, degrade-path D4, modal-vs-page D6, header-is-native-chrome D8, breadcrumb D9/D10, engine-link retarget, envelope, config/validation, retiring shared pages) | **Unchanged.**                                                                                                                                                                         |

## Files-changed delta (relative to the primary design's list)

- `modules/workflows/components/action-workspace.yaml` — drop the `universal_fields` slot and the RHS `Tabs`; add a single flat `actions` slot (the relocated `floating-actions` bar, sticky, in the middle column); RHS becomes stacked Details section + History section. **`floating-actions.yaml` is not changed** (Part 36 precedent — the bar takes an arbitrary `actions:` array).
- `modules/workflows/templates/{view,edit,review,error}.yaml.njk` and `check.yaml.njk` — compose the description callout at the top of `middle`; move the existing `_build.array.concat: [ …signal buttons…, page_config.buttons.extra ]` (Part 36) into the shell's `actions` slot instead of a page-level sibling; wire the universal-fields **chips + `✎`** into the page's `page_actions`; mount the universal-fields **edit modal**. No longer pass a `universal_fields` slot or a `details_slot` into a tab.
- **Universal-fields composition (Part 24 reconciliation)** — the workspace pages consume Part 24 as: (a) the **edit** body inside a modal (reused as-is), and (b) **display** as title-bar chips + the middle description callout. Resolved (task A2): the chips, callout, and modal are **three small reusable fragments** under `components/universal-fields/` composed by all templates (not inline per template — one-correct-way, no 5-way drift); the `{workflow_type}-update-fields` operation is unchanged.
- **New: a universal-fields edit modal** mounted by each action template (form + check), opened by the title-bar `✎`. (The in-context `check-action-modal` is unrelated and still untouched.)
- `modules/workflows/components/universal-fields/universal-fields.yaml` — its prior RHS placement note is superseded; document the new split (chips + callout + modal). No change to the Update operation.

## Task impact

Part 56 (tasks 01–12) is already implemented, so this addendum ships as **new
additive tasks** (`tasks/tasks-addendum.md`, tasks A1–A4) layered on the shipped code
rather than re-opening the originals:

- **A1 — shell revise:** drop `universal_fields` slot + `Tabs`; add a single flat
  `actions` slot (the relocated `floating-actions` bar in the middle column); RHS
  stacked Details + History. `floating-actions.yaml` is **unchanged** (Part 36
  precedent — no new slot on the shared bar) (DA3/DA4/DA5).
- **A2 — universal-fields chips + callout + edit modal** (Part 24 reconciliation, DA1):
  three small fragments composed by all templates; the `mode: edit` body is reused as
  the modal content; the Update operation is unchanged.
- **A3 — form templates re-layout** (`view/edit/review/error`): chips + `✎` →
  `page_actions`; callout → middle top; buttons → `actions` slot; mount the edit modal;
  stop passing `universal_fields` (DA1/DA2/DA3/DA4).
- **A4 — check template re-layout:** same, sourced from `current_action.*`; RHS =
  History only.

The original tasks **01–12 are not re-opened** — the engine/envelope/resolver/config
work (02/03/04/10), the breadcrumb fragment (07), and page-retirement/e2e (11/12) are
unaffected; the `description` var still carries the action `message`, and the new chips
ride the existing `page_actions` slot.

## Verification (delta)

- Assignees + due render as title-bar chips on both kinds; `✎` opens a modal with all three universal fields + Update; Update still calls `{workflow_type}-update-fields`. No universal-fields inputs render in the RHS.
- Description renders as a middle-top callout when set, is absent when unset, and is editable via the modal in both states.
- Action buttons render in a sticky floating card at the bottom of the middle column (workflow-extra on the left, standard verbs on the right); no full-span footer.
- RHS shows entity Details above History (form) / History only (check); History fills and scrolls.
- No-jarring-shift: title-bar chips, left panel, and RHS History hold across form↔check; only the middle and the RHS Details section change.
