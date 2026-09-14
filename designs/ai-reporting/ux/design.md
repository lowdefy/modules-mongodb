# Reporting UX: the chat surface, saved reports, and the report page

The reporting module carries two jobs on one surface — explore data conversationally, and turn what you found into a saved report — and today the second one is effectively invisible: a report exists only if the user happens to type "turn this into a report". Everything downstream inherits that gap. The conversations rail has no search, rename or recency grouping; the results panel is hidden until a chart arrives, so a first-time user never learns it exists; tabular answers are stranded as transcript text because only charts and downloads stream back as artefacts; the saved-reports page is stacked cards with Open and Delete, with no favourites, no search, no notion of a report anyone else can see; and the report page offers no way to carry a question forward.

This design makes both jobs legible and gives saved reports a life cycle: **created from selected results, found in a list built for finding, published or kept private, retired by a single soft delete, and recoverable.** It is a UX and endpoint design — it does not touch the query engine or the safety model. The catalog stays the allowlist, the read-only principal stays the second layer, and every new endpoint is a read or a write against the reports and conversations stores.

The work splits into five sub-designs by surface. **This parent doc carries the framing, the data model, the cross-cutting invariants every sub-design enforces, the endpoint inventory, and the non-goals and risks that belong to none of them alone.** Each sub-design is self-contained at its own surface.

| Sub-design                                 | What it owns                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ownership](ownership/design.md)           | The reports data model and every endpoint over it — private-by-default visibility, role-gated publishing, per-user favourites, server-side owner checks, soft delete and restore. Server-side only; no UI.                                                                         |
| [chat](chat/design.md)                     | Plates 1–2 — the two-track empty state and the `setInput` block change it rests on, the always-visible results panel, both side panels collapsible, the conversations rail's search / grouping / rename / delete, tabular results as panel artefacts, and inline mermaid sketches. |
| [save-as-report](save-as-report/design.md) | Plate 3 — result selection as the entry point to a report, the confirm sheet both routes converge on, the `create-report` endpoint, and the report ↔ chat link it is the only path able to populate.                                                                               |
| [reports-list](reports-list/design.md)     | Plates 4–5 — the list rebuilt as a scannable grid with three scopes and server-side search / sort / paging, the row action menu and the one missing cell type, the recovery page, and the empty states.                                                                            |
| [report-page](report-page/design.md)       | Plate 6 — the provenance line, per-section CSV, continue-in-chat, owner-only recoveries for a broken section, the `Dynamic` types-list failure mode, and the one open problem the shipped filters left behind.                                                                     |

**Ownership ships first, and ships alone.** It is entirely server-side: the data model, the scope semantics, and the authorization checks land with tests and change no page. The four UI sub-designs then build against a fixed contract rather than co-evolving with it. Nothing else in the split is strictly ordered — chat, the list and the report page are independent of each other, and save-as-report needs only chat's results panel.

## The plates

**[`wireframes.html`](wireframes.html) is part of this design.** Six annotated plates with numbered callouts; open it in a browser (it is self-contained, light/dark, and its chart palettes are CVD-validated). Where a sub-design and the wireframes differ, the sub-design is the decision, and it records the deviation.

**[`wireframes-blocks.html`](wireframes-blocks.html) is the same deck built.** Each surface redrawn as it lands in the blocks we actually have, every region labelled with the block behind it, and each bend from the drawing marked where it happens. Read it beside the plates when implementing.

Both decks stay at this level: they are one artefact covering all six surfaces, and each sub-design cites its plates rather than carrying a copy.

| Plate | Surface                                  | Status                       | Sub-design                                 |
| ----- | ---------------------------------------- | ---------------------------- | ------------------------------------------ |
| 1     | `/reporting/chat` — first run            | new                          | [chat](chat/design.md)                     |
| 2     | `/reporting/chat` — mid-conversation     | page exists, panels reworked | [chat](chat/design.md)                     |
| 3     | Save-as-report confirm sheet             | new                          | [save-as-report](save-as-report/design.md) |
| 4     | `/reporting/reports-list`                | page exists, rebuilt         | [reports-list](reports-list/design.md)     |
| 5     | Delete confirm · recovery · empty states | new                          | [reports-list](reports-list/design.md)     |
| 6     | `/reporting/report?report_id=…`          | page exists                  | [report-page](report-page/design.md)       |

Filter **mechanics** — multi-select, array-field semantics, looked-up options — are **out of scope for this whole design** and are built in [`designs/ai-reporting/report-filters/design.md`](../report-filters/design.md). Plates 3 and 6 show its UI; the engine reasoning lives there. The **picker UI** that authors a filter inside the save-report sheet (plate 3) is in scope for this design, carved into its own sub-design [`save-as-report/filter-picker`](save-as-report/filter-picker/design.md); save-as-report ships filterless until it lands. Filter **placement** on the report page is in scope, and is the one open problem the implemented filters left behind — see [report-page](report-page/design.md#the-filter-row-says-nothing-about-what-it-scopes).

## Why this, and why now

The engine is done and safe; what it lacks is a product around it. Every gap above is a direct consequence of the module having grown outward from the agent tools: the surfaces that exist are the ones a tool call needed, and the ones a _user_ needs — find, keep, share, retire, come back — were never designed. That shows up as a specific failure: the module's second job is undiscoverable, so most sessions end with an answer nobody kept.

Doing it now, before the module goes into apps at scale, matters because half of these decisions are **data-model decisions** (ownership, visibility, favourites, the conversation link) and every one of them is cheaper to make before reports exist in production stores than after. That is also why [ownership](ownership/design.md) is first in the sequence rather than a detail inside the surfaces that read it.

## Data model

The model is stated here once because four sub-designs read it. [ownership](ownership/design.md) owns the semantics, the defaults and the writers; `conversation_id` has two populators — [save-as-report](save-as-report/design.md) on the sheet route and the `emit-data-parts` turn-end hook on the agent route (specified in [reports-from-chat](reports-from-chat/design.md), which ties back the reports `generate_report` creates unlinked); [reports-list](reports-list/design.md), [report-page](report-page/design.md) and the chat panel's "Saved from this chat" section ([reports-from-chat](reports-from-chat/design.md)) are readers.

**Field names are `snake_case`, and the audit fields are change stamps.** That is the repo convention (`apps/demo/.claude/guides/data-schema.md`: snake_case everywhere, `created` / `updated` / `deleted` as `{ timestamp, user: { name, id } }`), and reporting now follows it. Three names stay camelCase because they are not this module's to choose — they belong to the agent framework and the `AgentChat` block: the `conversationId` block property and hook-payload key, the `messages` / `steps` / `toolResults` hook payload, and `dataParts` as the key the framework reads parts back from. Everything reporting itself names is snake_case, so the mix is a boundary, not a drift.

Additions to the report document (existing fields unchanged):

| Field          | Type                    | Notes                                                                                                                                                                                                  |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `visibility`   | `"private" \| "shared"` | Defaults `private`. Only a `share_roles` holder may set `shared`.                                                                                                                                      |
| `favourite_of` | `string[]`              | User ids; projected to a boolean for the caller. Defaults `[]`.                                                                                                                                        |
| `spec_version` | `number`                | `1`. Written on insert by every creator, and **copied** by `duplicate-report` rather than re-stamped, since the copy carries the original's spec verbatim. The validator may loosen but never tighten. |

Unchanged and load-bearing: `owner` (`{ user_id, name }` — every scope and mutation matches `owner.user_id`), `created` / `updated` / `deleted` (change stamps; `deleted` is `null` while live), and `conversation_id` (already on the document — [save-as-report](save-as-report/design.md) populates it on the sheet route, and the `emit-data-parts` turn-end hook backfills it on the agent route ([reports-from-chat](reports-from-chat/design.md)), so it is no longer always `null` there). `spec` stays, with a changed shape:

**The stored `spec` is the validator's output, not the writer's input**, and it holds `{ sections }` only — `title` and `description` are document fields, the single source for the list, search, sort and rename. Every section carries a **durable id** assigned by the validator and unique within the report, so a section can be named for the life of the report rather than by the position it occupied when a caller last read it. Because the document now holds the validator's own output, the validator has to be **idempotent** — re-validating a stored spec returns it unchanged, with an absent optional stored as an absent key and a `null` read as absent. Display defaults (`REPORT_LOCALE` / `REPORT_CURRENCY` / `REPORT_DECIMALS`, a multiselect's `match`) therefore freeze at create time instead of being re-applied from current constants on every read. Pipelines are still stored verbatim and still revalidated per section per viewer at every resolve — nothing about the safety model changes. [ownership](ownership/design.md#the-stored-spec-is-the-validators-output) owns this, and it is what lets `remove-report-section` address a section by id with no positional guard.

**`owner.name` is a snapshot.** Reporting depends on no module and knows no users collection, so it cannot resolve a `user_id` to a current name — the carried name is the only thing available, refreshed opportunistically by owner-side writes. A "Published by …" line reads the name as at the last write.

**Ownership is a named reference, not the `created` stamp**, even though the two hold the same person on insert. The shape follows `deals.salesperson` (`{ contact_id, name, email }`): the id is the authorization key, and the name rides along so a list row or a report header can say "Published by …" without a lookup — which plate 4's Visibility column and [report-page](report-page/design.md)'s provenance line both need.

Keeping it out of the stamp is deliberate. `created` is written once with `$setOnInsert` — a historical fact. Authorizing off it would mean ownership could never move without rewriting the audit record, and would make `created.user` load-bearing for authorization while `updated.user` right beside it is not, a distinction nothing in the document signals. `owner` is current state; the stamps are history.

Conversation documents already carry `owner`, `created`, `updated`, `messages`, `data_parts` and `title`. They gain `deleted` (same stamp shape, initialised `null`) for the rail's soft delete, specified in [chat](chat/design.md), not in ownership — the report ownership model has nothing to say about them.

Two things about `data_parts` are model-level rather than chat's alone, because save-as-report reads them. Each part carries **its own id, a `created` stamp, and the validated spec that produced it** — the spec is what lets a selected result become a live report section, while the part's baked `option` stays a snapshot of that turn. And the array is **bounded on write**, keeping the most recent 50 parts, because a part's payload is the largest object this module persists and the document is rewritten every turn. Both are [chat](chat/design.md#the-panel-is-an-artefact-store-so-its-parts-need-identity-a-date-and-a-bound)'s to specify.

## Cross-cutting invariants

Four rules hold across every surface. A sub-design may add to them; none may weaken one.

1. **Reports are private to their author until deliberately published.** `visibility` defaults `private`, publishing is role-gated, and there is no state between the two.
2. **Ownership is enforced server-side, on every write.** The menus differ between owner and non-owner, but the menu is not the boundary — a hidden menu item is a UX affordance; the match in the endpoint is the authorization. This extends to reads whose scope _is_ the boundary: the list's scope is a server parameter, never a client-side filter over an "everything" response.
3. **Soft delete is the only retirement, and nothing in this module hard-deletes.** The idiom is `docs/shared/soft-delete.md`: field `deleted`, shape `{ timestamp, user: { name, id } }`, initialised `null`, read predicate `deleted.timestamp: { $exists: false }`. There is no archive state and no purge endpoint anywhere.
4. **The query engine, the catalog, the allowlists and the read-only principal are untouched.** Nothing in this design widens what can be queried.

## Endpoints

The full inventory, with the sub-design that specifies each. Shapes are in the owning sub-design.

| Endpoint                | Status  | Owner                                      |
| ----------------------- | ------- | ------------------------------------------ |
| `create-report`         | new     | [save-as-report](save-as-report/design.md) |
| `list-reports`          | rewrite | [ownership](ownership/design.md)           |
| `set-report-visibility` | new     | [ownership](ownership/design.md)           |
| `set-report-favourite`  | new     | [ownership](ownership/design.md)           |
| `set-report-title`      | new     | [ownership](ownership/design.md)           |
| `remove-report-section` | new     | [ownership](ownership/design.md)           |
| `duplicate-report`      | new     | [ownership](ownership/design.md)           |
| `restore-report`        | new     | [ownership](ownership/design.md)           |
| `delete-report`         | keep    | [ownership](ownership/design.md)           |
| `resolve-report`        | change  | [ownership](ownership/design.md)           |
| `list-conversations`    | change  | [chat](chat/design.md)                     |
| `delete-conversation`   | new     | [chat](chat/design.md)                     |
| `emit-data-parts`       | change  | [chat](chat/design.md)                     |

## Block changes

Every surface in the plates was checked against the blocks the demo actually installs — `@lowdefy/blocks-antd`, `-basic`, `-antd-x`, `-echarts`, `-aggrid`, and this repo's plugin blocks — reading the block source, not the docs. [`wireframes-blocks.html`](wireframes-blocks.html) redraws all six plates as they land in real blocks.

**The verdict: one required block change, one optional one, and three places where the drawing bends.** _(Both have since shipped as `dist/` patches; the module now carries three in total, counting `ai-utils`. Each is owed upstream, and each fails `pnpm install` loudly on a release that touches the file it patches.)_

- **Required — a `setInput` method on `AgentChat`.** Without it the empty state cannot teach the report path. Carried as a patch on `@lowdefy/blocks-antd-x`, to be upstreamed. See [chat](chat/design.md#the-one-thing-the-blocks-cannot-do-fill-the-composer).
- **Optional — a `menu` cell for `AgGridBalham`.** Restores plate 4's kebab popover, and every list page in this repo would use it. The list ships without it. **(Shipped 2026-08-14** as `patches/@lowdefy__blocks-aggrid.patch`, pending the upstream PR ([lowdefy/lowdefy#2310](https://github.com/lowdefy/lowdefy/pull/2310)) — so this is now a second patch to upstream, not an optional nicety deferred. The list renders the popover through the cell; the report page has no grid and compiles its own `DropdownMenu` instead, which is why only the list `_ref`s the shared action files. The same patch carries **a bug fix the cell could not work without**: `blocks-aggrid` rebuilt every cell renderer on every render, and ag-grid destroys a cell whose renderer identity changed — so the popover, and equally the focus and typed value in the existing input cells, was thrown away by any unrelated re-render. That half is the stronger upstream ask, since it is a defect rather than a feature. See [reports-list](reports-list/design.md#the-one-real-gap-is-a-menu-cell).**)**

The three bends — drag-to-reorder becoming ↑ / ↓, the tool trace line's title being the tool name, and the row kebab opening a `Modal` — are recorded as deviations in [save-as-report](save-as-report/design.md), [chat](chat/design.md) and [reports-list](reports-list/design.md) respectively. _(The third closed on 2026-08-14: both kebabs are dropdowns now — the list's a patched-in AgGrid `menu` cell, the report page's a `DropdownMenu` compiled into its header. What the second one duplicates is recorded in [ownership](ownership/design.md#the-report-pages-menu-is-compiled-and-what-that-duplicates).)_

## Vars

`share_roles` (string array) is the only var this design _requires_, and it belongs to [ownership](ownership/design.md). App-specific copy is one optional namespace var belonging to [chat](chat/design.md): `welcome`, with `title`, `data_scope`, and a label plus a starter list per track. All of it is consumer-authored rather than catalog-derived, including the line naming what the assistant can see — a collection is not an entity a user recognises, and the catalog's `description` is prompt material for the agent, not copy for a person ([why](chat/design.md#the-empty-states-copy-is-consumer-authored-not-catalog-derived)). The fields the save sheet offers still derive from the catalog — no var there.

Every var carries full `description` / `type` / `default` in `modules/ai-reporting/module.lowdefy.yaml`, then `pnpm docs:gen`.

## Non-goals

These hold across all five sub-designs.

- **Any change to the query engine, the catalog, the allowlists, or the read-only principal.** Nothing here widens what can be queried.
- **A report builder UI.** Reports are made in the chat; the list's "New report" leads there with the report track pre-selected.
- **Editing a report's sections outside chat** beyond rename, drop-a-section, and duplicate. Re-deriving a spec is the assistant's job.
- **Per-user or per-team sharing, groups, share links, or request-access flows.** Two states, plus duplicate.
- **Notifications** of any kind — including "request a fix" on a broken section a non-owner can see.
- **A purge / permanent delete.**
- **Scheduled or emailed reports.**
- **Filter mechanics** — see [`report-filters`](../report-filters/design.md). Filter _placement_ is in scope; see [report-page](report-page/design.md#the-filter-row-says-nothing-about-what-it-scopes).

## Risks

Cross-cutting risks. Per-surface risks are in each sub-design.

- **Scope creep into an access model.** "Everyone in the app" will eventually meet a team that wants "just finance". The mitigation is that visibility is one field and one endpoint, so a future model replaces it rather than growing around it — but the pressure is real and should be refused until an app actually needs it.
- **The `setInput` patch is ours until it is upstreamed.** The deck's discoverability story rests on one method that does not exist in a released block, carried as a patch on `@lowdefy/blocks-antd-x`. A version bump that reworks `AgentChat`'s sender re-opens it. Contained by the patch being small and by the same package already carrying one (`patches/@lowdefy__blocks-antd-x.patch`, which keys `useChat` by conversation), so patch-then-upstream is a proven path here.
- **Two creation paths for reports** — the sheet and the agent tool — means two callers of the same validation, and a permanent asymmetry in what each can populate. Detailed in [save-as-report](save-as-report/design.md).
- **The split itself.** Five sub-designs over one data model is five places a decision can drift from the model. The mitigation is that the model, the invariants and the endpoint inventory live here and nowhere else — a sub-design that needs to restate one is a sub-design that should be linking instead.

## Demo consumers

Every new capability needs a build-verified example in `apps/demo/`. The per-surface lists are in each sub-design; the seeded fixtures they share are in [ownership](ownership/design.md#demo-consumers) — private, shared and favourited reports, one owned by a second user so the non-owner view is exercised, `share_roles` set with a demo user holding the role and one who does not, and at least one soft-deleted report so the recovery page renders with a real stamp.

Verify with `pnpm ldf:b` from `apps/demo` and inspect the generated `.lowdefy/server/build/pages/**` artefacts.

## Related

- [`designs/ai-reporting/report-filters/design.md`](../report-filters/design.md) — multi-select, array-field semantics, and looked-up filter options (plates 3 and 6).
- [`designs/ai-reporting/open-query-engine/design.md`](../open-query-engine/design.md) — the engine, the presentation contract, and the two-layer security model this design does not touch.
- [`wireframes.html`](wireframes.html) — the six plates, with per-plate callout notes and a closing table mapping every proposal to the files it lands in.
- [`wireframes-blocks.html`](wireframes-blocks.html) — the same six surfaces redrawn as they land in real Lowdefy blocks, with every region labelled by the block behind it and the deviations marked where the build differs from the drawing.
- `docs/shared/soft-delete.md` — the retirement idiom.
