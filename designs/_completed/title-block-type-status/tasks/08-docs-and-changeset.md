# Task 8: Document the title-bar prop interface and add the changeset

## Context

The title-bar prop interface threaded through the `page` component (`title`, `type`, `status`, `status_enum`, `doc`, `loading`, `page_actions`, `show_back_button`, `back_link`) is currently **undocumented** — only inline comments in `title-block.yaml` describe it. Task 2 finalised the interface (added `type`/`status`/`status_enum`/`loading`, removed `badge_text`/`badge_color`); tasks 3–7 migrated all in-repo callers.

`badge_text`/`badge_color` are removed, not deprecated — a breaking change to the title-bar interface that any external consumer override passing `badge_*` would silently lose.

The repo uses changesets (`.changeset/*.md`) with a frontmatter package + bump block followed by a prose description. See existing entries like `.changeset/floating-actions-right-align.md` for format.

## Task

### A. Document the prop interface in `modules/layout/README.md`

Add a subsection documenting the title-bar props passed through the `page` component's `_ref` vars. Cover each prop with type, default, and purpose:

- `title` — string. The entity name/identifier only — never a `"{type}: {name}"` concatenation.
- `type` — string, default `null`. Entity-type eyebrow rendered uppercase above the title. Conventions: **view** → the entity type alone (e.g. `Company`); **edit** → `Edit {type}`; **create** → the create verb + type (usually `New {type}`, but follow the domain's verb — user-admin uses `Invite {…} User`). Passed in normal case; the component uppercases.
- `status` — string, default `null`. Status slug (runtime), looked up in `status_enum`; hidden when null/unmatched.
- `status_enum` — object, default `null`. Status-enum map (build-time `_ref`) using the standard `{ color, borderColor, titleColor, title }` entry shape (`color`→fill, `borderColor`→border, `titleColor`→text, `title`→label). Any existing status enum works as-is. Point at the override-merged `components/<enum>.yaml` map where one exists (to preserve per-app `*_display` overrides); reference a raw `enums/` map only when the enum has no override wrapper.
- `doc` — change-stamp doc for the subtitle (unchanged).
- `loading` — boolean, default `false`. When truthy, title/subtitle/status render as skeletons; the type eyebrow always renders immediately (static config). Gate on `_not: { _request: <id> }` for request-backed pages, or `_not: { _state: <key> }` for CallAPI+SetState pages.
- `page_actions`, `show_back_button`, `back_link` — unchanged.

Note the standard status-enum colour contract and link to the enums idiom (`docs/idioms.md`). Mention that static list/index page titles should leave `loading` off and pass no `type`/`status`.

### B. Add the changeset

Create `.changeset/<descriptive-name>.md` (e.g. `title-block-type-status.md`) with the appropriate package bump. Describe:

- The new `type` eyebrow, `status` + `status_enum` pill, and opt-in `loading` skeleton on the shared title block.
- **Breaking:** `badge_text` / `badge_color` are removed (replaced by `status` + `status_enum`). Any external/consumer title-bar override passing `badge_*` silently loses its badge and must migrate to a status enum. The wholesale `title_block` override path is unaffected.
- The migrated callers (workflow overview + group overview, contacts/activities/user-admin view/edit/new) and the new `modules/workflows/enums/action_group_statuses.yaml` enum.

Determine the package name / bump level by inspecting `.changeset/config.json` and existing entries (the layout/title-block change is a module-config change, so match how prior module changesets in this repo are scoped).

## Acceptance Criteria

- `modules/layout/README.md` documents every title-bar prop (`title`, `type`, `status`, `status_enum`, `doc`, `loading`, `page_actions`, `show_back_button`, `back_link`) with type/default/purpose, the status-enum contract, and the enums-idiom link.
- A new `.changeset/*.md` exists describing the feature and calling out the `badge_*` removal as a breaking change.
- README and the task-2 manifest/interface agree (no stale `badge_*` references remain in the README).

## Files

- `modules/layout/README.md` — modify — add the title-bar prop-interface subsection.
- `.changeset/title-block-type-status.md` — create — feature + breaking-change note.

## Notes

Depends on task 2 (final interface) and is best written after tasks 3–7 so the migration list in the changeset is accurate. Does not block the migrations.
