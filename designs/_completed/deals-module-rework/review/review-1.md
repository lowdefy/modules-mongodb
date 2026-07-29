# Review 1

Reviewed against the module source on `feat/deals-module`. The design is sound and well-scoped at the strategy level — the generalize/extract/onboarding split is right, and the hard host-reconstitution constraint is the correct spine. Findings below are concrete gaps and inaccuracies, mostly in the extraction scoping (B) and the onboarding wiring (C), plus one inaccuracy in the A2 rationale.

## Core approach (A2)

### 1. A2's "sort/filter by value before pagination" rationale misdescribes current behaviour

> **Resolved.** A2 rationale rewritten to stand on consistency with the `deal.outcome` stamp pattern, removing host math from shared reads, and read-cost — noting the module computes value post-pagination today (no sort-by-value) and that a stored field only *enables* sort-by-value as a future benefit, not a committed goal. Rejected-alternative reasoning corrected too.

A2 (design line 61) justifies the stored-field approach over a `request_stages` tail stage by saying value "must be computed before the list sort/paginate." But the current module computes `deal_value` **inside a `$facet`, after `$sort`/`$skip`/`$limit`** (`get_deals_list.yaml:174-181` then `:215-221`), and `request_stages.get_deals_list` injects at `:287`. So the list does **not** sort or filter by value today — value is derived per-page, post-pagination, for display only.

The stored-field approach is still the right call (it *enables* pre-sort value access and is consistent with `deal.outcome`), but the stated justification is wrong: there is no existing sort-by-value to preserve. Rewrite the rationale to rest on (a) consistency with the `deal.outcome` stamp pattern, (b) removing host-specific math from shared reads, and (c) *enabling* future sort/filter-by-value — not on preserving a capability that doesn't exist. If sort-by-value is actually a desired new capability, state it as an explicit goal; if not, drop the sort argument entirely.

## Component extraction scoping (Workstream B)

### 2. B3 (note-capture → events) is under-scoped — it carries app-coupled dependencies

> **Resolved.** B3 now requires two seams on the extracted events component: a mention-source seam (request-id var / injected options for `get_mentionable_users`) and entity/context inputs (entity id, company id, display key). deals wires its own mention request + deal context. Final home still tracked as open question #2.

The `add_note_modal` is not just capture UI. It depends on:
- `get_mentionable_users` (`add_note_modal.yaml:9-11,106`), which is an **app-coupled request** — its `$match` is built at build time from `_module.var: app_name` (`get_mentionable_users.yaml:14-25`) and queries the app's users collection.
- deals' own `get_selected_deal.0.company_id` (`add_note_modal.yaml:51`) and `app_name`-keyed event display (`:37`).

Extracting the modal into events therefore means the **mention-source request and the entity/company context must become configurable seams** on the events component (a request-id var or an injected options source), not a hardcode. Per the host-compatibility obligation, the host must be able to supply its own `get_mentionable_users`. B3 should be rewritten to name these seams; as written it implies a UI-only lift.

### 3. B2 (task CRUD → activities) must generalize the entity-link and the event type

> **Resolved.** B2 now requires two seams on the shared activities task API: an arbitrary entity link (`entity_type`/`entity_id`) and a configurable emitted event (type + display template). deals consumes it passing `entity_type: deal` + its `deal-task-created` event config.

Storage is compatible — deals' and activities' `actions-collection` both resolve to the same `actions` collection (`connections/actions-collection.yaml:6` in each). But deals' `create-task` (`api/create-task.yaml`) emits a **deal-specific** event (`type: deal-task-created`, `:38`) with deal-specific display markup (`:42-50`) and links the task to a deal. A shared activities task API must:
- accept an arbitrary entity link (`entity_type`/`entity_id`), not assume meeting or deal;
- make the emitted **event type + display configurable** so deals keeps `deal-task-created` semantics and activities keeps its own.

Otherwise the consolidation is lossy for the host. Add these as explicit vars on the extracted API.

### 4. B1 + B2 together create a module-layering tension

> **Resolved.** Split by ownership: workflows exports an actions-only card, activities owns the tasks card, deals composes both side by side. No cross-module fetch, no dependency inversion. B1 rewritten; open question #4 removed (now decided).

B1 puts the open-actions/tasks widget in **workflows**; B2 puts task storage/CRUD in **activities**. But the widget renders "open workflow actions **+ tasks**" (design line 104) — so a workflows component would need to read tasks from activities' collection, i.e. a **workflows → activities dependency**, which likely inverts the intended layering (workflows is the lower-level engine). Resolve the home explicitly:
- Option A: the workflows widget renders **actions only**; tasks render via a separate activities-owned component, composed side-by-side by the host/deals.
- Option B: the unified widget lives in whichever module is allowed to depend on both (neither workflows nor activities cleanly can).

This is open question #4, but it's an architectural correctness issue (dependency direction), not just a shape preference — elevate it and pick a direction in the design before B1 starts.

## Workstream C (onboarding on deals)

### 5. `send-quote` depends on a `quote-builder` custom page that was deleted with leads

> **Resolved.** C will build a new lightweight deal-scoped `quote-builder` demo page (capture quote line/value + submit for review), keeping send-quote as a custom-page action — preserves the custom-page-action showcase without a full builder.

The per-action fate table keeps `send-quote` and notes its "app `quote-builder` page repointed to deal scope" (design line 138). But that custom page was lead-scoped and deleted with the leads example — the demo has no `quote-builder` page to repoint. C must either **create a deal-scoped quote-builder page** in the demo or **drop the custom-page action** (degrade `send-quote` to a plain form/check action). Decide and specify; as written it points at a nonexistent page.

### 6. Onboarding has no outcome action, which the deals module requires for Won/Lost

> **Resolved.** C carries over the working `deal-outcome` action from sales-pipeline into onboarding (stamps `deal.outcome.*`, already wired to the outcome modal + record-loss), keeping `outcome_action_type: deal-outcome`. Open question #3 removed (now decided).

The deals outcome modal derives its action by scanning `entity_workflows` for `type === outcome_action_type` (`deal_outcome_modal.yaml:22,36`) and submits it via `{workflow_type}-submit` (`:73`); `record-loss` depends on the same. Onboarding ships no such action. Without repointing `outcome_action_type` at an onboarding action that stamps `deal.outcome.*` (or adding a `deal-outcome` action), the Won/Lost badge and loss recording **break**. This is open question #3, but it is a hard correctness dependency for the demo to function, not a stylistic choice — the design should commit to one resolution, not leave it fully open.

## Process / cross-repo

### 7. The host-reconstitution gate is not CI-automatable

> **Resolved (auto).** Verification section now states the gate is a manual developer-side check (host is a separate repo, not runnable in modules-mongodb CI), owned by whoever has host access as part of Phase D prep.

The Verification section's reconstitution gate ("build the host app locally against the reworked module … diff the deal list/detail") cannot run in modules-mongodb CI — the host is a separate repo. It is a **manual, developer-side check** performed by someone with host access. State this explicitly so it isn't mistaken for an automated gate, and note who owns running it (it aligns with Phase D prep, not this repo's CI).

### 8. Even folded into #111, split A/B/C into reviewable commits

> **Resolved.** Sequencing section now commits to fold-in with explicit commit boundaries (A1, A2, each of B1–B4, C), each with its own changeset/docs; stacked follow-up PR kept as a fallback if the diff grows unwieldy. Open question #1 removed (now decided).

The design leans toward folding the rework into draft #111 (Sequencing). That's reasonable, but the rework spans 4 modules, ~6 file deletions, 3 new exported components, and a migration note. Fold-in must not mean one mega-commit. Specify commit boundaries: A1, A2, each B extraction, and C as separate commits (each with its own changeset/docs), so review stays tractable. If the total diff is very large, reconsider a stacked follow-up PR.

## Minor

### 9. A1: `entity_connection_id` is a two-sided coupling

> **Resolved (auto).** A1 now notes the var must equal the workflow config's `entity.connection_id` (GetEntityWorkflows joins on it); host sets both to the same string.

Promoting the literal `deals` to an `entity_connection_id` var (A1) is correct, but note the constraint: the var value must **match** the workflow config's `entity.connection_id` string, since `GetEntityWorkflows` joins on it. Two config sites must agree. Worth a one-line note in A1 so a host doesn't set them independently.

### 10. A2's field removal also clears consumer-specific names from the public repo

> **Resolved (auto).** A3 now notes the field removal also strips consumer-specific names from the public repo, with a post-A2 grep to confirm no residue.

The host's quantity/unit-price field identifiers A2 removes are consumer-specific (they encode the unit and currency) and currently live in the public PR #111 module code (from the port). Their removal is a public-repo cleanup as well as a generalization — a mild reason to prioritise A2 and to make sure the deletions leave no residue (grep the module after A2). Not a design flaw; a sequencing/benefit note.
