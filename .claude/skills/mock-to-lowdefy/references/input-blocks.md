# Default block vocabulary

The FULL default input/control vocabulary that ships with a Lowdefy app — when a
mock shows a control, the right block is on this list (plus `EventsTimeline` from
`@lowdefy/modules-mongodb-plugins`). This is a starting index; **verify the exact
properties of any block you place with `lowdefy_get_schema` via the `lowdefy-docs`
MCP** — it is release-exact and includes the project's local plugins.

## Input blocks (category: input) — the complete set

| Block                                                 | Use for                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `TextInput`                                           | single-line text                                              |
| `TextArea`                                            | multi-line text                                               |
| `ParagraphInput`                                      | inline-editable paragraph text                                |
| `TitleInput`                                          | inline-editable heading                                       |
| `PasswordInput`                                       | password fields (masked)                                      |
| `PhoneNumberInput`                                    | phone numbers (CORE block — no plugin needed)                 |
| `NumberInput`                                         | numeric entry                                                 |
| `Selector`                                            | single-select dropdown                                        |
| `MultipleSelector`                                    | multi-select dropdown                                         |
| `AutoComplete`                                        | type-ahead text with suggestions                              |
| `ButtonSelector`                                      | segmented button-group choice                                 |
| `SegmentedSelector`                                   | antd Segmented control (sliding segment)                      |
| `RadioSelector`                                       | radio group                                                   |
| `CheckboxSelector`                                    | checkbox group                                                |
| `CheckboxSwitch`                                      | single checkbox as a boolean                                  |
| `Switch`                                              | toggle switch                                                 |
| `DateSelector`                                        | single date                                                   |
| `DateTimeSelector`                                    | date + time                                                   |
| `DateRangeSelector`                                   | date range (from–to)                                          |
| `MonthSelector` / `WeekSelector`                      | month / week pickers                                          |
| `Calendar`                                            | full inline calendar                                          |
| `Slider`                                              | numeric slider                                                |
| `RatingSlider`                                        | star rating                                                   |
| `ColorSelector`                                       | color picker                                                  |
| `TreeSelector` / `TreeMultipleSelector` / `TreeInput` | hierarchical selection / tree editing                         |
| `ListSelector`                                        | selectable list of rows (also the display-list workhorse)     |
| `Pagination`                                          | page controls (an input block — binds current/pageSize state) |
| `AgGridInputBalham`                                   | editable data grid (Balham theme only, as with display grids) |
| `TiptapInput` / `TiptapMentionInput`                  | rich text / rich text with @mentions                          |

Label handling on ALL inputs (the `properties.label` OBJECT):
`label: { title: Legal name, span: 24, extra: helper text, colon: false }` —
`span: 24` puts the label above the field; `extra` renders the sub-hint;
`label: { disabled: true }` hides it entirely (dense rows, table-embedded inputs,
switches with their own text). `size: small` matches a compact theme. Input block
id == its exact state path (`id: org_profile.industry`).

## Containers

Box · Card · Modal · ConfirmModal · Drawer · Tabs · Collapse · Descriptions ·
Alert · Result · Label · Tooltip · Popover · Badge · Affix · Flex · Masonry ·
Splitter · Carousel · Watermark · ConfigProvider · page types (PageHeaderMenu ·
PageSiderMenu · PageSidebarLayout) · Layout/Header/Content/Footer/Sider ·
DropdownMenu · MobileMenu · Span

## Display

Title · Paragraph · Html · DangerousHtml · Markdown · MarkdownWithCode · Button ·
DropdownButton · FloatButton · Icon · Img · Avatar · Tag · Statistic · Progress ·
ProgressBar · Divider · Breadcrumb · Menu · Steps · Anchor · QRCode · Search ·
EChart · AgGridBalham (display grid — Balham only) · Skeleton family
(Skeleton/-Avatar/-Button/-Input/-Paragraph) · Spinner · AgentChat ·
AgentConversations

## Lists

List · ControlledList (editable rows) · MasonryList · TimelineList
