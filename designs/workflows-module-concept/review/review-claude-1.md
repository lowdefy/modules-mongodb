# Workflows Module Concept — Post-Implementation Review (Claude, with Sam)

A full review of `designs/workflows-module-concept/` conducted after the bulk of implementation (parts through 48). Each finding was discussed with Sam one-by-one; the **Decision** lines below record the outcomes. Three deliverables fall out of this review: a v2 scope ledger (§ V2), one open design question (§ Open questions), and a doc-correction ledger (§ Doc corrections).

## Overall assessment

The design is strong and unusually disciplined. The signal/FSM model is the standout decision — four entangled mechanisms (priority rule, `force: true`, interaction→status table, fixed button vocabulary) collapsed into one legible primitive, with re-fire safety provided structurally by the table rather than by ordering rules. Part 38's load-plan-commit engine (CAS claim, conditional transactions) is materially stronger than the concept docs describe. The findings below are mostly about what sits *around* the engine — recovery stories, provenance, and doc drift — not the engine itself.

A recurring theme: several v1 risk acceptances were justified by mitigations that were never built (the reconciliation job, the versioning discipline, the manual event re-fire API). This review replaces those justifications with an explicit position: **v1 accepts these risks unmitigated and ships; v2 designs the real solutions.** No ad-hoc interim patches.

---

## Findings and decisions

### F1 — Concurrency between overlapping submits ✅ resolved by Part 38

**Concern.** Two submits on the same workflow planning against each other's pre-write state (e.g. the last two open actions of a group completing concurrently → group never marked `done`, `on_complete` never fires, dependents blocked forever). The concept engine doc gave no answer.

**Resolution.** Part 38 already solves this: commit is workflow-first with a CAS filter on `updated.timestamp` (D9/D15) — the loser throws `ConcurrentSubmitError` with **zero writes landed** and a retry replans from fresh state; on replica sets, workflow + action writes are one transaction (D11). The lost-unblock race is structurally impossible.

**Decision (Sam).** The loser's UX — error surfaced to the user, who retries manually — is accepted as-is. No auto-retry for user submits (auto-retry would re-fire pre-hooks, which may have external side effects). The concept docs' staleness on this whole area is logged in § Doc corrections.

### F2 — Post-commit dispatch failures lose the audit event permanently → key v2 item

**Concern.** Commit steps 3–5 (event, notifications, change-log) run outside the transaction (they cross the `callApi` boundary onto the community plugin's client). On a step-3 failure the submit's core writes are durable, `post_commit_dispatch_failed` is thrown, and the event is unrecoverable: the retry either throws a noisy invalid-transition error (signals like `approve` from `done`) or double-executes (signals like `submit` from `done` — pre-hook side effects re-fired, second status entry). `status[0].event_id` dangles forever; the "manual re-fire API" mentioned in Part 38 D9 does not exist; the event doc is rendered at plan time, so post-hoc reconstruction is non-trivial.

**Decision (Sam).** This is one member of a known failure class. The partial transaction was a deliberate trade — a spanning transaction (events, notifications, hooks inside the same boundary) needs Lowdefy framework changes (session propagation through `callApi`, already flagged in call-api OQ3) and raises real timeout concerns (author-written hooks holding a Mongo transaction open). **No piecemeal fixes** (the outbox-stash option was considered and declined as whack-a-mole). v1 accepts the risk and ships; **v2 designs a general consistency solution** — spanning transactions with `callApi` session propagation, or an outbox/saga mechanism, evaluated properly. See § V2 item 1.

### F3 — The reconciliation job is fictional → claims removed, v2 scope

**Concern.** "Periodic reconciliation as the catch-all" is the named mitigation in at least five places (engine failure-mode story + risks, action-groups D4 + risks, parent spec risks) — including phrasing that implies it exists ("the same periodic reconciliation job that already covers summary drift"). No part designs or builds it.

**Decision (Sam).** Reconciliation was aspirational in the original design and will not ship. Decisions hanging on it are wrong as justified. All five claims are replaced with the explicit position: *v1 ships with no reconciliation; these risks are accepted unmitigated; the general consistency mechanism is the headline v2 item* (which will decide whether reconciliation, transactions, outbox, or a combination is the right shape). See § Doc corrections.

### F4 — `on_complete` is edge-triggered; a missed fire silently corrupts business state → v2, highest severity in the class

**Concern.** Group `on_complete` fires only on the loaded-vs-planned `groups[]` transition edge (action-groups D6). If the commit lands the group's `done` but the invocation dies before fan-out, every retry sees no edge → the hook **never fires** — and `on_complete` is where apps write business state (`lead.stage = qualified`). The named mitigation was the reconciliation job (F3). A state-driven alternative (an `on_complete_pending` marker on `groups[]`, riding the transactional workflow write, giving at-least-once semantics consistent with the already-documented idempotent-hooks requirement) was considered — Part 11 is unbuilt, so it would have been a design choice rather than a retrofit.

**Decision (Sam).** Part of v2. Part 11 builds per the concept (edge-triggered). In the v2 consistency design, the `on_complete` missed-fire ranks as the **highest-severity** member of the accepted risk class, because it is the only member that silently corrupts business state rather than losing observability data.

### F5 — Versioning discipline was never adopted → full v2 deferral

**Concern.** Latest-wins + migrations was chosen on the strength of supporting discipline (`definition_hash` and `declared_action_types` stamped at `start-workflow`, `migrations_applied` markers, PR change-taxonomy checklist, pre-deploy drift script — per `review/versioning-and-dynamic-workflows.md`). Verified: none of it exists in code or parts. The stamps are write-once provenance that cannot be backfilled accurately after the fact.

**Decision (Sam).** Defer wholesale. A bare content hash is itself half a mechanism — without linkage to a release, mapping a hash back across hundreds of commits is its own mess. The notes-doc discipline is half-baked and is **not adopted**. **v2 scope includes proper versioning** (release-linked definitions or per-instance snapshots, plus migration tooling), designed once the system works. Until then: latest-wins ships bare; the first YAML change against live instances is handled by hand, eyes open. The notes doc gets a banner saying so (§ Doc corrections).

### F6 — Revise-after-done collides with auto-complete → OPEN QUESTION

**Concern.** The FSM deliberately restored backward transitions from `done` (`submit`, `request_changes`, `activate`) because the reference-project audit showed revision is routine. But auto-complete fires the moment all actions are terminal, and the engine's load guard rejects submits on `completed`/`cancelled` workflows unless `required_after_close: true`. So the restored transitions are reachable **only while the workflow is still active**: a single-action workflow can never be revised; the most common revision scenario (everything finished, then a problem surfaces) is exactly the sealed one. Supporting oddity: the tracker FSM ships recovery cells (`internal_mirror_child_active` from `done`/`not-required`) for a child-workflow reactivation that no engine primitive can produce.

**Decision (Sam).** Left open — see § Open questions. Three candidate shapes, no commitment yet.

### F7 — Hook payload / `form_data` envelope ✅ accepted as-is

**Concern.** Hooks receive the full workflow doc, including every action's accumulated `form_data` (`context.shallow` was deferred in Part 9). The contract concern: whatever shape ships becomes the public contract; the scale concern: keyed fan-outs accumulate on one Mongo doc.

**Decision (Sam).** Keep as-is. The realistic envelope is **20–30 actions per workflow**, comfortably inside both the in-process payload cost and the single-doc limits. (Recommended: state the envelope in the docs — § Doc corrections.)

### F8 — Form library: structural components have no in-tree exercise ✅ covered by e2e suite

**Concern.** All 27 field components shipped, but the demo exercises 5, none structural — `controlled_list`, `section`, `box`, the recursive walker, nested metadata, and keyed `form_data` paths had no end-to-end exercise. (The original recursion *spike* dissolved correctly: Part 15 made nesting plain JS recursion inside `makeActionsForm`; the only Lowdefy-machinery dependency is the outer template-scope `_ref: { resolver }`, exercised by every demo build.)

**Decision (Sam).** A full component inventory is specced as part of the e2e test suite (Part 22), in a dedicated app separate from the demo. Gap covered. The four stale "run a spike" open questions in the concept docs get updated to record the Part 15 resolution (§ Doc corrections).

### F9 — "My actions" views can't enforce access from raw collection queries → tasks module owns it + README fix

**Concern.** Module-surface tells apps to build inbox/worklist views by "querying the actions collection directly" — but the per-app per-verb access gates live in `workflows_config` (build-time, evaluated inside the engine's `visible_verbs` projection), **not on the action docs**. A raw aggregation cannot evaluate access; apps would either duplicate role knowledge into queries (drifts) or skip filtering (leaks). The tasks-module plan's flagship payoff (a unified "my work" view) is exactly this query.

**Decision (Sam).** Options B + C:

- **B** — the cross-stream worklist API is the **tasks module's** concern; that design owns how workflow verb-gates and task doc-level access compose in one list (consistent with the seam Part 46 already drew). No `get-user-actions` API in workflows v1.
- **C** — fix the README guidance now: direct queries cannot enforce action access; the supported v1 pattern is an **assignees-scoped inbox** (assignment implies intent-to-see; note that assignment and visibility are formally independent); role-gated cross-entity lists wait for the tasks-module API. See § Doc corrections.

---

## V2 scope ledger

The committed v2 items, in priority order:

1. **General consistency solution** (from F2/F3/F4). One designed mechanism covering the whole post-commit failure class: event-dispatch loss (F2), notification loss, change-log gaps, tracker-cascade drift, summary/groups drift, and `on_complete` missed-fire (F4 — highest severity: silent business-state corruption). Candidate shapes to evaluate: full transaction spanning via `callApi` session propagation into hooks/events/notifications (requires Lowdefy framework changes; must resolve transaction-timeout exposure with author-written hooks inside the span), an outbox/saga mechanism, reconciliation sweeps, or a combination. This item also decides the fate of "reconciliation" as a concept.
2. **Proper versioning** (from F5). Release-linked definition identity (not bare content hashes), per-instance provenance or snapshots, migration tooling and process. Designed against real usage once the system is live.
3. **Cross-stream worklist** (from F9). The tasks module's "my work" design owns the user-centric query surface and the composition of the two access models.
4. **Revise-after-done** (from F6) — pending the open question below; whichever shape is chosen is small enough to be v1.x rather than v2 if a real app forces it early.

## Open questions

**OQ1 — How should completed workflows handle revision?** (F6.) Three candidate shapes:

1. **Status quo** — completed workflows are sealed; revision is a mid-flight feature; post-completion fixes are out-of-band DB edits. Requires only an honest sentence where `done → submit` is documented.
2. **`ReopenWorkflow` primitive** — a small operational API pushing `active` onto a `completed` workflow (not `cancelled`; cancel stays stronger, matching Part 23's asymmetry). Notably cheap: the tracker FSM's recovery cells already handle the parent-side propagation, so reopening a child auto-recovers its parent tracker with no new FSM work.
3. **Relax the completed-workflow write guard** — allow submits on `done` actions of completed workflows directly (effectively making `required_after_close` semantics the default for revision-capable transitions). No reopen ceremony, but the workflow's `completed` status no longer means "nothing can change," and the summary invariant (`done + not_required = total`) breaks transiently.

Undecided; record the choice when the first real app surfaces the need.

## Doc corrections

The accumulated staleness/inconsistency ledger. The concept tree is the source of truth per CLAUDE.md; these are the places it currently loses to the implementation or to decisions made in this review.

**Engine concurrency/atomicity sections (vs Part 38)** — the largest block:

1. `engine/design.md` "Client and transaction model" still describes the community-plugin dispatcher with per-request `MongoClient`s; Part 38 D8 replaced it with an engine-owned cached client + native helpers (the "parallel raw-driver helper" the section says would be needed *was built*).
2. No mention of the CAS claim (D15) — the central concurrency mechanism — anywhere in the concept tree.
3. `spec.md` "Deferred to separate designs — MongoDB transactions" — no longer deferred; conditional transactions shipped (Part 38 D11, replica-set detection, steps 1–2).
4. `engine/design.md` D3 "caller retry is safe by construction… recommended recovery is resubmit" — no longer accurate: under Part 38 D13, user signals re-fired after a committed transition throw noisy invalid-transition errors. The retry story belongs to the old model.
5. `engine/design.md` D1 notes `changeLog` is "owned by the community plugin"; Part 38 D7 reproduces it natively in the engine.

**Reconciliation claims (F3):** replace at five sites — engine "Failure-mode story", engine Risks, action-groups D4, action-groups Risks, parent `spec.md` Risks — with: *v1 ships no reconciliation; risks accepted unmitigated; general consistency mechanism is v2 item 1.*

**Recursion-spike open questions (F8):** parent `design.md` OQ1, `action-authoring` OQ1, `ui` OQ1, `spec.md` cross-cutting risks all still instruct a future reader to run a spike that has been moot since Part 15 (JS-internal recursion; template-scope `_ref: { resolver }` shipped and exercised). Record the resolution.

**Versioning notes (F5):** banner `review/versioning-and-dynamic-workflows.md`: the discipline described (stamps, markers, checklist, script) was **not adopted**; v1 ships latest-wins bare; proper versioning is v2 item 2.

**`request_changes` verb contradiction (needs resolution, then doc alignment):** state-machine "Templates and buttons" and ui Decision 2 gate the opt-in view-bar `request_changes` on `action_allowed.view` — explicitly to serve actions with **no** `review` verb. But action-authoring's "Interaction → required verb" table (and Part 38's load-phase check, per D2/Part 34 D6) maps `request_changes → review`. As written, the view-bar button renders for users who pass `view` and is then rejected server-side for any action that doesn't declare `review` — i.e. exactly the case the button exists for. Verify what the shipped templates/handler do, pick one gate (either `request_changes` requires `review` always and the view-bar justification is dropped, or the required verb is context-dependent), and align both docs.

**Stale tracker-lookup text:** `module-surface/design.md` Decision 4 still says the cancel path "looks up tracker actions whose `key` equals this `workflow_id`" — the key-overloading was removed; the subscription walks the child's `parent_action_id` by primary key. Rewrite the sentence.

**`reason` on workflow status entries:** Part 29 D2a made action status entries uniform `{ stage, created, event_id }` with context on the events log, but `cancel-workflow`/`close-workflow` write `reason` inline on workflow status entries. If the asymmetry is deliberate (workflow lifecycle entries are not action entries), say so in one sentence; otherwise align.

**call-api deviation table:** `call-api/spec.md`'s shipped-contract note covers the envelope/throw/options changes but is silent on whether the **depth-limit guard** (D3) shipped. Since that guard is also the engine's only cycle protection (engine OQ1), verify and record its status.

**Smaller recommended additions:**

- State the design envelope (F7): workflows are designed for ~20–30 actions; larger fan-outs should become child workflows via trackers.
- Document `post_commit_dispatch_failed` semantics where page authors will find it: it means *the writes landed and a side effect failed* — blind retry either errors or double-submits (F2). One paragraph; cheap honesty until v2 replaces the mechanism.
- README worklist guidance per F9-C: direct collection queries cannot enforce action access; supported v1 pattern is the assignees-scoped inbox; role-gated cross-entity lists wait for the tasks module.
