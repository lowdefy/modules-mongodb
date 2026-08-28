# Task 12: Three columns, both sides collapsible, and a panel that is always there

## Context

`modules/ai-reporting/pages/chat.yaml` is a `Box` with `layout: { gap: 16 }` and three child boxes
at grid spans 5 / 12 / 7: `conversations_panel`, `chat_panel`, `results_panel`. Neither side
collapses, so the transcript can never run wide. And the whole results column is
`visible: false` until `charts` or `downloads` is non-empty — so a first-time user never learns
the panel exists, and it teaches nothing until they have already succeeded without it.

Left is history, middle is now, right is what you produced. Both side panels collapse to strips
(the rail to icons, the panel to counts) so the transcript can run full-width when the user is
reading rather than producing, and the two collapses are mirror images so they read as one
pattern.

**Collapse state is session-scoped, not persisted.** There is no client-storage action — the set
is `CallAPI`, `CallMethod`, `CopyToClipboard`, `DisplayMessage`, `Fetch`, `Link`, `Login`,
`Logout`, `Publish`, `Request`, `Reset`, `ResetValidation`, `ScrollTo`, `SetDarkMode`, `SetFocus`,
`SetGlobal`, `SetLocale`, `SetState`, `Subscribe`, `Throw`, `Unsubscribe`, `UpdateSession`,
`Validate`, `Wait` — and `SetGlobal` lives in memory for the session, not across reloads. So
persisting the collapse per user costs a `ui_state` document and a write per toggle, for a
preference re-expressed with one click. `SetGlobal` it is: the state follows the user between the
chat, list and report pages within a session and resets on reload. If a real complaint appears the
endpoint is a later, additive change and nothing about the UI has to move.

Block facts that shape the layout, read from the installed source:

- **`AgentConversations` sets its own width** — it renders a `div` with
  `style: { width: width ?? 250, borderRight, overflow: 'auto' }`. So the rail's 232px is the
  block's `width` property, not just the parent box's.
- **It has no collapsed mode of its own**, so the rail's icon strip is a separate `Box` of
  `Button`s shown when the rail is hidden.
- **`AgentChat.maxWidth` is a number of pixels** (default 800) — "Maximum width of the chat
  container in pixels".
- **`_media` is a client operator** returning `{ size, width, height, darkMode, … }` with
  breakpoint sizes `xs`…`2xl`. It is `dynamic`, so it re-evaluates.

## Interfaces

- **Produces:**
  - global keys `reporting_rail_collapsed` and `reporting_panel_collapsed` (booleans), read by
    every later chat task and available to the other reporting pages in the same session;
  - the `results_panel` column, always rendered, hosting an empty-state explainer and a
    `SegmentedSelector` scope control bound to `_state: results_scope` with values
    `all` / `charts` / `tables` / `exports`.

## Task

**Widths.** Replace the 5 / 12 / 7 grid spans with the expanded layout **232px / fluid /
348px**:

- `conversations_panel` — `layout: { flex: '0 0 232px' }`, and set the `AgentConversations`
  block's `width: 232` so the block's own div matches its column;
- `chat_panel` — `layout: { flex: '1 1 auto' }`, with a **~62ch measure** on the middle column:
  set `AgentChat`'s `maxWidth` to the pixel value that yields roughly 62 characters at the theme's
  body font size, verify it in the browser at the expanded layout, and comment the number with
  what it is for (prose stays readable at any window width). Keep `height: 75vh`.
- `results_panel` — `layout: { flex: '0 0 348px' }`.

**Collapse.** Two toggles, mirror images.

- In `onInit`, seed both globals with `SetGlobal`, defaulting to **collapsed on a narrow
  viewport** — read `_media: size` (or `_media: width`) and collapse both when the viewport is
  below the layout's comfortable width. Comment the breakpoint choice.
- Each side panel gets a header row with a collapse `Button` (an icon button) whose `onClick`
  `SetGlobal`s the matching key to the negation of its current value.
- When `reporting_rail_collapsed`, hide `conversations_panel` and show a strip in its place: a
  `Box` at `layout: { flex: '0 0 auto' }` holding an expand `Button` and a new-chat `Button`
  firing the same actions the rail's `creation` does.
- When `reporting_panel_collapsed`, hide `results_panel` and show its strip: an expand `Button`
  plus **counts** — the same `_array.length` reads the tabs already use, so a user can see there
  are three charts waiting without expanding.
- Both strips are visible only in their collapsed state; both full panels only in their expanded
  state. Use `visible:` on each, reading the global.

**The panel is visible when empty.** Delete the `visible:` conditions on `results_title` and
`results_tabs` — the whole column stays rendered. Add an explainer `Paragraph` shown while all
three result arrays are empty: _charts, tables and exports you produce land here; tick them to
save a report_. One Box of copy, and it removes the entire class of "I didn't know that was
there".

**The scope control.** Replace the `Tabs` block's role as the panel's navigation with a
`SegmentedSelector` above the content, `id: results_scope`, options `All` / `Charts` / `Tables` /
`Exports` (values `all` / `charts` / `tables` / `exports`), defaulting to `all`. It lives above
the content so it is the panel's stable home for scoping and does not appear and disappear with
the results.

In this task, wire the existing **Charts** and **Exports** sections to the control: the charts
`List` is visible when the scope is `all` or `charts`, the downloads `List` when it is `all` or
`exports`. Leave the `Tables` option present and its section empty — task 14 fills it. Remove the
`Tabs` block and move its two slots' contents up into the panel body, keeping the per-section
empty-state `Paragraph`s as they are.

**Consult the block schemas via the `lowdefy-docs` MCP tools** (`lowdefy_get_schema`,
`lowdefy_get_examples`) for `SegmentedSelector`, `Button` and `Box` layout properties rather than
guessing property names.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds and the generated
  `.lowdefy/server/build/pages/reporting/chat.json` carries the three columns at the new widths.
- Against a running app at a wide viewport: both panels start expanded; collapsing the rail widens
  the transcript and leaves an icon strip with a working New chat button; collapsing the panel
  leaves a strip showing the result counts; expanding either restores it.
- Navigating to the reports list and back within the session preserves both collapse states;
  reloading the page resets them.
- At a narrow viewport, both panels start collapsed.
- The panel renders with its explainer copy on a brand-new conversation, before any tool has run.
- Switching the scope control filters the panel's sections; `Tables` shows an empty section.

## Files

- `modules/ai-reporting/pages/chat.yaml` — modify — widths, both collapses, panel visible-when-empty,
  the scope control, `Tabs` removed

## Notes

The antd `Splitter` block — per-panel `collapsible` and `resizable` with an `onCollapse` event —
could carry both edges instead of hand-rolled strips. Worth a look while you are in here: if the
hand-rolled version reads as two features rather than one pattern, `Splitter` is the better shape.
Either way the collapse state still lives in `SetGlobal`.

Block ids stay snake_case, action ids stay snake_case.

Do not touch the `onSelect` race guard on `set_results` — the `skip:` comparing `_event: key`
against `_state: conversationId` is load-bearing (selecting A then B quickly runs two chains
concurrently, and a late response would persist A's transcript under B). Later tasks extend that
step; none of them may drop the guard.
