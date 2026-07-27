# Part 70 — Field-update events say what changed

When a user edits an action's **due date** or **assignees** (the two universal fields, Part 24), the engine logs an `action-fields-updated` event whose title is the generic fallback — today "Sam updated Qualify", and after [Part 69](../69-event-entity-links/design.md) "Sam updated Qualify on lead Acme Corp". Neither says _what_ changed: not which field, not the old or new value, not who was added or removed. This part makes the event carry that detail in its **description** — the rich-text card slot the timeline already renders below the title — so the same event reads:

> **Sam updated Qualify on lead Acme Corp** · 2h ago
> Due date: Jul 8, 2026 → Jul 15, 2026
> Assignees: added Bob, Dave; removed Carol

The title is left to Parts 53/69; this part only fills the description. A no-op save (Update pressed with nothing actually changed) logs no event at all.

## Proposed change

1. **Generate a description on the `action-fields-updated` event** listing exactly what changed: a "Due date: {from} → {to}" line when the due date changed, and an "Assignees: added …; removed …" line when the assignee set changed. It renders in the existing `EventsTimeline` description card (`dangerouslySetInnerHTML(sanitize(...))`).
2. **Resolve added/removed assignee names in the handler** (`UpdateActionFields`) via one `$in` on the contacts collection for only the changed ids — because `assignees` stores ids only and the planner is pure (no I/O). Names are baked into the description at write time (a point-in-time snapshot, consistent with how the title already freezes the actor and action names).
3. **Compute the diff with a pure helper** `computeUniversalFieldChanges(before, fields)` — which of the two fields changed, the due-date from/to, and the added/removed assignee id sets — used by the handler both to decide the no-op case and to know which ids to resolve.
4. **Compose the description HTML in a pure helper** `renderFieldsUpdateDescription(change)` and inject it into `display.{app_name}.description` **after** render in `planEventDispatch` (mirroring the Part 33 comment fold), so user-derived names never pass through the Nunjucks compile.
5. **Suppress the event on a true no-op** — when neither universal field actually changed, `UpdateActionFields` returns early (`event_id: null`) without planning or committing, so no meaningless "updated" event lands on the timeline.
6. **Leave the title untouched** — Part 53 (base verbs) and Part 69 (entity clause) own `display.{app}.title`; this part owns `display.{app}.description` only. Different slots, no shared template edits.
7. **Update the events docs and tests** — the workflows events concept doc (`docs/workflows/concepts/events.md`, where the comment-only rule lives — description is no longer comment-only), and the `UpdateActionFields` / `planEventDispatch` suites (description content, name resolution, no-op suppression).

## Current state

- **Storage.** An action's `assignees` is an **array of user-id strings** (`["u-7"]`) — no names denormalized (`GetWorkflowAction.js:186` reads `action.assignees` then `$in`-resolves names on every read against `contactsCollection`). `due_date` is a **`Date`** (`null` when unset). Both are `$set` on the action by `planFieldsUpdate` (`UNIVERSAL_FIELDS = ["assignees", "due_date"]`), with the payload bag's presence-or-absence deciding write-or-leave.
- **The event.** `planFieldsUpdate` (`planFieldsUpdate.js:86`) calls `planEventDispatch` with `handlerType: "UpdateActionFields"`, which stamps `type: "action-fields-updated"`, sets `display.{app_name}.title` to `ACTION_FALLBACK_TITLE`, and **never sets a description** — the field-update path carries no comment (Part 61), so `foldCommentIntoEvent` is a no-op for it. Metadata is `{ action_type, workflow_type, current_key }`.
- **The description slot.** `EventsTimeline.js` renders `event.description` as a `Card` (`:240–292`) below the title when present; otherwise it renders the bare title row. `GetEventsTimeline` already projects `description` off `$${app_name}.description` (`:202–206`), so a stored description reaches the timeline with **no** GetEventsTimeline change. Today the _only_ writer of a description is the Part 33 comment fold — so this part introduces the first **engine-generated** description.
- **The handler.** `UpdateActionFields` (`UpdateActionFields.js`) is async and already does I/O (`loadWorkflowState`); `loadedState.targetAction` is the pre-update ("before") doc, and `context.params.fields` is the incoming bag. It always plans, commits, and returns `{ action_id, event_id }`.
- **Dispatch.** `commitPlan`'s `dispatchEvent` reads `plan.event.doc` unconditionally (`commitPlan.js:137`) — so suppression must keep a null event _out_ of the plan rather than threading one through commit.

## Key decisions and rationale

### D1 — Detail goes in the description card, not the title {#d1}

The title is a single line and Part 69 already spends it on "{actor} updated {action} on {entity}". Cramming the full data in — from→to dates, every name added and removed — would blow the line out, and there is no bound (an action could gain five assignees). The description card is built for exactly this: multi-line rich text under the title. Putting the detail there lets us **show everything** with no truncation, no "+N more", no mixed-add/remove fallback — the constraints that a title-only design forced.

Rejected alternatives:

- **Everything in the title.** Unbounded length; collides with Part 69's entity clause (double "on", or a forced possessive "Qualify's due date … on lead Acme Corp").
- **The `info` slot.** `info` is surfaced only behind a "Click here for more info" link that opens a modal (`EventsTimeline.js:295–308`) — the wrong ergonomics for something a reader should see at a glance.

### D2 — This part owns the description; Parts 53/69 own the title {#d2}

A clean seam: this part does **not** touch `DEFAULT_SIGNAL_TITLES`, `ACTION_FALLBACK_TITLE`, or the `resolveActionSignalTitle` branch. The fields-update title stays whatever Part 53/69 make it ("Sam updated Qualify on lead Acme Corp"), and this part adds a description below it. Because the two parts edit **different display slots**, they compose with no coordination and no shared-file merge risk — order of delivery doesn't matter.

This **supersedes the earlier direction** of naming the changed fields _in the title_ ("Sam updated the due date and assignees on Qualify"). Once the fields are named in the card ("Due date: …", "Assignees: …"), naming them in the title too is redundant, and the card is where the values have to live anyway (D1). The title's job is who + what-action + which-entity; the card's job is which-fields + values.

### D3 — Relax "description = comment-only" for engine-generated content {#d3}

Parts 33/61 established the description slot as **comment-only**: the merge strips any non-comment `description`, and _author_-supplied descriptions are rejected at build (`makeWorkflowsConfig`). That guard was about untrusted author/runtime HTML — it does not extend to the **engine** writing a description it composed itself. This part relaxes the invariant precisely there: the engine may generate a description on the fields-update path.

There is **no collision** to manage: the field-update operation carries no comment (Part 61), so on this one path the description slot is otherwise empty. The build-time rejection of _author_-supplied descriptions stays exactly as-is — this is not an author channel. So the relaxation is narrow: "the description slot is comment-only, _except_ the engine's own field-change summary on `action-fields-updated`."

### D4 — Resolve names in the handler; snapshot them into the description {#d4}

`assignees` holds ids only, so "added Bob" needs a name lookup, and the planner is pure. The handler already does I/O, so it resolves the **changed** ids only — `$in` on `contactsCollection` for `[...added, ...removed]`, projecting `profile.name` — the same collection and shape `GetWorkflowAction` uses (`GetWorkflowAction.js:189–198`). The typical change is one or two ids, so this is a tiny query, and only runs when the assignee set actually changed.

Names are **baked into the description at write time**, not resolved when the timeline renders. This matches every other event field (the title already freezes `user.profile.name` and `action.title` at write time) and Part 69's explicit snapshot decision for the entity name. It is the correct semantics for an audit record ("at the time, Bob was added") and keeps read-time (`GetEventsTimeline`) untouched. A rename later does not retro-edit history — desired for an audit log. An id with no matching contact (deleted user) falls back to the raw id rather than dropping the entry.

### D5 — Suppress the event on a true no-op, in the handler {#d5}

The Update modal fires the endpoint even when the user changed nothing (opened, clicked Update). Logging "Sam updated Qualify" with an empty card is noise. So when `computeUniversalFieldChanges` reports neither field changed, `UpdateActionFields` **returns early** — before `planFieldsUpdate` / `commitPlan` — with `{ action_id, event_id: null }`. No action write (there is nothing to persist, so no spurious `updated` bump either) and no event.

Doing it in the handler keeps `commitPlan`, `dispatchEvent`, and the planners **unchanged**: `planFieldsUpdate` is only ever reached with a real change, so `plan.event` is never null and `dispatchEvent`'s `plan.event.doc` read stays safe. The `event_id: null` in the return is the only contract change; the client action sequence tolerates a null id (it does not depend on the event id).

The change set is **the two universal fields only** — there is no metadata dimension to reason about, because on this path there is no `metadata` at all. `planFieldsUpdate` historically accepted a `metadata` bag and merged it onto `action.metadata`, but the field-update endpoint (`emitFieldsEndpoint`, `makeWorkflowApis.js`) maps only `action_id` / `workflow_type` / `fields` — it never supplies `metadata`, and `planFieldsUpdate`'s sole caller is `UpdateActionFields`, so `params.metadata` here is always undefined. **This part removes that dead plumbing** (the unused `metadata` param and the empty `...metadata` merge). Action-doc metadata remains a live concept set on **transitions** (`planActionTransition` merges `payload.metadata`, exposed via the submit endpoint's `metadata: {_payload}`); `planFieldsUpdate` still carries any such existing metadata forward unchanged (`doc.metadata = { ...targetAction.metadata }`, still fed to the status-map re-render) — it just no longer merges an always-empty bag on top. So a metadata-only call cannot even be constructed on the fields endpoint; the boundary is enforced by the endpoint shape, not documented as a caveat.

### D6 — Inject the description after render; escape names in JS {#d6}

`@lowdefy/nunjucks` autoescapes and `renderTree` runs Nunjucks over every string in the display tree. A description built from user names must not pass through that compile — a name containing `{{`/`{%` would throw or interpolate against the render context (the same hazard Part 33 avoids for comments). So `renderFieldsUpdateDescription` builds the final HTML in JS with each name and formatted date **HTML-escaped**, and `planEventDispatch` writes it into `display[appName].description` **after** `renderEventDisplay` (right where `foldCommentIntoEvent` runs — a no-op here since there is no comment). DOMPurify's `sanitize()` at render (`EventsTimeline.js:286`) is the final backstop.

### D7 — Due date shown as "from → to"; dates formatted UTC {#d7}

The card shows the previous and new value — "Due date: Jul 8, 2026 → Jul 15, 2026" — with "None" for an unset side ("None → Jul 15, 2026" on first set; "Jul 8, 2026 → None" on clear). Format is `MMM D, YYYY` (the same string as the read-only due-date chip's `date_format` default, `universal-fields-chips.yaml:304`); events have no per-consumer `date_format` var, so it's fixed.

`due_date` is a **date-only** value with no meaningful time or timezone component, but Mongo has no date-only type — it is stored as a BSON `Date` pinned to **UTC midnight** (`new Date("2026-01-01")` → `…T00:00:00.000Z`). The correct way to read a date-only value back is to format it in the same zone it was pinned to, so the calendar date is stable on any clock. So the description formats in **UTC** — formatting in local time would knock a UTC-midnight value to the previous day for any viewer behind UTC ("Jul 15" → "Jul 14"). No dayjs is needed: the `getUTC*` accessors are UTC by construction, so a three-line formatter (`` `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` ``) produces "Jul 15, 2026" deterministically on any server clock. (Comparison in the diff helper is `+a === +b`; neither path pulls dayjs server-side.)

Note this matches the chip's **format string only, not its timezone basis**: the chip formats client-side with `_dayjs.format` and no `.utc()` (`universal-fields-chips.yaml:298`), so it renders in each viewer's _local_ zone and can itself show a date-only value one day off. The same `due_date` may therefore read one day apart between the live chip (local) and this snapshotted event body (UTC). The chip's local rendering is the latent bug — the fix is to make the chip UTC too — but that is out of scope for this part (see Non-goals).

## Worked shapes

**Pure diff helper** — presence-in-bag = considered; equal = not a change:

```js
// computeUniversalFieldChanges(before, fields) → { due_date, assignees }
// due_date: { from: Date|null, to: Date|null } when changed, else null
//   Compared BY VALUE, not identity — both sides are distinct Date objects
//   (before.due_date off Mongo, fields.due_date hydrated from the DateSelector),
//   so `!==` would flag every save. Equality:
//     const same = (a, b) =>
//       (a == null && b == null) || (a != null && b != null && +a === +b);
//   changed ⇔ ("due_date" in fields) && !same(before.due_date, fields.due_date)
// assignees: { added: string[], removed: string[] } when changed, else null
//   added   = fields.assignees \ before.assignees   (set difference, default [])
//   removed = before.assignees \ fields.assignees
//   (id strings, so set difference is value-based already)
// no-op ⇔ due_date == null && assignees == null
```

**Handler flow** (`UpdateActionFields`):

```js
const change = computeUniversalFieldChanges(
  loadedState.targetAction,
  params.fields ?? {},
);
if (!change.due_date && !change.assignees) {
  return { action_id: params.action_id, event_id: null }; // D5 — no-op, no event
}
let assignees = null;
if (change.assignees) {
  const ids = [...change.assignees.added, ...change.assignees.removed];
  const nameById = await resolveContactNames(context, ids); // $in contactsCollection, D4
  assignees = {
    added: change.assignees.added.map((id) => ({
      id,
      name: nameById[id] ?? id,
    })),
    removed: change.assignees.removed.map((id) => ({
      id,
      name: nameById[id] ?? id,
    })),
  };
}
const plan = planFieldsUpdate({
  loadedState,
  fields: params.fields,
  fieldsChange: { due_date: change.due_date, assignees }, // resolved names ride in
  context,
});
```

**Description HTML** (`renderFieldsUpdateDescription`, escaped/formatted in JS):

```html
<!-- both changed -->
<div>Due date: Jul 8, 2026 → Jul 15, 2026</div>
<div>Assignees: added Bob, Dave; removed Carol</div>

<!-- due date set only -->
<div>Due date: None → Jul 15, 2026</div>

<!-- assignees removed only -->
<div>Assignees: removed Carol</div>
```

`planEventDispatch` (fields-update branch), after render:

```js
// display[appName] already carries the rendered title (Part 53/69).
if (isFieldsUpdate && fieldsChange) {
  renderedDisplay[appName].description =
    renderFieldsUpdateDescription(fieldsChange);
}
```

## Files changed

- `plugins/.../WorkflowAPI/UpdateActionFields/UpdateActionFields.js` — compute the diff; no-op early-return (`event_id: null`); resolve added/removed names via `$in` on `contactsCollection`; pass `fieldsChange` into `planFieldsUpdate`. New small `resolveContactNames(context, ids)` helper (or reuse `GetWorkflowAction`'s `findDocs` pattern). **Remove the dead `metadata: params.metadata` pass-through and its JSDoc** — the fields endpoint never supplies it (see below).
- `plugins/.../planners/planFieldsUpdate.js` — accept `fieldsChange` and thread it to `planEventDispatch`. **Drop the unused `metadata` param and the empty `...metadata ?? {}` merge** (`doc.metadata` becomes `{ ...targetAction.metadata ?? {} }` — existing action metadata still carried to the status-map re-render); update the JSDoc. This is dead only on the fields path — `planActionTransition`'s metadata merge (the live transition/submit channel) is untouched.
- `plugins/.../planners/planEventDispatch.js` — on `isFieldsUpdate`, set `display[appName].description` from `renderFieldsUpdateDescription(fieldsChange)` after render. Title logic untouched.
- `plugins/.../planners/computeUniversalFieldChanges.js` — new pure diff helper.
- `plugins/.../render/renderFieldsUpdateDescription.js` (or colocated) — new pure HTML composer; formats dates `MMM D, YYYY` in UTC via `getUTCMonth()`/`getUTCDate()`/`getUTCFullYear()` + a month-name array (no dayjs — the accessors are UTC by construction; avoids a server-side dayjs dep and the utc-plugin `.extend`); HTML-escapes names.
- Tests: `computeUniversalFieldChanges` + `renderFieldsUpdateDescription` unit suites — including **a fresh `Date` equal by value to the stored `due_date` ⇒ no `due_date` change ⇒ no event** (guards the identity-comparison trap); `planEventDispatch.test.js` (fields-update sets a description; title unchanged); `UpdateActionFields.test.js` (add/remove/both/set/clear description content, name resolution, **no-op → no event / `event_id: null`**).
- `docs/workflows/concepts/events.md` — the comment-only invariant (`:40`) is no longer strictly true: relax it to note the engine-generated field-change summary as the exception, and that `action-fields-updated` is a comment-less event that now carries a body. (`docs/shared/event-display.md` is about the `event_display` title-template var and does not mention the description slot; there is no separate `docs/workflows/reference/events.md`.) No `module.lowdefy.yaml` var changes.

Verify with `pnpm ldf:b` (config) + the plugin test suites.

## Non-goals

- **No title changes.** The fields-update title is owned by Part 53 (verbs) and Part 69 (entity clause); this part adds only the description (D2).
- **No read-time name resolution.** Names are snapshotted at write time; `GetEventsTimeline` is untouched (D4).
- **No new metadata fields.** The change-log already records before/after of the action (`planChangeLog` in `planFieldsUpdate`); the human summary lives in the description. Adding `changed_fields` to `metadata` is a speculative filter surface — deferred until a concrete need appears.
- **No author/override channel for this description.** It is engine-generated only; the author-description build rejection (Part 33) stays. Field-update events have no `event_overrides` channel (Part 24), and this part does not add one.
- **No `commitPlan` / `dispatchEvent` change.** No-op suppression is a handler early-return, so a null event never reaches the plan (D5).
- **No client-side change to the Update button.** Suppression is server-side and authoritative; disabling the button on an unchanged form is a separate, optional UX nicety.
- **No fix to the due-date chip's timezone.** The chip formats date-only values in the viewer's local zone (`_dayjs.format`, no `.utc()`), so it can read one day off from this UTC-formatted description (D7). Making the chip UTC is the correct fix but a separate change.

## Related

- Part 24 (`_completed/24-universal-fields`) — the `assignees` / `due_date` edit surface and the `UpdateActionFields` operation this enriches.
- Part 53 (`_completed/53-titles`) — the curated title-template system whose fields-update fallback this leaves in place.
- Part 69 (`69-event-entity-links`) — rewrites the title to add the entity clause; composes with this part (title vs description slot). Sibling, either order.
- Part 33 (`_completed/33-comment-rendering`) — precedent for HTML written into the description after render, escaping the Nunjucks compile.
- Part 61 (`_completed/61-multi-app-comment-visibility`) — established the field-update path carries no comment, leaving the description slot free here.
- Feedback item "events for edit assignees" (`parts/gerrie feedback.md`).
