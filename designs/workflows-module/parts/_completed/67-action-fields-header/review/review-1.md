# Review 1

## Factual errors

### 1. `AvatarStack` does not exist — the "extract a proven overflow renderer" premise is false

> **Resolved.** Reshaped rather than reworded. Investigating the finding surfaced that the design's reason for a plugin block — the "List-in-state needs seeding" rejection — was itself false: `assignee_docs` is already in state (`action.*` / `current_action.*`) and re-seeded on refetch, and `Tooltip` + `Avatar` `onClick` → `Link` are stock blocks. So the `ContactAvatars` plugin block (and the EventsTimeline "extraction") was dropped entirely. The strip is now a Lowdefy `List` → `Tooltip` → stock `Avatar` + `Link` with `+N` overflow, authored once in `universal-fields-chips.yaml`. All `AvatarStack` / "proven overflow renderer" / "pure refactor" claims are gone with the block. See §"Why a List, not a new plugin block".

The design leans hard on the claim that `EventsTimeline.js` already contains the stacking + overflow renderer to be shared:

- §Proposed change 4: "It reuses the exact avatar renderer already in `EventsTimeline` … so the two surfaces stay visually identical."
- §Why a plugin block: "gives us the timeline's proven tooltip + link + initials/gradient-fallback + **overflow** rendering."
- §Current state: "`AvatarStack` handles overlap + `+N` overflow."
- §The `ContactAvatars` block: "Factor the `Avatar` **+ `AvatarStack`** functions out of `EventsTimeline.js`."

Verified against source: `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js` contains a single per-event `Avatar` component (lines 79–145) and **no `AvatarStack`** — there is no overlap, no `maxCount`, no `+N` overflow anywhere in `plugins/modules-mongodb-plugins/src/blocks/` (grep for `AvatarStack|maxCount|overflow` returns nothing). The timeline renders exactly one avatar per event row; it has never rendered a group.

Consequences:

- The overlapping-stack-with-`+N`-overflow renderer is **net-new code**, not an extraction, and is used by exactly one consumer (`ContactAvatars`). The "one renderer, two consumers — the 'one correct way'" argument only applies to the single-avatar visual (image / initials / gradient fallback / tooltip / link), not to the stack.
- §Files changed and §The `ContactAvatars` block call the EventsTimeline edit a "pure refactor / no behaviour change." That is true only for lifting the single `Avatar` out; the stacking layer still has to be written from scratch.

Fix: reword the design to claim only what exists — extract the single `Avatar` (tooltip + link + initials/gradient fallback via `buildContactHref`, lines 79–154) into `_shared`, and describe the overlap/`maxCount`/`+N` layer as **new** code in `ContactAvatars`. Drop the "proven overflow rendering" / "already handles overlap" wording.

### 2. The `action` template uses `current_action.*`, not `action.*` — the design's stage-wiring instruction is wrong for it

> **Resolved.** §Due pill rewritten to name **two** state-path families: the four form templates (`edit`/`view`/`review`/`error`) on `action.*`, and the two converged consumers (`action.yaml.njk` **and** `check-action-surface.yaml`) on `current_action.*`. The exact `current_action` leaf each of the two reads is settled in #3.

§Due pill states: "Each consumer passes `stage: _state: action.status.0.stage` (check surface: `current_action.status.0.stage`)." This treats all five templates as one `action.*` family with only the check surface as the exception. There are actually **two** state-path families:

- The four **form** templates — `edit`/`view`/`review`/`error.yaml.njk` — read `action.*` (e.g. `action.status.0.stage`, `templates/edit.yaml.njk:64`; `action.assignee_docs` at the chips `_ref`). ✔ matches the design.
- The converged **check page** — `action.yaml.njk` — reads `current_action.*`: `current_action.status.0.stage` (`templates/action.yaml.njk:88`) and `current_action.assignee_docs` / `current_action.due_date` at the chips `_ref` (lines 100–103).

So wiring `stage: _state: action.status.0.stage` into `action.yaml.njk` (as the design's rule says) resolves to nothing — `overdue` is silently always false and the pill never goes red on the check page. Fix: the carve-out must list **two** exceptions — `action.yaml.njk` **and** `check-action-surface.yaml` both use `current_action.*`; only `edit`/`view`/`review`/`error` use `action.*`.

## Consistency / one-correct-way

### 3. Check surface should read the canonical `current_action.stage` scalar, not re-derive `status.0.stage`

> **Resolved.** §Due pill now pins the overdue `stage` leaf to `_state: current_action.stage` (the canonical scalar) on **both** converged consumers, not just the check surface. Correction to the finding's parenthetical: `action.yaml.njk` **does** seed and reseed the scalar (lines 165 / 460) — it is not absent. Its status _pill_ reads `status.0.stage` directly, but since the page reseeds `current_action` and `current_action.stage` in one `SetState`, they can't diverge; that pre-existing quirk is noted and left untouched.

The design tells the check surface to pass `current_action.status.0.stage`. But `check-action-surface.yaml` deliberately established `current_action.stage` (a seeded plain scalar) as the single stage source: its state-contract comment (lines 30–34) calls it "the stable stage source (D4)," the header status pill reads it (`current_action.stage`, lines 106–108, 119), the error-stage comment gate reads it (line 173), and the edit-modal reseed handler maintains it (`current_action.stage: get_workflow_action.status.0.stage`, `check-action-surface.yaml:602`). Introducing a second, differently-derived read of the stage (`status.0.stage`) for the overdue leaf on the same surface violates "one correct way" and risks divergence if only one of the two paths is reseeded. Fix: the overdue leaf on the check surface should read `_state: current_action.stage`, matching the pill and gate already there.

(Note this also interacts with #2: on `action.yaml.njk` there is **no** `.stage` scalar — that page reads `current_action.status.0.stage` directly — so the two `current_action.*` consumers are themselves not uniform. Worth a sentence in the design acknowledging which path each uses and why.)

### 4. `size: number` prop contradicts the renderer's `compact` boolean

> **Resolved.** Moot — premise removed by the resolution to #1. There is no `ContactAvatars` block and no props table, so the `size`/`compact` sizing-API conflict no longer exists. The stock `Avatar` block sizes itself in the chips YAML.

§The `ContactAvatars` block props table declares `size: number (Default small)`. The renderer being extracted sizes avatars from a `compact` **boolean** — 22px when compact, 32px otherwise (`EventsTimeline.js:82–83`), with a matching `fontSize`. There is no numeric size path. As written, `ContactAvatars` and the shared renderer disagree on the sizing API. This also further dents the "pure refactor" claim: supporting a numeric `size` means changing the shared `Avatar` signature (and therefore touching how the timeline calls it), not just moving it. Fix: pick one model — either have `ContactAvatars` pass `compact: true` (simplest, matches today's `size: small` chips) and drop the `size` prop, or extend the shared renderer to take a numeric size and update the timeline call sites accordingly (and stop calling it a no-op refactor).

## Design questions

### 5. `blocked` (and `error`) stages will render an overdue red pill for an action nobody can act on

> **Accepted.** Overdue is defined as "should have been done by now," so only `done`/`not-required` are exempt; all other stages stay eligible by design. A late `blocked` action is flagged because the blocker itself should have been resolved in time, and a uniform rule is preferred over a bespoke exclusion list. The double-red beside an `error` status pill is accepted, not special-cased. Rationale recorded in §Due pill.

The overdue rule (§Due pill) excludes only `done` and `not-required` as terminal. A `blocked` action past its due date will therefore show the red `error` palette — but a blocked action is, by definition, waiting on a dependency and cannot be worked by its assignee, so flagging it "overdue" is misleading and un-actionable. Similarly an `error`-stage action would show the red overdue pill directly beneath the already-red `error` ("Alert") status pill (`action_statuses.yaml` `error` = `#fff1f0`/`#ff7875`/`#cf1322`) — double red. Decide explicitly whether `blocked` should join the excluded set, and whether overdue-red is wanted concurrently with an `error` status pill. If the answer is "only actionable stages can be overdue," the excluded set is larger than `{done, not-required}`.

### 6. Non-goal rationale for keeping `universal-fields.yaml`'s display group is stale, and the change introduces a visual split

> **Resolved.** Pruned now rather than deferred. Confirmed the `mode: display` group is rendered by nothing — the edit modal is `universal-fields.yaml`'s sole consumer and passes `mode: edit`; the check surface composes the chips. Removed the display group from `universal-fields.yaml`, collapsed the now-single-valued `mode` var (dropped the edit-group gate and `mode: edit` in `universal-fields-modal.yaml`), and rewrote the stale header comment (which wrongly claimed the check surface still composes the display group). No live visual split existed, so nothing to reconcile. Left the parameterized in-body Update button (`show_update_button` / `on_complete`) intact — a capability the modal currently sets false, not dead code to strip. The stale non-goal bullet is removed and the prune is listed in §Files changed.

§Non-goals: "No change to the `mode: display` group in `universal-fields.yaml` (still used by the in-context check surface)." Verified: `universal-fields.yaml` is `_ref`'d by `universal-fields-modal.yaml` (`universal-fields-modal.yaml:55`), i.e. the **edit modal** — not the in-context check surface. The check surface (`check-action-surface.yaml`) composes the **chips** now (Part 65), not the display group. So the stated reason for the non-goal is inaccurate. Beyond the wording: after this change assignees render two different ways — the new linked/tooltipped `ContactAvatars` in the title-bar chips, and the untouched flat core-`Avatar` group inside `universal-fields.yaml`'s display mode wherever that still renders. Confirm where the display-mode group is actually still shown (if anywhere), and either accept the divergence deliberately or note that the display group is now dead and can be pruned in a follow-up. Fix the non-goal's parenthetical either way.
