# Task 3: The confirm sheet component

## Context

The confirm sheet is the surface where a user names the report and reviews/reorders the sections
assembled from their ticked results, then saves. It is a `Modal` mounted once on the chat page
(task 4 mounts it and seeds its state; this task builds the component itself).

It is a **confirm, not a builder**: it edits what the conversation already produced. It ships
**filterless first** — reserve a filters region but author no filters (the filter picker is the
separate `filter-picker` sub-design).

The sheet reads two page-state keys that task 4 seeds when the user presses **Save as report**,
and writes the report via the `create-report` endpoint (task 2).

## Interfaces

- **Consumes:**
  - `create-report` endpoint (task 2) — `CallAPI` with payload
    `{ spec: { title, sections }, conversation_id }`, returns `{ ok, report_id, url }`.
  - Page state seeded by task 4:
    - `sheet_title` (string) — the pre-filled report name; bound to the name `TextInput`.
    - `sheet_sections` (array) — the assembled, ordered report sections; the `ControlledList` id.
    - `conversationId` (string) — set at the chat page's `onInit`; sent as `conversation_id`.
- **Produces:** a single-block component file `_ref`'d by `chat.yaml`, whose root `Modal` has a
  **stable block id** task 4 opens via `CallMethod setOpen`. Use `save_report_modal`.
  - State keys this task defines and task 4 must seed: `sheet_title`, `sheet_sections`.
  - Each element of `sheet_sections` is a finished report section (assembled in task 4):
    - chart: `{ type: chart, label, chart, query, x, y }`
    - table: `{ type: table, label, query, columns }`
    - download: `{ type: download, label, query }`

## Task

**Create `modules/ai-reporting/pages/chat/components/save_report_sheet.yaml`** — a one-block
sequence whose root is the `Modal` (so the chat page `_ref`s it directly into a `blocks:` list,
matching how `rename_conversation_modal.yaml` / `delete_conversation_modal.yaml` are `_ref`'d).

Root `Modal` (`id: save_report_modal`):

- Wide and full-height (`width` generous, e.g. a large px/`%`, and a tall body); the design calls
  the sheet deliberately generous. Title e.g. "Save as report".
- Body blocks, in order:
  1. **Name** — `TextInput` `id: sheet_title`, label "Report name". Its id _is_ the state path,
     so it two-way binds to the seeded `sheet_title`.
  2. **Sections** — a `ControlledList` `id: sheet_sections` over the seeded array. Each row shows
     the section's `label` and a small type indicator (e.g. the section `type`), plus row controls:
     - **Move up** — `Button`, `onClick` → `CallMethod { blockId: sheet_sections, method: moveItemUp, args: [ <row index> ] }`.
     - **Move down** — `CallMethod moveItemDown` with the row index.
     - **Remove** — `CallMethod removeItem` with the row index.
       Use the list item's index operator for the args (the `$` index within the list). Confirm the
       exact method names and index argument via the `lowdefy-docs` MCP (`lowdefy_get_schema` /
       `lowdefy_get_examples` for `ControlledList`) — the design verified `moveItemUp(index)`,
       `moveItemDown(index)`, `removeItem(index)` are the registered `CallMethod` targets.
  3. **Filters region (reserved, empty)** — a placeholder container with a short comment that the
     filter picker (`filter-picker` sub-design) fills this region later. Render nothing user-facing
     now beyond, at most, a disabled/"coming soon" affordance is **not** wanted — keep it an empty
     reserved slot so filterless reports save cleanly. A YAML comment marking the region is enough.
- Footer / `onOk` (or an explicit Save `Button`):
  - `CallAPI` `create-report` with payload:
    ```yaml
    spec:
      title:
        _state: sheet_title
      sections:
        _state: sheet_sections
    conversation_id:
      _state: conversationId
    ```
  - On success: close the modal (`CallMethod setOpen { open: false }` on `save_report_modal`) and
    navigate to the returned report — `Link`/`SetState`-driven redirect to
    `_api: <create-report>.response.url`. **Superseded as built:** navigate with
    `pageId` + `urlQuery: { report_id }`, never the returned `url`. `Link`'s `url` param means an
    external address and gains an `https://` prefix when the value has no scheme, so the
    root-relative path the endpoint returns resolves to a host named after the module entry. The
    returned `url` is for the assistant to hand a person in chat. (Navigating to the new report is the natural post-save
    behaviour — the agent route likewise "replies with the link"; this is not separately pinned by
    the design, so keep it simple and obvious.)
  - Disable Save when `sheet_title` is empty or `sheet_sections` is empty.

Use only existing blocks: `Modal`, `TextInput`, `ControlledList`, `Button` (+ `Paragraph`/`Title`
for row labels). Look up any block prop you are unsure of via the `lowdefy-docs` MCP rather than
guessing.

## Acceptance Criteria

- `save_report_sheet.yaml` exists as a one-block `Modal` (`id: save_report_modal`) with a name
  input (`id: sheet_title`), a `ControlledList` (`id: sheet_sections`) with per-row up/down/remove
  wired to `moveItemUp`/`moveItemDown`/`removeItem`, a reserved (empty) filters region, and a Save
  that `CallAPI`s `create-report` with the payload above.
- Save is disabled when the name or the section list is empty.
- `pnpm ldf:b` builds clean once the sheet is mounted (task 4). Until then, verify the file
  parses by mounting it temporarily or rely on task 4's build check — note it in your report.

## Files

- `modules/ai-reporting/pages/chat/components/save_report_sheet.yaml` — create — the confirm sheet.

## Notes

- **Path deviation from the design:** design.md line 83 says
  `modules/ai-reporting/pages/components/save_report_sheet.yaml`, but every existing chat component
  lives under `pages/chat/components/` and the sheet is chat-only. This task places it under
  `pages/chat/components/` for consistency with `table_card.yaml` and the two conversation modals.
  If the user prefers the literal design path, move the file and update task 4's `_ref`.
- The sheet **assembles nothing itself** — task 4 seeds `sheet_sections` already section-shaped.
  The sheet only edits (reorder/remove), names, and saves.
- Do not add KPI/markdown/filter authoring controls — out of scope (filterless-first).
