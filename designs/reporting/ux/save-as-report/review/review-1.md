# Review 1

### 1. The confirm sheet may want to be a page rather than a `Modal`

> **Resolved.** Keep the `Modal`, made deliberately generous (wide, full-height). The "confirm, not a builder" non-goal is load-bearing across the reporting design and a modal enforces it structurally, where a page would invite section-composition and need an empty state for a selection-clearing reload. State loss is not the deciding factor — `SetGlobal` survives navigation, so a page was feasible; the choice is framing. A `Drawer` is noted as the same trade in a different shape, to weigh against a running app if the modal feels tight. Surface decision, revisitable; the endpoint/validation/insert are unaffected. Recorded in the design's "One confirm sheet" section. (review-2 #5 fixed the stale line-55 justification that this finding's "blocker is not one" section had already flagged.)

**Raised by the user: there is a lot going on in the sheet, and it might work better as a
page.**

The design commits to a modal in three places — "one modal component, one endpoint" (line 7),
"New `modules/reporting/pages/components/save_report_sheet.yaml` — the confirm sheet, opened
by both routes" (line 67), and the block list "`Modal` + `TextInput` + `ControlledList` +
`CheckboxSwitch` + `Selector` + `SegmentedSelector`" (line 47). Plate 3 draws it as a sheet,
and the parent's plate table calls it one (`../design.md:31`).

The concern is fair. What the sheet holds: a name, a section list that reorders and removes
per row (`ControlledList` with `moveItemUp` / `moveItemDown` / `removeItem`), and a filter
picker where each filter is a field `Selector` plus, for a looked-up option list, a label-field
choice — repeated per filter. That is a form with two nested variable-length lists inside a
modal that already scrolls, on top of a transcript that also scrolls.

**The blocker people assume is not one.** The obvious objection to a page is that the
selection lives in chat page state (`charts.$.selected` and the panel's state arrays, line 29)
and Lowdefy `_state` does not survive navigation. But `SetGlobal` does: [chat](../../chat/design.md#collapse-state-is-session-scoped-not-persisted)
already establishes and relies on exactly this — global state "follows the user between the
chat, list and report pages within a session and resets on reload." So the page route is
`SetGlobal` the selected result specs → `Link` to a `save-report` page → read `_global`. No
draft document, no server round trip before the confirm.

The real trade-off is narrower than modal-vs-page comfort:

- **A page is reachable with no state.** `SetGlobal` resets on reload, so `/reporting/save-report`
  can be landed on — or refreshed — with nothing selected, and needs an empty state that sends
  the user back to the chat. A modal cannot be reached that way at all. This is the one thing
  a page costs that the modal does not.
- **A page gets room, back-button semantics, and no nested scroll**, which is the whole reason
  to want it.
- **It risks reading as the thing the design refuses to build.** "The sheet is a confirm,
  never a blank form" (line 33) and "A report builder UI" is a non-goal (line 102, and the
  parent's). A modal enforces that framing structurally — it is visibly an interruption over
  the answer it came from. A full page invites the next request to be "let me add a section
  here", which is precisely the pressure the non-goal exists to refuse. If the page wins, the
  design should say how it keeps looking like a confirm (arriving pre-filled, no add-a-section
  affordance, a single primary action).

Consequences if it becomes a page: a new `modules/reporting/pages/save-report.yaml` with a
kebab-case page id, a page export in `module.lowdefy.yaml`, the parent's plate table and
`docs/reporting/index.md`'s surfaces table updated, deviation recorded against plate 3, and
the two routes into it (selection button and the typed path) become `Link`s carrying
`SetGlobal` rather than `CallMethod: open`. The endpoint, the validation and the insert shape
are unaffected either way — this is a surface decision only.

A third option worth pricing before choosing: keep the `Modal` and make it `width`-generous
and full-height. If the crowding is really the filter picker, that alone may settle it, and it
costs nothing structural.
