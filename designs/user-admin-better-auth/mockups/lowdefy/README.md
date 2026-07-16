# `all` page — skills 2 + 3 output (frame → Lowdefy → content)

The `all` page, produced from [`../frames/all.html`](../frames/all.html)
following the **spirit** of skills 2 (frame → layout) and 3 (fill content),
but built on this repo's **shared components** and real blocks rather than eval
placeholder boxes. All eval scaffolding (region tags, `er_` ids, the
`#2b2b31`/label grading recipe) is intentionally dropped.

Skill 2 gave the structure (shared layout + tabs + placeholder slots); skill 3
replaced every slot with a real, mock-data-hydrated block (`AgGridBalham`
tables, `TextInput`/`Selector`/`SegmentedSelector` filters) and left
`TODO(request-substitute)` markers for the requests step.

## Files & destination

```
pages/all.yaml                      → modules/user-admin/pages/all.yaml
components/users_tabs.yaml          → modules/user-admin/components/users_tabs.yaml
components/members_filters.yaml     → modules/user-admin/components/members_filters.yaml
components/invitations_filters.yaml → modules/user-admin/components/invitations_filters.yaml
components/table_members.yaml       → modules/user-admin/components/table_members.yaml
components/table_invitations.yaml   → modules/user-admin/components/table_invitations.yaml
```

Refs (`module: layout`, `components/*`, `../shared/layout/pagination.yaml`)
are written to resolve from the **module root** (`modules/user-admin/`), so the
files drop straight into the module tree. They are **not buildable here** —
`page.yaml` pulls in `user-account`, `notifications`, menus and connections, so
it only resolves inside the full app build (`apps/demo`).

## Frame → Lowdefy mapping

| Frame id                                                 | Realized by                                                                           | Notes                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `shell`                                                  | `_ref layout/page` → `PageHeaderMenu`                                                 | shared layout, not hand-rolled                                      |
| `breadcrumb`                                             | `page.yaml` `breadcrumbs` var                                                         | chrome, not a block                                                 |
| `page_title` / `title_text`                              | `title-block.yaml` via `title` / `type` (eyebrow) / `description` (subtitle) vars     | shared                                                              |
| `page_actions` → `download_excel_btn`, `invite_user_btn` | title-block `page_actions` slot; real `Button`s                                       | Download gated by `download` var                                    |
| `tabs`                                                   | `Tabs` block (`users_tabs.yaml`)                                                      | headers from `properties.tabs`; each tab is a self-contained view   |
| `filters` (per tab)                                      | `members_filters.yaml` / `invitations_filters.yaml` (`Box` + placeholders + `Button`) | two independent sets — own state, own request, fixed status options |
| `members_group` / `invitations_group` tables             | `Html` placeholders → `AgGridBalham` (content pass)                                   |                                                                     |
| `*_pagination`                                           | `_ref ../shared/layout/pagination.yaml`                                               | shared; `request_id` = `get_members` / `get_invitations`            |

## Skill-3 content ledger

| Slot                                    | Block chosen        | Data / mock              | Notes                                                  |
| --------------------------------------- | ------------------- | ------------------------ | ------------------------------------------------------ |
| `members_search` / `invitations_search` | `TextInput`         | —                        | placeholder text; `label.disabled`                     |
| `members_role` / `invitations_role`     | `Selector`          | Admin/Editor/Viewer      | TODO: role catalog (`auth.roles`)                      |
| `members_status`                        | `SegmentedSelector` | All / Active / Suspended | fixed per tab                                          |
| `invitations_status`                    | `SegmentedSelector` | All / Invited / Expired  | fixed per tab                                          |
| `members_table`                         | `AgGridBalham`      | 5 mock rows              | avatar + tag(`colorFrom`) cells; row-click → workspace |
| `invitations_table`                     | `AgGridBalham`      | 2 mock rows              | avatar + tag; Actions column                           |

## Still open (requests step / follow-ups)

- Every `TODO(request-substitute)` marker: `get_members`, `get_invitations`,
  role-catalog options, the Download export, and invitation Actions wiring.
- **Roles render as joined text**, not chips — the mock shows chips, but a
  robust chip `cellRenderer` needs build verification I can't do here; flagged
  with a TODO. Same for invitation **Actions** (labels only, not live buttons).

## Deviations & findings (for the skill-team writeup)

1. **Filters moved into the tabs (two independent sets).** The frame drew one
   shared filter bar above the tables. The real design wants a filter set per
   tab — each with its own state, its own request, and fixed status options —
   so each `*_filters` component lives inside its tab slot. Fully supported (a
   Tabs slot is just blocks). The frame's single-shared-bar model couldn't
   express "two parallel filter states, one per tab."
2. **Don't touch the app theme.** Skill 3's first step is proposing an
   app-level `theme.antd.token` set from the mock. But (a) a **module** doesn't
   own the app theme, and (b) on an app with an established theme, chasing
   mockup pixels with app-wide theme edits is wrong — mock/theme mismatch is
   expected and fine. Skill 3 assumes it builds a self-contained app with theme
   control; a module author has none.
3. **Gap drift.** The shared `page-content` uses `gap: 12`; the frame used `13`.
   The shared component wins.
4. **AgGrid height ≠ frame height.** The frame's table heights (233/116px) are
   mock-row-count specific; a real paginated list uses the repo idiom
   (`height: 70vh`). Frame geometry doesn't carry to data blocks.
5. **No standalone build/verify.** Skills 2 & 3 lean on rendering to confirm
   geometry and catch bad block config. Output built on shared components can't
   build in isolation, so this rests on the frame's verified numbers +
   confident repo patterns, not a fresh render — which is why roles/actions
   were kept to safe patterns.
