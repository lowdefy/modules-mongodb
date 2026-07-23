# Deals Module Rework — Generalize, Extract, and Onboarding Workflow

> **Status: Completed — shipped in PR #111 (branch `feat/deals-module`).** The
> as-built diverged from this plan in several material ways (the workflow model
> ended up inverted, Workstream D shipped rather than deferred, and a few
> net-new generalizations were added). See **Completion notes (as-built)** at
> the end before treating any section below as current.

The `modules/deals/` module was ported wholesale from a consuming app (hereafter **the host**). It works and is already a good reuse citizen — it delegates people→contacts, files→files, the activity/event feeds→activities/events, and the pipeline stepper→the workflows `actions-on-entity` component. But it carries two problems this design fixes:

1. **It is over-fit to the host in one specific place.** The list/detail aggregations hardcode the host's deal-value formula and action slugs (`annual_volume × unit_price`, `order-confirmation.completion_date`, the volumes tile). None are vars. This is what makes the module "too much like the host."
2. **A few genuinely reusable pieces live locally in deals** instead of in the shared module where they belong — the open-actions/tasks widget, task CRUD, and the @mention note-capture modal.

The same hardcoded coupling in (1) is also what blocks the demo's original **onboarding** workflow (leads-based, no volumes/pricing actions) from being repointed onto deals — deal value/close/volumes would render blank. So generalizing the module is the prerequisite that unlocks the onboarding rework.

## Goals

- **Generalize the deals module** so it reads plain, host-supplied deal fields and carries no knowledge of the host's quantity/pricing/action-slug specifics. The host-specific math moves out to the host's own config.
- **Extract three reusable pieces** up into the shared modules (workflows, activities, events) and have deals consume them; close two small reuse gaps.
- **Sub deals into the onboarding workflow** in the demo, in place of the deleted leads example — replacing the thin `sales-pipeline` example built during the port.
- Keep the public repo generic (no consumer-specific data) and every module release-consistent.

### Hard constraint: the host remains a first-class consumer

The host is the module's real consumer (via Phase D). **Every capability this rework strips from the shared module must be fully reconstitutable by the host through the module's config seams — vars, workflow hooks, and slots — with no loss of behaviour or UX.** Generalizing relocates the host's specifics into the host's own config; it must never *remove* a capability the host can't rebuild. This is a completeness obligation on every strip in Workstream A and every extraction in Workstream B, and it is a required verification gate (see Verification). The concrete reconstitution mapping lives in A4.

## Non-goals

- Rebuilding regions deals already delegates correctly (people, files, activity/event feeds, pipeline). Those stay as-is.
- Restoring the leads collection/pages. Deals is the entity now; onboarding runs on deals.
- Reintroducing the lead→company *conversion* (creating a company from a lead). A deal already belongs to a company, so the company-*creation* step is dropped. **Note:** the `track-company-setup` tracker + `company-setup` child workflow are **restored** (adapted) — they run on the deal's *existing* company rather than a created one (see Workstream C).
- Phase D itself (swapping the host's `source:` to the released module). This design only notes the cross-repo impact so Phase D stays a clean follow-on.

## Workstreams and order

| WS | Name | Depends on | Repo surface |
| -- | ---- | ---------- | ------------ |
| A | Generalize the deals module | — | `modules/deals` |
| B | Extract reusable pieces to shared modules | — (parallel with A) | `modules/{workflows,activities,events,deals}` |
| C | Onboarding workflow on deals (demo) | **A** (value seam), touches B's extracted note/task surfaces | `apps/demo` |
| D | Generic create form — move domain fields to host config | follow-on after A–C | `modules/deals` + `apps/demo` |

A and B are independent and can proceed in parallel. **C depends on A** — it cannot render deal value until the value seam exists. B's extracted components change the deal view, so B should land before or with C's demo verification.

---

## Workstream A — Generalize the deals module

### A1. Promote the literal `deals` connection_id to a var

The module matches the workflow doc's `entity.connection_id` against the string literal `deals` in five places rather than a var:
`requests/get_selected_deal.yaml:104`, `requests/get_active_deals.yaml:95`, `requests/get_deals_list.yaml:200`, `requests/get_selected_deal_open_actions.yaml:26`, and `components/detail/deal_outcome_modal.yaml` (×2, in the `get-entity-workflows` payloads).

Introduce a module var (e.g. `entity_connection_id`, default `deals`) and replace the literals with `_module.var`. This makes the seam honest — a host can map the deals collection under any connection id and the workflow-doc match still lines up. The `workflow_type` (`module.lowdefy.yaml:29`) and `outcome_action_type` (`:37`) seams already exist and need no change.

Coupling to note: this var must equal the workflow config's `entity.connection_id`, since `GetEntityWorkflows` joins the two — a host sets both to the same string, not independently. Document it on the var so the two sites don't drift.

### A2. Move deal-value / close-date / volumes from compute-on-read to a stored field (compute-on-write)

This is the core generalization step. Today the module *computes* deal value inside its read aggregations from host-specific action fields.

> Note: the host's field identifiers are shown generically throughout this doc (generic names like `annual_volume` / `unit_price` / `completion_date`). The exact names live in the source lines cited below — follow the `file:line` refs when implementing.

- `deal_value = pricing-qualification.unit_price × volumes.annual_volume` — `get_selected_deal.yaml:126,129`; `get_active_deals.yaml:129-132`; `get_deals_list.yaml:218-221`
- `close_date ← order-confirmation.completion_date` — `get_selected_deal.yaml:133`
- `volumes.monthly_volume` rounding + `annual_volume` projection — `get_selected_deal.yaml:167`, `get_active_deals.yaml:125`, `get_deals_list.yaml:238`
- the `product_volumes` info tile + `pages/view.yaml:268` render `annual_volume`.

**Proposed approach: the module reads plain stored fields (`deal.value`, `deal.close_date`), and host-configured workflow hooks stamp them on write** — exactly the pattern `deal.outcome.{type,reason}` already uses (stamped by the outcome action's post-hook via `_module.connectionId: deals-collection`, read back by the Won/Lost badge). Concretely:

- The module's aggregations stop computing value/close_date. They read `$value` and `$close_date` off the deal document (with `$ifNull` fallbacks so an unstamped deal shows `0` / `—` rather than breaking).
- The `product_volumes` tile and the `annual_volume` reads become an **optional host-supplied info-grid slot** (the module already exposes `components.info_grid_slots` and the demo already passes `tiles/product_volumes.yaml` through it). The module ships no volumes tile of its own.
- **The host** keeps its exact quantity×price behaviour by stamping `value`/`close_date` from its own workflow action hooks (it configures the workflow, so this is where the math belongs). Nothing about the host's UX changes; the formula just lives in the host's config, not the shared module.

Why a stored field rather than the existing `request_stages` seam or a read-time expression: (1) **consistency** — it mirrors how `deal.outcome.{type,reason}` is already stamped-on-write and read-back; (2) it **removes host-specific math from shared reads** entirely, which is the whole point of the generalization; (3) it is **cheaper** — value is derived once on write, not re-derived on every list/detail read. Note the current module computes `deal_value` *after* `$sort`/`$skip`/`$limit` inside a `$facet` (`get_deals_list.yaml:174-181`, `:215-221`), so it does **not** sort or filter by value today; a stored field would additionally *enable* sort/filter-by-value, but that is a future benefit, **not** a committed goal of this rework.

**Alternative considered — a configurable read-time `value_expr` var** (host supplies a MongoDB expression injected mid-pipeline). Rejected as primary because it re-derives the value on every read, needs a fixed mid-pipeline injection point, and isn't consistent with the `deal.outcome` stamp pattern. Kept as a fallback if a host genuinely cannot stamp on write.

### A3. Hardcoded-string audit (the change surface)

| String / assumption | Locations | Fate |
| --- | --- | --- |
| literal `deals` connection_id | `get_selected_deal.yaml:104`, `get_active_deals.yaml:95`, `get_deals_list.yaml:200`, `get_selected_deal_open_actions.yaml:26`, `deal_outcome_modal.yaml` ×2 | → `_module.var` (A1) |
| `volumes.annual_volume`, `pricing-qualification.unit_price` | `get_selected_deal.yaml:126,129`; `get_active_deals.yaml:129-132`; `get_deals_list.yaml:218-221` | delete compute; read stored `value` (A2) |
| `order-confirmation.completion_date` | `get_selected_deal.yaml:133` | delete compute; read stored `close_date` (A2) |
| `volumes.monthly_volume` rounding / `annual_volume` projection | `get_selected_deal.yaml:167`, `get_active_deals.yaml:125`, `get_deals_list.yaml:238`, `pages/view.yaml:268` | move to host info-grid slot (A2) |
| `sales-pipeline`, `deal-outcome` | `module.lowdefy.yaml:29,37` | already vars — no change |

The host's field identifiers (shown generically in this doc — see the A2 note) are consumer-specific and currently live in the public repo from the port, so A2's deletion also removes them from the public repo.

### A4. Cross-repo impact (the host / Phase D) — reconstitution mapping

The host must reproduce its **exact** current behaviour purely through the module's config seams. Every capability A strips maps to a host-owned reconstitution:

| Capability stripped from module | How the host reconstitutes it | Host already owns the pieces? |
| --- | --- | --- |
| `value = annual_volume × unit_price` | post-hook on the host's `pricing-qualification` (or `volumes`) action stamps `deal.value` | yes — those actions + hooks exist in the host's workflow config |
| `close_date ← order-confirmation.completion_date` | post-hook on the host's `order-confirmation` action stamps `deal.close_date` | yes |
| volumes tile (`annual_volume` etc.) | the host passes its `product_volumes` tile via `info_grid_slots` (the demo already mirrors this) | yes |
| literal `deals` connection_id | the host maps its deals collection under the `entity_connection_id` var (default `deals`) | yes |

Because the host configures the workflow, the deal-value formula *belongs* in the host's config — the relocation is architecturally correct, not a workaround. **No behavioural or UX change for the host's end-users.**

**Data migration (required for the host).** Existing host deals were valued compute-on-read and carry no stored `value`/`close_date`. Once the module reads stored fields, those deals render `0`/`—` until backfilled. The host needs a one-time backfill migration (via its own migration tooling) that computes `value`/`close_date` from each deal's existing workflow `form_data` and stamps them. The `$ifNull` fallbacks (A2) keep the app functional pre-backfill; the migration restores displayed values. This migration is **host-side, part of Phase D**, not this rework — but it is a hard prerequisite for the host's cutover and is called out here so Phase D plans for it.

A **second host migration** in the same class comes from Workstream B2 (task 3): task→entity linkage moved from `deal_ids` to the generic `entity_type`/`entity_id`. Once the open-tasks card queries the new shape, a host's pre-existing `deal_ids`-shaped tasks won't surface until backfilled (`entity_type: deal` / `entity_id`). Also host-side, also Phase D; the demo has fresh data so needs no migration.

**Two module copies today.** The host currently uses its own local copy via a `file:` source; modules-mongodb has the ported copy (PR #111). This rework generalizes the **modules-mongodb** copy. The host's local copy is untouched until Phase D, when the host deletes its copy, points `source:` at the released shared module, and supplies the reconstitution config + backfill above.

---

## Workstream B — Extract reusable pieces to shared modules

Each extraction adds an exported component to the owning module, then deals `_ref`s it and deletes its local copy. Each owning module gets a changeset (minor) and its `docs/{module}/index.md` + generated `reference/vars.md` updated.

**Host-compatibility obligation (per the hard constraint):** each extracted component must be parameterised richly enough to preserve the behaviour the host relies on today (the host's task fields, its @mention set, its open-actions styling). Since the deals module was ported *from* the host, the host's local copies of these pieces are the behavioural spec — the shared component must be a superset, driven by vars, not a lossy generalisation. Anything host-specific becomes a var/slot on the shared component, never a hardcode and never a dropped feature.

### B1. Open-items widget → split across `workflows` (actions) and `activities` (tasks)

Today `components/detail/section_actions.yaml` + `components/detail/action_card.yaml.njk` render a single compact card of an entity's **open workflow actions + tasks**, colour-keyed off the workflows `action_statuses` enum. Extracting that unified card into one module would force a **workflows→activities dependency inversion** (workflows is the low-level engine; tasks live in activities' `actions` collection). Since deals depends on both workflows and activities but those two are siblings, the unified card can't live in either without inverting the graph.

**Decision: split by ownership.**
- **workflows** exports a compact **actions-only** card (e.g. `open-actions`), beside `actions-on-entity` (the full stepper) — parameterised by entity id + connection id, fetching only its own open actions.
- **activities** exports/owns the **open-tasks** card, reading its own `actions` collection (pairs with B2, which moves task CRUD there).
- The **host composes both** side by side on its detail page. deals places the two cards where its single `section_actions` card is today; visually aligning them to read as one "what's open" row is a host-side styling concern, not a module dependency.

Each module renders only its own domain and fetches only its own data — no cross-module reads.

### B2. Task CRUD → `activities`

`components/detail/task_modal.yaml` (+ task card in `section_actions`) and `api/create-task.yaml` / `api/update-task.yaml` write into an `actions-collection`. The **activities** module already *owns* that collection (both deals' and activities' `actions-collection` connections resolve to the same physical `actions` collection) but exports no task CRUD. Consolidate: add exported `create-task` / `update-task` APIs and a `task-modal` component (plus the open-tasks card from B1) to activities; deals consumes them and deletes its parallel implementation. This removes a second, divergent task implementation.

**Two seams are required** so consolidation is not lossy for the host (per the host-compatibility obligation). Deals' current `create-task` (`api/create-task.yaml`) is deal-specific in two ways — it links the task to a deal, and it emits an event of `type: deal-task-created` with deal-flavoured display markup. The shared activities task API must therefore expose:
- an **arbitrary entity link** (`entity_type` / `entity_id`) so a task can hang off a deal, a meeting, or any entity — not a hardcoded deal reference;
- a **configurable emitted event** (event `type` + display template) so deals keeps `deal-task-created` and its markup while activities keeps its own meeting-task semantics.

deals then consumes the shared API passing `entity_type: deal` + its event config.

### B3. @mention note-capture modal → `events`

`components/detail/add_note_modal.yaml` is a `TiptapMentionInput` that writes a note as an **events** event (`new-event`) and is read back via `events-timeline`. Both the write (`new-event`) and read (`events-timeline`) sides are already shared in events; only the capture UI is deals-local. Extract a `note-capture` (or `add-note-modal`) component into **events**. (Alternative home: activities, which already exports the `capture_activity` capture pattern — but the note is persisted as an *event*, so events is the correct owner. Final home tracked as open question #1.)

**This is not a UI-only lift** — the modal carries app-coupled dependencies that must become configurable seams on the extracted component (per the host-compatibility obligation):
- a **mention-source seam** — the modal fetches `get_mentionable_users` (`add_note_modal.yaml:9-11,106`), an app-coupled request whose `$match` is built from `_module.var: app_name` (`get_mentionable_users.yaml:14-25`). The component must accept the mentionable-users source as a request-id var (or injected options), so the host supplies its own.
- **entity/context inputs** — the modal reads deals' `get_selected_deal.0.company_id` (`:51`) and an `app_name`-keyed event display (`:37`). These become component inputs (entity id, company id, display key) passed by the host.

deals consumes the extracted component wiring its own mention request + deal context. The `@mention` input is a shared plugin block, so events can render it without a new plugin dependency.

### B4. Close the two reuse gaps

- **`check-action-modal`**: the deal view embeds `actions-on-entity` (`view.yaml:522`) but does not drop the shared `check-action-modal`, so a `check`-kind action full-page-navigates instead of opening in-context (per `check-action-click.yaml:8-16`). Drop `check-action-modal` on the deal view with an `on_complete` refetch list, mirroring `apps/demo/modules/companies/vars.yaml:86-100`.
- **`entity-workflows-refetch`**: deals hand-rolls its workflow refetch (`view.yaml:304-320`). Replace with the exported `entity-workflows-refetch` component.

### B5. Deals module net change

Deletes `section_actions.yaml`, `action_card.yaml.njk`, `task_modal.yaml`, `add_note_modal.yaml`, `api/create-task.yaml`, `api/update-task.yaml`; replaces them with `_ref`s into workflows/activities/events; adds the two gap-closing drops. Deals' own dependency list in `module.lowdefy.yaml` gains no new modules (it already depends on workflows/activities/events) — only new component refs.

---

## Workstream C — Onboarding workflow on deals (demo)

Replace the thin `sales-pipeline` example (`apps/demo/modules/workflows/workflow_config/sales-pipeline/*`) with the richer **onboarding** workflow (recoverable from `git show main:apps/demo/modules/workflows/workflow_config/onboarding/*`), repointed onto deals. Onboarding brings blocked_by sequencing, group `on_complete` status advance, a reviewable action, a custom-page action, and a conditional spawned action — a far better demo of the engine than the 3 flat actions sales-pipeline shipped.

### Per-action fate

| Onboarding action | Fate on deals |
| --- | --- |
| entity block (`leads-collection`/`lead_ids`/`lead-view`/`lead-list`) | repoint → `deals`/`deal_ids`/`deals/view`/`deals/all`; rewrite `entity.data` routine to load deal fields; **`_id` is a string — `$match` compares `_id` directly, no ObjectId coercion** |
| `lead-detail-slot` | swap lead fields for deal fields (like the existing `deal-detail-slot.yaml`) |
| `qualification` group `on_complete` (→ status `qualified`) | retarget connection to deals; change stage slug to a valid deal stage |
| `qualify` | keep (BANT + `role_contact` fit deals); retarget post-hook connection |
| `site-visit` | keep as-is |
| `send-quote` | keep as a custom-page action; approve-hook stage maps to a deal stage. The lead-scoped `quote-builder` page was deleted with leads, so **build a new lightweight deal-scoped `quote-builder` demo page** (capture quote line/value + submit for review) — preserves the custom-page-action showcase without a full builder |
| `schedule-followup` | keep as-is |
| `upload-po` | keep; approve-hook stamps close/value or advances stage |
| `track-company-setup` (lead→company) | **keep, adapted** — the lead→company *creation* is dropped (a deal already has a company), but the tracker + `company-setup` child workflow are restored. Its `start_link` targets a new app page `deals/start-company-setup` (carrying the `action_id`+`entity_id` sentinels), which resolves the deal's `company_id` and starts `company-setup` on the *existing* company with `parent_action_id` — the deals analogue of what `companies/new`'s `on_create_routine` did in the leads flow. The companies `on_create_routine` auto-start is guarded on a parent `action_id` so a plain company create no longer spawns an orphan setup workflow. |

### C wiring to A and B

- Set `apps/demo/modules/deals/vars.yaml` `workflow_type: sales-pipeline → onboarding`; extend `stages`/`action_groups`/`outcomes` vars to cover onboarding's slugs.
- **Outcome action**: onboarding has no outcome-capture action, which the module's Won/Lost badge + `record-loss` require. **Carry over the working `deal-outcome` action from the current `sales-pipeline` workflow** (it captures won/lost + reason, stamps `deal.outcome.{type,reason}`, and is already wired to the module's outcome modal + `record-loss`) into the onboarding-on-deals workflow, keeping `outcome_action_type: deal-outcome`. Onboarding thus gains an explicit outcome action the original leads version lacked — necessary for the module's outcome system to function.
- **Value seam (needs A2)**: onboarding actions stamp `deal.value` / `deal.close_date` on write (e.g. from `qualify`'s `estimated_value`, or `upload-po`). With A2 done, the module reads them as plain fields; no volumes tile in the generic demo (or a trivial one via `info_grid_slots`).
- Register the workflow in `apps/demo/modules/workflows/workflow_config/workflows.yaml` (currently `sales-pipeline/sales-pipeline.yaml` → `onboarding/onboarding.yaml`).

---

## Workstream D — Generic create form + host-supplied domain fields

**Status: captured, not yet implemented.** Surfaced during Workstream C runtime testing. This is a structural module-API change with a wider blast radius than A–C, so it gets its own review + tasks and a fresh implementation pass (ideally post-compact) rather than being folded in hastily.

**Problem.** The module still bakes in a fixed set of *domain-specific* create/display fields that are not universal to deals — `material_code` + `product_hierarchy` (a material/SKU taxonomy), `product`, `sector`, `sub_sector`, `customer_type`, `project_type`, and `package` (a domain-specific packaging/size taxonomy). Plenty of deals have nothing to do with materials, products, packaging, or a sector taxonomy. A generic deals module should ship only the **universal** deal fields (company, name, description — plus the value/close/people/stage/outcome/pipeline it already handles) and let hosts inject their own domain fields via config — the way `companies` does with `fields.attributes`.

**Audit — where the domain fields are hardcoded today** (all must move to host config):
- **Create form** — `pages/new.yaml`: `material_code`, `product`, `customer_type`, `project_type`, `sector`, `sub_sector`, `package` field blocks (+ the `product_hierarchy`-driven Material hierarchy hint and the `prefill_deal_name` material/product coupling).
- **Detail view** — mostly already generic: `section_company.yaml` renders only the company Name + the `company_fields` var (sector etc. show only because the demo passes them through), and `get_selected_deal.yaml` has no restrictive `$project` so `attributes.*` already flow to the view. The one genuine module-baked reference is `product` in `pages/view.yaml`'s pipeline header (see the `product` audit row below). **The obligation here is the round trip, not a strip:** a host domain field must render on the view, not just save. The data already flows (whole-doc read), and the suite-standard fix (see Approach) supplies the display half from the *same* declaration — a single `fields` var rendered as inputs on the form and read-only via `SmartDescriptions` on the view. (The existing `company_fields`/`meta_fields`/`info_grid_slots` slots stay for display-only extras — computed rows, richer tiles — not for these round-trip fields.)
- **`product` (special case)** — unlike the other domain fields, `product` is stored at the **document root** (`create-deal.yaml` writes top-level `deal.product`, not `attributes.product`), has its own `products` var driving a slug→label lookup in `view.yaml`'s pipeline header (the deal-subtitle line), and renders on the list card (`components/deal_list_card.yaml`). Handle it as a normal domain field: route it through the `fields` var into `attributes.product` and drop from the module the top-level `product` field, the `products` var, the header `product_name` derivation, and the `deal_list_card` product render. The header subtitle degrades to description-only (the header is not a slot); a host wanting product in the header owns that. Host re-supplies product as a `fields` block (form input + SmartDescriptions view) plus a list-column via the existing slots.
- **List** — `get_deals_list.yaml` filters + projects `product`; `get_active_deals.yaml` projects `product`/`product_name_freetext`. (`get_deals_list_options.yaml` is already generic — its filter *options* come from the host's `filters` var, per its own comment, not from a baked projection.)
- **Write** — `api/create-deal.yaml` writes fixed `attributes.{material_code, material_description, product_hier_l2/l3/l4, customer_type, sector, sub_sector, package}` + a `product`/`material` derivation.
- **Manifest** — the `products`, `product_hierarchy`, `sectors`, `sub_sectors`, `customer_types` vars.

**Approach — adopt the suite-standard `fields` var + SmartDescriptions.** Every other entity module (companies, contacts, activities, user-account, user-admin) exposes host fields through a single `fields` object var whose blocks render as **inputs** in the create/edit form and **read-only** on the view via a `SmartDescriptions` block — one declaration, both surfaces. deals is the lone outlier (display-only `company_fields`/`meta_fields`, no `fields` var, no SmartDescriptions); D brings it in line.

- **Manifest**: strip the five domain-taxonomy vars (`products`, `product_hierarchy`, `sectors`, `sub_sectors`, `customer_types`); `package` has no var (its options are inline on the form block, so they move with the block to host config); add a `fields` object var (host-supplied field blocks + option sources), block ids prefixed with `attributes.` so they bind to `state.attributes.*` — mirroring `companies.fields.attributes` (`modules/companies/module.lowdefy.yaml:92-121`).
- **Create form**: strip the seven domain field blocks; render `_module.var: fields` as inputs after the core company/name/description (the `form_company.yaml` pattern — `_build.if` on array length, divider + blocks).
- **Detail view**: render the *same* `fields` defs read-only via a `SmartDescriptions` section on `view.yaml` (the `view_company.yaml` pattern). `get_selected_deal` already returns the whole doc so `attributes.*` are available; the only removal is the `product` header bits. The existing `company_fields`/`meta_fields`/`info_grid_slots` stay for display-only extras (computed rows, richer tiles like volumes) that aren't create-form fields.
- **Write**: `create-deal` stops writing fixed attribute keys and writes a **generic `attributes` passthrough** from `form.attributes.*`, so any host field flows through (including `product`, now `attributes.product` rather than a top-level field). Drop the material-object derivation and the material/product `prefill_deal_name` coupling. Module default: **no auto-prefill** — `form.name` is a plain required, user-editable field (the shared company-selector exposes no `onChange` hook to prefill from, and adding one is a cross-module change out of scope for D); any prefill is owned by the host's `fields` block `onChange`.
- **List**: domain projections/filters come out of the module requests; hosts add columns/filters via the existing `filters` (and a `table_columns`-style) slots + `request_stages`.
- **Demo**: re-supply material/product/sector/sub_sector/customer_type/project_type/package as field blocks + enums through the single `fields` var (and richer tiles via the display slots) — i.e. they become demo (host) config, not module built-ins.

**Host-constraint note:** the origin app reconstitutes all seven via the same `fields` var (it already owns the enums/field blocks) — same first-class-consumer obligation as A. Existing deals keep their `attributes.*` on disk; the generic passthrough reads whatever is there.

**Read side (decided).** The generic projection stays module-owned: `get_selected_deal` already returns the whole doc (no restrictive `$project`), so `attributes.*` reach the view unchanged; `get_deals_list`'s `$facet` projection swaps `product: 1` for `attributes: 1` (a one-line, module-owned change). Host-appended `request_stages` remain available for anything beyond the generic passthrough, but are not required for the common case.

---

## Sequencing & PR strategy

**Fold this rework into the still-draft PR #111** rather than shipping the over-fit port and immediately reworking it — #111 becomes the deals module done right, and the team never reviews the over-fit version. This must not mean one mega-commit; split into reviewable commits, each with its own changeset(s) and docs:

- **A1** (connection_id → var), **A2** (value/close/volumes → stored field + slot) — deals module.
- **B1** (workflows open-actions card + activities open-tasks card), **B2** (activities task CRUD with entity-link + event seams), **B3** (events note-capture with mention-source + context seams), **B4** (deal-view gap closes) — one commit per extraction.
- **C** (onboarding-on-deals demo, incl. lightweight quote-builder page + carried-over deal-outcome action) — lands last, the runtime-verification vehicle.

Order: A + B (module changes) first; C last. If the total diff grows unwieldy, fall back to a stacked follow-up PR — but the default is fold-in.

## Verification

- `CI=true pnpm ldf:b` (from `apps/demo`) green; `pnpm docs:check` green; changesets present for every module whose package changes (deals, workflows, activities, events).
- Demo runtime: create a deal → walk the onboarding workflow → confirm stage advances, the open-actions and open-tasks cards render, task create/update, @mention note appears in the Events tab, check-action opens the in-context modal, and Won/Lost outcome + value/close render from the stored fields.
- **Host-reconstitution gate (required):** before this rework is considered done, prove the host can reproduce its current deal list/detail behaviour against the generalized module using only config — value/close from stamped fields, volumes tile via slot, entity_connection_id var, and the extracted components driven by the host's vars. Simplest form: build the host app locally against the reworked module copy with the host's config and diff the deal list/detail against today's. Any capability the host cannot reconstitute is a design defect, not a host problem. This gate is **not** automatable in modules-mongodb CI — the host is a separate repo — so it is a manual developer-side check run by someone with host access, aligned with Phase D prep rather than this repo's CI.

## Open questions

1. **Note-capture home** — events (persisted-as-event argument) vs activities (existing capture pattern). (Leaning events.)
2. **Value fallback** — confirm every module read of `value`/`close_date` has an `$ifNull` so an unstamped or partially-progressed deal renders cleanly.

---

## Completion notes (as-built)

Workstreams A and B landed substantially as designed (see `tasks/`). The
material deviations from the plan above:

1. **Workflow model inverted (Workstream C).** The plan repoints `onboarding`
   onto deals *as the single workflow* (`workflow_type: onboarding`). As-built,
   the richer workflow is kept as **`sales-pipeline`** (the primary
   `workflow_type`) and a separate **minimal `onboarding` workflow auto-spawns
   on WON** — a `deal-outcome` post-hook `CallApi`s `onboarding-start` on the
   same deal. This turns the demo into a showcase of the workflows module's
   *multiple parallel workflows on one entity* (two `workflow-progress` bars),
   which is stronger than the single-workflow swap originally planned.
2. **Phase view is `workflow-progress`, not `actions-on-entity`.** PR #114 added
   the `workflow-progress` component (collapsible per-workflow bars) mid-rework;
   the deal view adopted it with `fetch_on_mount: false` and a page-owned
   refetch. Every `actions-on-entity` reference in B4/C describes the pre-#114
   surface.
3. **Workstream D shipped** (not deferred). The generic `fields` var +
   `SmartDescriptions` round-trip landed; the five domain-taxonomy vars and the
   root-level `product` field/var were stripped; `create-deal` writes a generic
   `attributes` passthrough; the demo re-supplies its domain fields via `fields`.
4. **Company folded into the meta strip.** Beyond D: `section_company.yaml` was
   deleted and the `company_fields` var removed — Company now renders as one row
   in the detail meta strip (alongside Created by / Days open / Last contact).
   `meta_fields` remains for host display extras.
5. **People-roles genericized (net-new).** The people set is now a host
   `contact_roles` registry (module ships `main_point_of_contact`; the demo adds
   `decision_maker`/`finance_contact`), merged via `_build.object.assign` — the
   hardcoded roles are gone.
6. **Outcomes/reasons ship merged defaults (net-new).** `outcomes` /
   `outcome_reasons` merge shipped won/lost (and `other-won`/`other-lost`)
   defaults under the host var via `_resolved` components — display uses the
   merged set, reason *pickers* use the raw host taxonomy. The dead
   `action_groups` var was removed (group display comes from each workflow
   config, not a deals var).
7. **Demo custom-page ids are top-level** — `quote-builder` /
   `start-company-setup`, not `deals/…`: the `deals/` prefix collided with the
   deals module namespace in the dev page resolver.
