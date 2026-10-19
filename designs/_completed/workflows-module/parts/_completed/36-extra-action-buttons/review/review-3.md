# Review 3 — Post-reconciliation verification against the now-shipped engine (Parts 39, 46/48) and scheduled Parts 56/57

This pass re-verifies the design after its rebase forward onto the shipped signal engine (the banner at `design.md:3-8` now treats Parts 39 and 46/48 as **shipped** and Parts 56/57 as **landing first**). The previous two reviews checked the pre-signal-engine state, so almost every factual claim has been re-grounded against current source.

**What verified clean (no action needed):**

- **Template button ids and line numbers all match the shipped templates.** `edit.yaml.njk` ships `button_not_required` (`:239`), `button_progress` (`:289`), `button_submit` (`:344`); `review.yaml.njk` ships `button_edit` (`:227`), `button_request_changes` (`:259`), `button_approve` (`:289`); `error.yaml.njk` ships `button_resolve_error` (`:256`); `view.yaml.njk` ships `button_request_changes` (`:178`) + `button_edit` (`:207`). The seven-id reserved set in Proposed Change item 3 matches these exactly.
- **The server-resolved state shape is real.** Templates gate on `_state: action.allowed.edit` (`edit.yaml.njk:210`), `_state: action.buttons.not_required/progress/submit` (`:248,298,353`), `_state: action.allowed.review` (`review.yaml.njk:161`), `_state: action.buttons.*` (review/error/view) — exactly as the banner and "Visibility and role gating" describe. The old `components/action_role_check.yaml` and `action_allowed` object **no longer exist** (confirmed by `find` — gone), so the corrected `disabled: { _ne: [{ _state: action.allowed.{verb} }, true] }` idiom is right and review-2 #3's object-compare bug is genuinely fixed.
- **`action.status.0.stage` and `action._id` are hydrated in page state** (`edit.yaml.njk:24,71` for status; `action._id` used throughout), so the YAML-shape `visible`/`disabled`/payload examples reference live state.
- **`validateAction` performs no `pages` structure validation** (`makeWorkflowsConfig.js:519-569` — no `validatePages` call; unknown keys pass through). This confirms the design's premise that a `view` extra would be **silently dropped** without an explicit rejection, justifying the view check.
- **The `floating-actions` `actions:` array is a clean static YAML array** (`edit.yaml.njk:238`), a valid `_build.array.concat` wrap target.
- **`makeActionPages.js:64`** emits `${workflow.type}-${action.type}-${v}`, and **`:97-98`** forwards `page_config: { ...(action.pages?.[verb] ?? {}), ... }` — so the `_ref.vars.page_config.buttons.extra` round-trip test (Verification) is sound.
- **The Part 56 Task 9 citation is accurate.** `56-.../tasks/09-form-templates-adopt-shell.md:51-53` says verbatim: "Keep the floating-actions button bar and the confirm/Request-Changes modals as they are (**page-level chrome, outside the columns**)", and `:100-101` "Form pages keep their floating-actions submit bar." The load-bearing rebase claim holds.
- **Demo `onboarding/qualify.yaml`** is `kind: form` with no `pages:` block today — so the demo exercise is purely additive, as claimed.
- **`docs/workflows/reference/authoring-grammar.md` § "Page overrides (`pages:`)"** (`:258-279`) documents only `buttons.{signal}.{successMessage,visible}` — matching the design's claim about what's there to extend.

The findings below are the three things that don't.

## Factual errors

### 1. `button_edit` is a `Button` with a `Link` onClick action, not a `Link` block

> **Resolved (auto).** Verified against `review.yaml.njk:228` (`type: Button`) / `:250` (`type: Link` onClick action). Corrected both sites: `:5` now reads "Edit-nav `Button` — its `onClick` is a `Link` action" and `:18` "Edit-nav `Button`, whose `onClick` is a `Link` action".

`design.md:5` ("`review` ships … `button_edit` (Edit-nav `Link`)") and `:18` ("`button_edit` (the review-page Edit-nav `Link`, `review.yaml.njk:227`)") both describe `button_edit` as a `Link`. The shipped block is `type: Button` (`review.yaml.njk:228`) whose `events.onClick` fires a `type: Link` action (`review.yaml.njk:251`). The view-page mirror is the same — `type: Button` (`view.yaml.njk:208`).

This doesn't change the mechanism (the id is still `button_edit`, still reserved, still collides at the block-tree level), but the design is otherwise meticulous about block-type precision — it spends a paragraph on the `Modal.toggleOpen` vs `ConfirmModal.open` distinction. The same precision should apply here, especially since the reserved-id rationale (Proposed Change item 3, "navigation buttons (`button_edit`) reserve their ids too") leans on what kind of block sits in the bar.

**Fix:** Change "Edit-nav `Link`" to "Edit-nav `Button` (its `onClick` is a `Link` action)" at `:5` and `:18`. One-word-per-site correction.

## Design gaps

### 2. Form-only validation silently ignores `buttons.extra` on `check`/`tracker` actions — the exact silent-drop the `view` rejection exists to prevent

> **Resolved.** Closed by hardening the validator (option (a)): `validateAction` now rejects any `pages.{verb}.buttons.extra` on a non-form (`check` / `tracker`) action, since those emit no verb pages (`makeActionPages.js:54`) — a clear authoring-mistake error beats leaving the author wondering why their button never renders. The finding's framing also prompted reversing the `view` special-case entirely: rather than reject `view` (which _does_ render a bar), this part now wires `view.yaml.njk` and adds `view` to the bar-verb set so the slot works uniformly across all four form verb pages (`edit`/`view`/`review`/`error`). Net rule: accepted on every form verb page that renders a bar; rejected on non-form actions. Updated Proposed change items 1 & 3, validator + view template rows in Files changed, Decisions item 2, Out of scope (removed the view deferral), and Verification tests (g)/(h)/(h2). New repo principle "Don't over-restrict" added to `CLAUDE.md` to capture the reasoning.

The new validation is scoped "form kind only" (Proposed Change item 3; files-changed row at `:149` — "New validation in `validateAction` (form kind only)"). `makeActionPages.emitForAction` returns `[]` for any non-form action (`makeActionPages.js:53` — `if (action.kind !== "form") return [];`), so a `check` or `tracker` action that declares `pages.edit.buttons.extra` emits **no verb page that reads it** — the slot is silently dropped.

This is the same failure mode the design elevates to a hard rejection for `view`: Proposed Change item 3 rejects `pages.view.buttons.extra` because "without the explicit check a `view` extra would be silently dropped by the template; silent ignore is exactly the drift the validator exists to prevent." That argument applies verbatim to a `check`/`tracker` action carrying `buttons.extra` — yet the form-only scoping leaves it unguarded. The grammar (`authoring-grammar.md:260`) lists `pages` verbs without restricting by kind, so nothing stops an author from writing it.

The asymmetry is real, though the blast radius is smaller than `view` (the whole verb-pages concept doesn't apply to check/tracker — they emit a separate `{workflow_type}-check` page or none — so an author is less likely to reach for `pages.edit` there). Pick one and state it:

- **(a)** Extend the check to reject `pages.{verb}.buttons.extra` on **any non-form action** (a one-line guard at the top of the form-only block: if not form and any `pages.*.buttons.extra` present, fail). This is the consistent application of the design's own anti-silent-drop principle.
- **(b)** Add one sentence to Proposed Change item 3 / Out of scope noting that check/tracker actions don't emit verb pages, so `pages.*.buttons.extra` there is silently inert and deliberately left unvalidated — and say why that's acceptable where `view` wasn't (view is a sibling verb of the _same_ form action whose template _does_ render, so the author reasonably expects it to work; check/tracker verb-page chrome never renders for any key).

I lean (b) — it's the cheaper and honest framing — but the design currently says neither, leaving the form-only line reading as an unexamined gap against its own stated rationale.

### 3. The grammar-doc extension must state `buttons.extra` is `edit`/`review`/`error` only — the § it edits lists `view` as a supported verb

> **Resolved.** The contradiction is removed at its root: `view` is now a supported verb for `buttons.extra` (see #2), so the doc can list the slot uniformly across the four verbs § "Page overrides" already names (`edit`/`view`/`review`/`error`) with no per-verb caveat. Proposed change item 5 / the authoring-grammar row instead carry the caveat that actually applies — the slot is **form-action only** (`check` / `tracker` have no verb pages, so it is rejected there).

Proposed Change item 5 and the files-changed row (`:150`) instruct adding `buttons.extra` to `authoring-grammar.md` § "Page overrides". That section opens with "Supported verbs: `edit`, `view`, `review`, `error`" (`authoring-grammar.md:260`) and documents the `buttons.{signal}` knobs uniformly across verbs. If `buttons.extra` is added to that section without a scope note, the doc implies it works on all four listed verbs — but the validator **rejects** it on `view` (Proposed Change item 3). The design's doc-update instruction doesn't currently carry that caveat.

**Fix:** Add to item 5 / the files-changed row that the `buttons.extra` doc entry must explicitly say the slot is available on `edit` / `review` / `error` only and is rejected on `view` (with a one-line forward-reference to the deferred view follow-on). Otherwise the consumer-facing reference contradicts the validator.

## Carried-forward state — no new findings

All annotated resolutions from reviews 1 and 2 and consistency-1 are reflected in the current `design.md` and verified against source where checkable (the `toggleOpen`/`open` split, the `approve`-modal knob shape, per-verb `action.allowed`, the Resend-Reminder citation correction, the `formHeader`→`formFooter` port note, the global reservation semantics + test f3, the `button_edit` reservation + test f2, the self-owned e2e on `onboarding-happy-path.spec.js`, and the seven-id arithmetic). The tasks/ folder has been removed from the working tree (per `git status`); these findings are written against `design.md` as the source of truth and will need to flow into regenerated tasks if/when they're re-cut.
