# Review 2

Scope: Part 50 "Collapse to one config-free entity events timeline," second pass.
Review 1's six findings are all annotated resolved and the resolutions are reflected in
the current `design.md` — verified, not repeated here. This pass verified the design
against the actual engine, block, and component source and found four gaps Review 1 did
not reach (the first two are correctness blockers), plus one minor confirm.

One thing Review 1 raised obliquely that **checks out and is not a finding**: the engine's
event `$match` (`GetEventsTimeline.js:58–67`) requires `{ [app_name]: { $ne: null } }`,
which mirrors the `display_key $ne null` guard in the events-only request
(`events-timeline.yaml:27–31`). So the _set of events returned_ is genuinely identical
between the two paths — D4's "renders identically" holds at the event-set level, not just
the card-rendering level.

## Correctness & gaps

### 1. The engine has no skip path today, and its `??` collection defaults will defeat the null-gating the design depends on

> **Resolved.** The finding is correct that the engine has no skip path and the `??` defaults don't gate — but the resolution rejects the finding's _fix_ (remove the defaults + build conditional skip branches) in favour of dropping the gating requirement entirely. The actions `$lookup` keys on `localField: action_ids`; a CRM app's events carry none, so it matches nothing and returns `actions: []` (dedup stages no-op on the empty array, block guards on `length > 0`) — the stage is **inert without action data**, so there is nothing to skip and the `?? 'actions'` fallback is _needed_ (it gives the no-op lookup a valid `from`; `$lookup` on a non-existent collection is valid in MongoDB and returns empty). The contacts `$lookup` keys on `created.user.id` (always present) so it does run, but degrades to initials via `$ifNull` when unmatched — also left unconditional. Net: no net-new conditional pipeline assembly. Reframed change 3, D4, the intro, the worked example, and the engine's Files-changed bullet: both lookups stay unconditional, the `??` fallbacks stay, and the `actions_collection` / `contacts_collection` vars are documented as collection-name overrides (defaulting to `actions` / `user-contacts`) rather than on/off gates. The "one var switches enrichment on" framing is softened to data-driven enrichment.

D4 and change 3 are built on "`actions_collection` null ⇒ skip the actions `$lookup`" and
"`contacts_collection` null ⇒ skip the author-avatar join." But the engine as written has
**no skip branch for either join** — both lookups run unconditionally, and the collection
names are resolved with fallback defaults:

```js
// GetEventsTimeline.js:36–37
const actionsCollection = connection.actionsCollection ?? "actions";
const contactsCollection = connection.contactsCollection ?? "user-contacts";
```

Two consequences the design does not account for:

- **The `??` defaults invert the intended default-OFF.** The plan wires
  `actionsCollection: { _module.var: actions_collection }` with the var defaulting to
  null. With the var null, the connection field is null, and `null ?? 'actions'`
  evaluates to `'actions'` — so the engine **still joins the `actions` collection**,
  exactly the opposite of "a pure-CRM app pays nothing." Same for `contactsCollection`.
  The `??` fallbacks must be removed (or changed to honour an explicit null) for null to
  mean "skip."
- **The skip branches must be built.** The actions `$lookup` (`:72–128`) and its four
  dependent dedup stages (`$unwind`/`$setWindowFields`/`$group`/`$replaceRoot`,
  `:134–187`), plus the contacts `$lookup` and `created.user.picture` `$addFields`
  (`:224–237`), are all currently unconditional. Making them var-gated is net-new
  conditional pipeline assembly, not a side effect of dropping `workflowsConfig`.

The Files-changed entry for the engine lists only "drop the `workflowsConfig` dependency;
read the denormalised sort key" — it does not mention removing the `??` defaults or adding
the two conditional skip branches, which is where most of the engine's actual edit lives.

**Fix:** In change 2/3 and the engine's Files-changed bullet, state explicitly that the
engine (a) drops the `?? 'actions'` / `?? 'user-contacts'` fallbacks so a null connection
field means "skip," and (b) conditionally omits the actions `$lookup` + its dedup stages
when `actionsCollection` is null and the contacts `$lookup` + avatar `$addFields` when
`contactsCollection` is null.

### 2. Change 6 deletes the exact `actionStatusConfig` wiring the unified timeline needs to render any card

> **Resolved (auto).** Confirmed against source: `events-timeline.yaml:88–91` is the only `actionStatusConfig` wiring (a `_build.object.assign` of the live `../shared/enums/action_statuses.yaml` enum + the dead `action_statuses_display` var), and `EventsTimeline.js:525` gates all card rendering on the prop being truthy. Reworded change 6, the "Current state" delete list, and the Files-changed bullet to drop **only** the `action_statuses_display` merge term while keeping the enum ref (now the unified timeline's status-config source); added the `EventsTimeline.js:525` card-gate note so the requirement is explicit.

Change 6 says to delete "the `actionStatusConfig` prop wiring (`events-timeline.yaml:88–91`)"
and immediately adds "The `EventsTimeline` block keeps its `actionStatusConfig` prop — the
unified timeline now uses it." These two statements contradict each other at the line
level: lines 88–91 **are** the only `actionStatusConfig` wiring in the events timeline:

```yaml
# events-timeline.yaml:88–91
actionStatusConfig:
  _build.object.assign:
    - _ref: ../shared/enums/action_statuses.yaml # the live enum
    - _module.var: action_statuses_display # the dead var
```

And the block gates **all** card rendering on this prop being truthy:

```js
// EventsTimeline.js:525
const hasActions =
  actionStatusConfig &&
  Array.isArray(event.actions) &&
  event.actions.length > 0;
```

If change 6 deletes lines 88–91 wholesale, `actionStatusConfig` is `undefined`, `hasActions`
is always false, and the unified timeline renders **zero action cards even with enrichment
on** — defeating the whole part. Only the second merge term (`action_statuses_display`, the
dead var) should go; the `_ref: ../shared/enums/action_statuses.yaml` enum must stay (the
workflows timeline today wires the same prop from its own `components/action_statuses.yaml`,
which change 5 deletes — so the shared enum becomes the unified timeline's source).

**Fix:** Reword change 6 to "drop the `action_statuses_display` merge term from the
`actionStatusConfig` wiring (keeping the `../shared/enums/action_statuses.yaml` enum ref),
and delete the `action_statuses_display` var" — not "delete the prop wiring at :88–91."

## Internal contradictions

### 3. The `onActionClick` check hook is unconditional, contradicting D4's "names no workflows concept in its default configuration"

> **Resolved** via the finding's option (b), reversing its preferred (a). (a) — build-time-gate the hook on `actions_collection` being set — is now incoherent after #1's resolution: enrichment is data-driven (the `?? 'actions'` default lets cards render with the var unset), so gating the hook on the var would leave clickable cards with no handler. Adopted (b): the hook stays unconditional and D4 is softened to "names no workflows concept it **acts on** by default." The hook is the same shape as the always-present actions `$lookup` — inert without action data: it fires only when a card is clicked, and a card only renders for an app that already has actions referenced by its events, so a pure-CRM app renders no cards and the hook is unreachable dead config there. D4 updated with this reasoning and the explicit rejection of (a).

Change 5 moves the check-action click handler onto the events timeline as `onActionClick`,
"since that is now the only timeline." That handler (`workflows/components/check-action-click.yaml`)
is workflow-specific: it branches on `action.kind === 'check'` and tries to open a
`check_action_modal` block. Moving it into `events-timeline.yaml`'s `events:` block puts
that workflow vocabulary into the events module's **default** component — present even when
`actions_collection` is null and no cards ever render.

That directly contradicts D4's claim that with enrichment off "the events module names no
workflows concept in its default configuration." It is inert (no cards ⇒ `onActionClick`
never fires), but it is not _absent_ — a pure-CRM app's events timeline would still carry
`kind: check` / `check_action_modal` config.

**Fix:** Either (a) build-time-gate the `onActionClick` wiring on `actions_collection`
being set (so it is genuinely absent by default), or (b) soften D4 to "names no workflows
concept it acts on by default" and acknowledge the inert hook. (a) keeps D4 literally true
and is the cleaner match to the part's "one app-level switch" framing.

### 4. "Relocating" the engine to the new connection is under-specified: it must be removed from `WorkflowAPI`'s request map, and its file home is unstated

> **Resolved.** Both gaps specified. Change 2 now lists the two concrete relocation steps: (a) `GetEventsTimeline` is removed from `WorkflowAPI.js`'s `requests` map (and import) and registered only on `EventsTimeline` — one request type, one connection type; (b) the engine directory **moves** to `.../connections/EventsTimeline/GetEventsTimeline/` (config-free, it no longer belongs under the workflows connection; the move is path-neutral for its `../../shared/render/...` imports, which sit at the same depth under either parent). Files-changed updated: the engine bullet reflects the new path + the move, a new bullet covers removing it from `WorkflowAPI.js`, and the `EventsTimeline` bullet notes its `requests` map exposes the relocated engine.

`GetEventsTimeline` is currently registered in the `WorkflowAPI` connection's `requests`
map (`WorkflowAPI.js:24`). Change 2 introduces the `EventsTimeline` connection that
"exposes the `GetEventsTimeline` request," but neither change 2 nor Files-changed says to
**remove** it from `WorkflowAPI.requests`. Leaving it in both binds one request type to two
connection types — at best redundant, at worst ambiguous request routing. Relatedly, the
engine _file_ path is left implicit: the first Files-changed bullet still points at
`.../WorkflowAPI/.../GetEventsTimeline/`, while the new connection lives at
`.../EventsTimeline/`. The design should say whether the engine file moves under
`EventsTimeline/` or stays under `WorkflowAPI/` and is merely imported by the new
connection.

**Fix:** Add to change 2 / Files-changed: remove `GetEventsTimeline` from
`WorkflowAPI.js`'s `requests` map, register it only on `EventsTimeline`, and state the
engine file's destination directory.

## Minor / confirm

### 5. The `get-events` request id is referenced three times in the component and all three must move to the engine request

> **Resolved (auto).** Confirmed: `events-timeline.yaml` references `get-events` at the `onMount` fetch (`:11`), the empty-state `visible` (`:66`), and the block `data`/`visible` (`:79`, `:83`), plus the request definition itself (`:14`). The finding explicitly calls for no design change — it is a task-time atomicity note that all references rename together. No design edit; flagged here so the implementing task treats the rename as one atomic edit.

`events-timeline.yaml` references the inline request `get-events` in three places — the
`onMount` fetch (`:11`), the empty-state `visible` (`:64–67`), and the block `data` /
`visible` (`:78–83`). Change 3 routes the timeline "through the engine method on the events
connection." Whatever the new request is named (a `GetEventsTimeline`-typed request on the
`events-timeline` connection, passing `reference_field` + `reference_value` as params like
`workflows/requests/get_events_timeline.yaml` does today), all three references must update
together, or the empty-state and visibility guards silently break. No design change needed
— just confirm the rename is treated as one atomic edit in the task.
