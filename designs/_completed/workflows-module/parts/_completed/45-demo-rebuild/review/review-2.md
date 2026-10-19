# Review 2

## Engine-grammar mismatches

### 1. Form field keys must carry the `form.` prefix — and the qualify hook reads the wrong payload bag

> **Resolved (auto).** Verified against `edit.yaml.njk` (primes/submits the `form` state subtree; `form` and `fields` are distinct payload keys) and `buildHookPayload.js` (`form: params.form`, `fields: params.fields`). Prefixed all authored form keys in the design's qualify sketch and the upload-po/send-quote/billing-details prose specs (`form.contact_name`, `form.po_number`, `form.quote_total`, `form.billing_email`, …), changed the hook test to `_payload: form.site_visit_required`, and added an explanatory comment to the sketches. Propagated to tasks 02 and 03.

The `qualify.yaml` sketch (design.md lines 112–122) authors its form entries with bare keys (`key: contact_name`, `key: notes`, `key: site_visit_required`), and the pre-submit hook tests `_payload: fields.site_visit_required` (line 132). Both are the **old config's broken grammar**, not the post-rebuild one:

- The canonical authoring spec writes keys as **full state paths including the `form.` prefix** — `key: form.devices`, `key: form.device_online`, with conditions reading `_state: form.device_online` ([action-authoring](../../../workflows-module-concept/action-authoring/design.md) lines 646–661, 719–730).
- The mechanism makes the prefix load-bearing: field components bind block id verbatim from the key (`components/fields/text_input.yaml` — `id: { _var: key }`), the edit template primes the `form` state subtree from `form_data.{type}` and submits `form: { _state: form }` (`modules/workflows/templates/edit.yaml.njk:94-101, 256-259`). A bare `key: contact_name` binds outside the `form` subtree — saved data never primes into the input, and the submit payload's `form` arrives empty.
- The hook payload's `fields` key is the **universal-fields bag** (assignees / due_date / description — `edit.yaml.njk:102-107, 258-259`; `buildHookPayload.js:34-36` carries `form` and `fields` as distinct keys). Authored form values reach the hook under `form` — the spawn condition must read `_payload: form.site_visit_required`. (The data lands _without_ the prefix inside the payload's `form` bag: state `form.site_visit_required` → `params.form.site_visit_required`.)

The current demo's qualify config carries exactly this pair of mistakes (`workflow_config/onboarding/qualify.yaml` bare keys; its hook reads `_payload: fields.devices`) — the rebuild's chance to stop propagating it, same argument as review 1 #1. Since the design declares this config "the canonical authoring example," the fix matters beyond the demo.

**Fix:** prefix every authored form key in the sketches — `form.contact_name`, `form.notes`, `form.site_visit_required` — and change the hook test to `_payload: form.site_visit_required`. Apply the same to the prose specs at line 190 (`upload-po`: `form.po_number`, `form.po_document`) and the `billing-details` child fields (item/tree references). **Task 03 propagates the error verbatim** (`tasks/03-onboarding-workflow-config.md:104-123`) — update it together with the design.

## Unowned claims

### 2. "Legal seeds validated at build time" has no implementing owner

> **Resolved.** The rule now has owners, per the proposed fix. Part 38 task 17 gains `makeWorkflowsConfig.js` in its Files (restrict `starting_actions[].status` to `action-required` | `blocked`, one line next to the existing `ACTION_STATUSES` check) and an explicit plan clause that `StartWorkflow` rejects illegal seeds at runtime — covering the payload `actions:` override that build validation can't see. Action-authoring's per-workflow validation rules now state the two-seed rule (replacing the stale "any `action_statuses` enum key"), and Part 45 task 7's D1 convention statement carries the rule into the docs it writes.

D3 records (per review 1 #2's resolution): "Part 38 task 17's Start planner seeds drafts directly at the declared status (**legal seeds: `action-required`, `blocked`**) — creation at workflow start is declarative config **validated at build time**". State-machine.md line 175 says the same. But nothing implements the restriction:

- `makeWorkflowsConfig.js:362-367` validates `starting_actions[].status` against the full 8-member `ACTION_STATUSES` list (lines 29–38) — `done`, `in-review`, `error`, etc. all pass today.
- Part 38 task 17's Files list (`tasks/17-start-cancel-close-rewrite.md:36-42`) touches only the three handlers, their tests, and `fsm/tables.js` — not the resolver.
- The action-authoring concept doc still states the old rule: "`status` is a key in the module-shipped `action_statuses` enum" (line ~456).

So the two-seed rule exists only in prose. A config seeding `status: done` builds clean, and whether `StartWorkflow` rejects it at runtime depends on an unstated reading of task 17.

**Fix:** give the rule an owner. Add `modules/workflows/resolvers/makeWorkflowsConfig.js` (restrict `starting_actions[].status` to `action-required` | `blocked`) to Part 38 task 17's Files — it's one line next to the existing check — and align action-authoring line ~456. The `start-workflow` payload's `actions:` override needs the same check at runtime in `StartWorkflow` regardless (build validation can't see payloads); a clause in task 17's plan section makes that explicit. Part 45's task 7 (docs) should then state the two-seed rule when documenting the D1 convention.

## Sketch completeness

### 3. The sketches omit the required `entity_ref_key`

> **Resolved (auto).** Added `entity_ref_key: lead_ids` to the design's `onboarding.yaml` sketch and noted `entity_ref_key: company_ids` for the child config in the authoring-sketches prose. Reworded the tasks' "the design sketch omits it" parentheticals (tasks 02/03), which the design change made stale.

`makeWorkflowsConfig.js:304-309` hard-errors on a workflow config without `entity_ref_key` (Part 38 task 21; Part 38 design line 541 says "the Part 45 rebuilt configs carry it from authoring"). The `onboarding.yaml` sketch (design.md lines 55–58) carries `type` / `title` / `entity_collection` / `display_order` — no `entity_ref_key` — and the `company-setup` config has no sketch to carry it.

Tasks 02 and 03 already caught and patched this locally (`tasks/02-company-setup-workflow-config.md:18` — `company_ids`; `tasks/03-onboarding-workflow-config.md:89` — `lead_ids`), but per the repo rule designs are the source of truth: fold `entity_ref_key: lead_ids` into the design's `onboarding.yaml` sketch (and mention `company_ids` for the child) so the canonical example doesn't omit a required field the tasks have to silently restore.

---

## Verified clean (no finding)

Checked and confirmed, for the record: review-1 resolutions all hold (tracker `none` row + direct-status seeding amended in state-machine.md and Part 38 tasks 17/19; task 20 stub with landing chain; `planAutoUnblock.js:86-88` citation; concat-segment split note). D4's framework claims are real — lowdefy `22d4e60` ("fix(build): Resolve cross-module refs in entry vars", 2026-05-13) ships in the installed `0.0.0-experimental-20260525131701` build (`resolveEntryConfig` Phase 2.5 present in `node_modules`), `_url_query: true` returns the whole query object, `:if`/`:then` and `:return:` routine controls exist. `_payload: url_query.entity_id` on a query-less page resolves to `null` (operator default), so the `:if` `_ne … null` guard and `StartWorkflow`'s falsy `parent_action_id` check (`StartWorkflow.js:53`) both behave as the design assumes. D5's slot vars exist (`modules/companies/module.lowdefy.yaml:124-138`, consumed at `pages/view.yaml:110,131`). Item 9's action-type filter works without an extra fetch — event docs carry `metadata.action_type` (Part 38 task 12). `yes_no_selector` emits boolean values; `status_map` grammar matches the validator (Part 30 D9 cell shape); hooks are signal-keyed post-38 (`hooks.submit.pre`, task 14/19) and the spawn-entry grammar `{ type, signal, upsert }` matches the strict `PreHookResult` key set.
