# Review 1

Reviewed against the current engine source (`planEventDispatch.js`, `planFieldsUpdate.js`, `UpdateActionFields.js`, `commitPlan.js`, `EventsTimeline.js`, `GetWorkflowAction.js`) and the docs tree. Most factual claims hold up: the description card is gated on `hasDescription` (`EventsTimeline.js:523,536`) and always renders `sanitize(event.description)` (`:286`); `GetEventsTimeline` already projects `description: $${app_name}.description` (`GetEventsTimeline.js:204`); `commitPlan.dispatchEvent` reads `plan.event.doc` unconditionally (`commitPlan.js:137`); `mergeEventOverrides` strips non-comment `description` (`mergeEventOverrides.js:68–69`) and is skipped entirely on the fields-update path (`planEventDispatch.js:280`, guarded `!isFieldsUpdate`); the contacts lookup shape matches `GetWorkflowAction` (`findDocs` on `connection.contactsCollection ?? "user-contacts"`, projecting `profile.name`, `GetWorkflowAction.js:130,186–199`). The seam in D2 (title vs description slot) is real and clean.

The findings below are the gaps.

## Correctness

### 1. The no-op diff must compare `due_date` by value, not by reference — otherwise every save is a false "change"

> **Resolved.** Added value-based comparison to the `computeUniversalFieldChanges` worked shape — a `same(a, b)` helper (`(a == null && b == null) || (+a === +b)`) with the `"due_date" in fields && !same(...)` guard, and a note that assignees set difference is already value-based. Added a test case: a fresh `Date` equal by value to the stored `due_date` ⇒ no change ⇒ no event.

D5/§Worked-shapes define the no-op test as "presence-in-bag = considered; equal = not a change", but never say _how_ equality is computed for `due_date`. Both sides are `Date` objects: the stored value `loadedState.targetAction.due_date` is a `Date` from Mongo, and the incoming `fields.due_date` is a `Date` (Lowdefy hydrates the `DateSelector` value server-side — confirmed by the existing tests, e.g. `UpdateActionFields.test.js:92` `due_date: new Date("2026-01-01")` and `:189`). A naive `before.due_date !== fields.due_date` compares object identity, which is **always** unequal for two distinct `Date` instances.

Consequences if the implementer uses `!==`/`===`:

- **No-op suppression (D5) breaks.** Any save that echoes the current due date back (the common case — the modal pre-fills it) registers as a change, so the "meaningless updated event" this part exists to suppress still lands.
- **Spurious diff lines.** `renderFieldsUpdateDescription` emits "Due date: Jul 15, 2026 → Jul 15, 2026" for an unchanged date.

Fix: specify value-based comparison with null handling in `computeUniversalFieldChanges` — e.g. `const same = (a, b) => (a == null && b == null) || (a != null && b != null && +a === +b);` and treat `due_date` as changed only when `field in fields && !same(before.due_date, fields.due_date)`. Add a test: `fields.due_date` a fresh `Date` equal to the stored one ⇒ `due_date` change is `null` ⇒ no event. (The assignees side is safe — set difference on id strings is value-based already; just default both sides to `[]`.)

### 2. The doc update targets the wrong file — the invariant D3 relaxes lives in `docs/workflows/concepts/events.md`, not `docs/shared/event-display.md`

> **Resolved (auto).** Verified: `docs/shared/event-display.md` is about the `event_display` title-template var and never mentions the description slot or comment-only rule; the invariant is at `docs/workflows/concepts/events.md:40`. Retargeted the doc task (Proposed-change item 7 and Files-changed) to `docs/workflows/concepts/events.md`, dropped the `event-display.md` edit, and noted there is no separate `docs/workflows/reference/events.md`.

The Files-changed list (line 151) says update `docs/shared/event-display.md` because "the description slot is no longer strictly comment-only." But `docs/shared/event-display.md` is about the module-level `event_display` **var** (per-app **title** templates) — it never mentions the description slot or a comment-only rule, so there is nothing there to relax.

The comment-only invariant D3 actually relaxes is stated in `docs/workflows/concepts/events.md:40`:

> The `description` slot is owned by the action comment … Authoring a `display.{app}.description` … is rejected at build; a `description` arriving from a pre-hook's `event_overrides` is stripped at merge, **so the comment is always the sole writer of the slot. A comment-less event simply has no body.**

Both bolded sentences become **false** after Part 70: the engine becomes a second writer of the slot, and `action-fields-updated` is a comment-less event that _does_ have a body. Per CLAUDE.md ("`docs/` is the source of truth for consumer-observable authoring behavior"), this is exactly the behavior that must be corrected. Fix: retarget the doc task to `docs/workflows/concepts/events.md` (add the engine-generated-description exception) and drop the misdirected `docs/shared/event-display.md` edit. Note there is no separate `docs/workflows/reference/events.md` — the "workflows events reference" the design refers to is this concept page.

## Design clarity

### 3. D7's "formatted in UTC … to match the read-only due-date chip's default" is self-contradictory — the chip renders in the viewer's local timezone

> **Resolved.** Confirmed the chip uses `_dayjs.format` with no `.utc()` (`universal-fields-chips.yaml:298`), so it renders local-tz. Reframed D7 around the root point (raised by the user): `due_date` is a date-only value with no tz component, stored as a BSON `Date` at UTC midnight; formatting in the pinned zone (UTC) is the _correct_ way to read back a stable calendar date — not just a defensible snapshot choice. Dropped the "matches the chip" justification, restated as format-string-only, and acknowledged the divergence: the same date may read one day apart between the live chip (local) and the snapshotted body (UTC). Added a non-goal that fixing the chip to UTC (the correct fix for the latent chip bug) is out of scope.

D7 justifies UTC formatting partly as matching the chip (`universal-fields-chips.yaml:300–304`). But that chip formats with `_dayjs.format` **client-side, with no `.utc()`**, so it renders in each viewer's _local_ timezone — which is precisely the "date-only value knocked to the previous day" behavior D7 says it wants to avoid. So a `due_date` stored at UTC midnight renders as `Jul 15` in the UTC description but can render as `Jul 14` in the chip for a viewer behind UTC. The description matches the chip's **format string** only, not its timezone basis.

This is partly unavoidable: the description is generated server-side (no viewer timezone available) and snapshotted, so it _can't_ track each viewer's local rendering the way the chip does. A fixed snapshot tz (UTC) is the defensible choice for an audit record. The finding is that the **rationale is wrong**, not the decision: the design should drop the "to match the chip" justification (or state it as format-only) and instead acknowledge the divergence explicitly — the same due date may read one day off between the live chip (local) and the snapshotted event body (UTC). If a consistent story is wanted, the follow-up is to make the chip UTC too; that's out of scope here but worth a one-line non-goal.

## Minor

### 4. UTC formatting needs the dayjs UTC plugin extended — this is the first server-side dayjs use

> **Resolved.** Rather than add server-side dayjs + the utc-plugin `.extend`, dropped dayjs from this path entirely: the diff comparison is `+a === +b` (no dayjs), and formatting uses `getUTCMonth()`/`getUTCDate()`/`getUTCFullYear()` + a month-name array, which is UTC by construction and produces the same `MMM D, YYYY` string deterministically. Updated D7 and the `renderFieldsUpdateDescription.js` Files-changed note accordingly.

`dayjs` is a dependency (`package.json:33`), but it is currently used only in browser blocks (`EventsTimeline.js`, `FileManager.js`); no connection/planner code imports it, and `dayjs/plugin/utc` is not extended anywhere in the package. `renderFieldsUpdateDescription` will be the first server-side dayjs usage and must `import utc from "dayjs/plugin/utc"; dayjs.extend(utc); dayjs.utc(d).format("MMM D, YYYY")`. Cheap, but call it out in the Files-changed note so the implementer doesn't reach for `toLocaleDateString` (host-tz-dependent) or forget the `.extend`.

### 5. The no-op check ignores `metadata`, so a metadata-only update is silently dropped

> **Resolved.** Traced the metadata path: `planFieldsUpdate`'s only caller is `UpdateActionFields`, whose only entry is the module-generated `{type}-update-fields` endpoint (`emitFieldsEndpoint`, `makeWorkflowApis.js`), which maps only `action_id`/`workflow_type`/`fields` — never `metadata`. So `params.metadata` on this path is unreachable dead code (no author channel; the fields endpoint also has no `event_overrides`). Rather than document the boundary, removed the dead plumbing (the `metadata` param on `planFieldsUpdate` + the empty `...metadata` merge; the `metadata: params.metadata` pass-through in `UpdateActionFields`). Verified action-doc metadata stays live via **transitions** — `planActionTransition` merges `payload.metadata` (submit endpoint exposes `metadata: {_payload}`), untouched — and `planFieldsUpdate` still carries existing `action.metadata` forward (`{ ...targetAction.metadata }`) to the status-map re-render. Updated D5, the handler-flow worked shape, and Files-changed.

D5 keys the early-return solely on the two universal fields. `planFieldsUpdate` also merges `params.metadata` onto the doc (`planFieldsUpdate.js:70`). After this change, a call with unchanged fields but a non-empty `metadata` bag returns `event_id: null` with **no write** — the metadata merge is lost. The v1 endpoint sends no metadata (`planFieldsUpdate.js:49` "the v1 endpoint sends none"), so impact is nil today, but the behavior is worth one sentence in D5 (metadata is not part of the change set; a metadata-only call is a no-op) so the boundary is intentional rather than accidental.
