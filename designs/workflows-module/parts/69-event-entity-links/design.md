# Entity links in event titles

Workflow timeline events name the actor and what they did, but never say **which entity** it happened on — "Sam submitted Send Quote for review" leaves the lead implicit. This part adds the entity to every default event title as a clickable link, so the same event reads "Sam submitted Send Quote on lead <a>Acme Corp</a> for review", with "Acme Corp" linking to the entity's page. It matters most on the cross-entity unified timeline (Part 50), where events from many leads are interleaved and the entity is the missing context.

## Proposed change

1. **Resolve the entity display name once per event, at the top of the call.** Each handler (and each tracker-cascade level) resolves its own entity's `entity.data` routine via the existing `resolveEntityData` helper — which dispatches through `context.callApi` on the build-resolved `entity.data_endpoint`, the same InternalApi contract the read handlers already use. The result is exposed as a top-level `entityData` context value (the same altitude as `user`) and threaded into `planEventDispatch`. Nothing is persisted onto the workflow doc — the name is rendered into the event title at write time, point-in-time-correct for that event.
2. **Build an `entity_ref` render-context object in `planEventDispatch`,** derived from `plannedWorkflowDoc.entity` (the id/ref_key), the resolved `entityData` (the name), and a new `entityConfig` input (the workflow's `entity` config block: `page_id`, `id_query_key`, `title`). It carries `{ label, name, text, href, phrase }` where `phrase` is a pre-escaped, `| safe`-ready HTML fragment.
3. **Rewrite the curated title templates** (`DEFAULT_SIGNAL_TITLES`, the `submit` branch, `LIFECYCLE_TITLES`, and the action fallback) to weave the entity in — `… on {{ entity_ref.phrase | safe }} …` — across all event types (action signals, tracker-mirror, lifecycle, fields-update).
4. **Thread `entityConfig: workflowConfig.entity` and the resolved `entityData` into the six `planEventDispatch` call sites** (`StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`, `planSubmit`, `planFieldsUpdate`, `planTrackerLevel`). The impure handler (or cascade level) resolves `entityData` at the top of the call and passes it — with `entityConfig` — into the pure planner, exactly as `user` is already resolved and passed in; every call site already holds `workflowConfig`.
5. **Fall back to the type label** when no name resolves (no `entity.data` routine, or it returns no `name`): the anchor text becomes the entity type label (`entity.title`) — "… on <a>Lead</a> …" — so the link always works and the label is never duplicated.
6. **Update the demo and the events docs,** and extend the `planEventDispatch` / handler test suites to assert the anchor, the fallback, and that `entityData` is resolved once per event via `callApi`. No workflow-doc schema change — nothing is persisted.

## Key decisions and rationale

### Resolve the name per event, at the top of the call — don't snapshot it onto the doc

The entity name is not on the workflow document — Part 26 deliberately keeps it out, resolving it fresh on every **read** (breadcrumbs, back-links) because a live page should show the entity's current name. Events follow the same model as the **actor**: `{{ user.profile.name }}` is resolved fresh in the handler at each event write and rendered into the stored title, never re-resolved. The entity name is resolved the same way — fresh, per event — so an event created today records the entity's name _as of today_. That is the genuine point-in-time record an audit log wants ("at the time of this event, it was called Acme Corp"), and it matches the actor exactly. The link targets the stable `entity.id`, so clicking always lands on the live page regardless of any later rename.

A **snapshot-at-`StartWorkflow`** alternative was considered and rejected. Snapshotting the name once onto the doc at Start would cost zero extra reads (the name would ride on the already-loaded doc), but it freezes the name at _workflow-start_ time: an event created a year later — when the entity has since been renamed — would still render the year-old name, even though the event happened today. That is neither live nor true point-in-time-per-event; it matches neither the actor model nor intuition, and it would add an `entity.name` field to the doc whose only consumer is event dispatch. Per-event resolution is both more correct _and_ removes that schema addition.

**Resolve at the top of the call, expose as a first-class context value.** The resolve happens once per handler invocation (and once per tracker-cascade level, in `runTrackerCascade`), at the same altitude `user` is resolved, and is exposed as a top-level `entityData` — not buried inside the event planner. The pure planners (`planSubmit`, `planTrackerLevel`, `planFieldsUpdate`, and `planEventDispatch` itself) stay pure: they receive the resolved `entityData` as an input, exactly as they already receive `user`. This keeps the resolve at the right altitude and leaves a clean seam for any future write-path consumer of entity data without re-plumbing.

**Cost.** Per-event resolution adds one host `entity.data` aggregation per event written, dispatched through `context.callApi` on the build-resolved `entity.data_endpoint` — the same routine, via the same contract, that the read handlers (`GetWorkflowAction`, `GetWorkflowOverview`, `GetWorkflowActionGroupOverview`) already run on every timeline/detail load. For a single submit or lifecycle action that is one extra read on top of the handler's existing load-plan-commit. A tracker cascade fans events out across several parent workflows, one event per level — but `runTrackerCascade` already does a full load-plan-commit per level, and each level is a **distinct** parent entity, so the added read is one-per-level on top of I/O that already happens, not a blow-up. The one genuine trade-off: `entity.data` is host-authored and of unknown cost, so per-event resolution puts a host-controlled query on the **write** path (today it is read-only). Given the read side already runs it on every page load, this is an accepted trade-off.

**Resolve once per entity per call.** Because the resolve is top-level per handler/level and each event in a call lands on a distinct entity (the base event on the primary entity; each cascade level on a different parent), the name is resolved exactly once per entity per call by construction — there is no same-entity redundancy to cache. The one exception is a "diamond" cascade where two fires reach the same parent; both resolves return the same value, and it is rare enough not to warrant a per-request memo.

**Other write-path consumers.** Audited: notifications don't need a separate resolve — the notification `send_routine` re-fetches the just-written event doc and reads its references/metadata and rendered title, so the entity clause reaches them transitively through the stored event. Hooks receive the full workflow doc (`context.workflow`, carrying `entity.{connection_id, id, ref_key}`) and, being host-authored routines, resolve the name themselves if they need it. So event dispatch is today's only write-path consumer of the resolved name — but the top-level placement is the right altitude regardless of consumer count, and is where a future consumer (e.g. lifting `name` onto the hook payload) would read it.

Every title remains overridable through the existing three-source `event_overrides[signal]` chain, so an app that wants different phrasing/casing has an escape hatch.

### Build the phrase in `planEventDispatch` from `entityConfig` + `entityData`, not at every call site

The link href is fully derivable from config — `/{page_id}?{id_query_key}={entity.id}` — plus the resolved name. Rather than build the `entity_ref` object at all six call sites, `planEventDispatch` builds it once from three things: `plannedWorkflowDoc.entity` (the id/ref_key, already a required input), the resolved `entityData` (the name), and a new `entityConfig` param. Callers add the `entityConfig: workflowConfig.entity` line (they all resolve `workflowConfig`) and pass the `entityData` their handler resolved. Phrase-composition and HTML-escaping logic then lives in exactly one place.

Neither the routing fields (`page_id`, `id_query_key`, `title`) nor the name are denormalized onto the doc: Part 57 established the routing fields as workflow-_definition_ data (they ride in via `entityConfig`), and the name is resolved fresh per event rather than persisted. The doc gains no new fields.

**Constraint: the href is a root-relative literal, so host apps must serve at the domain root.** Unlike the read-side breadcrumb (which hands `pageId` + `urlQuery` to a Lowdefy `Link` and lets the framework resolve the URL), the event title is stored as rendered HTML — `EventsTimeline` emits it via `dangerouslySetInnerHTML`, so there is no `Link` block on this path and the URL must be frozen into the string at write time. That literal `/{page_id}?…` assumes no Next.js `basePath` and that the entity page is not the app's designated home page (served at `/`). Both hold for the target host apps; the assumption is recorded here rather than left implicit. It's an accepted trade-off for a best-effort audit link — if a host with a `basePath` ever appears, that's the concrete trigger to revisit (e.g. prefix a configured base path at dispatch), not a speculative one to build for now.

### Autoescape is on — the phrase is injected `| safe`, escaped in JS

`@lowdefy/nunjucks` autoescapes by default (verified: `{{ x }}` renders `<a>` as `&lt;a&gt;`), and `EventsTimeline` renders the stored title through `dangerouslySetInnerHTML` after a DOMPurify `sanitize()`. So the anchor must be emitted with `{{ entity_ref.phrase | safe }}`, and the phrase is assembled in JS with the **name and label HTML-escaped** before the `<a>` wrapper is added. The href is built from a trusted config `page_id` and a URL-encoded `entity.id`. DOMPurify at render is the final backstop (strips any `javascript:` href or stray markup).

This is safe by construction: the phrase is a context _value_ interpolated with `| safe`, not template _source_, so any `{{ }}` inside an entity name is emitted literally and can't trigger template injection. The markup concern is covered separately — the name and label are HTML-escaped in JS before the `<a>` wrapper is added, and DOMPurify sanitizes at render. (Part 33's comment path is _different_, not a precedent for this one: that HTML is folded in _after_ `renderEventDisplay` specifically so it never reaches the Nunjucks compile at all — whereas the entity phrase deliberately does go through the compile, safely, as a `| safe` value.)

### Type label + linked name, label lowercased

The phrase is `<lowercased type label> <a>name</a>` → "on lead <a>Acme Corp</a>". The type label ("lead") gives entity-kind context when scanning a mixed timeline; the name is the anchor. The label is lowercased _within the phrase_ for natural mid-sentence reading (the exposed `entity_ref.label` field stays as-authored — see below). The one edge is an acronym-style label (e.g. "PO") lowercasing to "po" — rare for an entity type, and fully correctable via the `event_overrides` chain, so it's an accepted default rather than a special case.

When no name resolves, the anchor text falls back to the label **as authored** ("Lead", capitalized) with no preceding label word — "on <a>Lead</a>" — avoiding the "on lead Lead" duplication.

## The `entity_ref` context object

Built by `planEventDispatch` and exposed on the render context. Consumed by the default templates via `{{ entity_ref.phrase | safe }}`; the individual fields are available to `event_overrides` authors who want to compose differently.

Named `entity_ref` — **not** `entity_link` — deliberately: the `Get*` read handlers already expose an `entity_link` object on their API responses with a different shape (`{ pageId, urlQuery, title, name, list_page_id, list_title }`) that feeds the client breadcrumb/back-link `Link` block. Reusing that name for the render-context object would put two incompatible shapes under one identifier in the same module, so an override author who'd seen `entity_link.urlQuery` on a response would reasonably reach for it in a title template and get `undefined`. `entity_ref` keeps the two distinct.

```js
// name present:
{
  label: "Lead",                                   // entity.title, as authored (always)
  name: "Acme Corp",                               // entityData.name (resolved per event)
  text: "Acme Corp",                               // anchor text (name ?? entity.title)
  href: "/lead-view?_id=64f...",                   // /{page_id}?{id_query_key}={id}
  phrase: 'lead <a href="/lead-view?_id=64f...">Acme Corp</a>',
}
// name absent (no entity.data routine, or no `name` returned):
{
  label: "Lead",                                   // entity.title, as authored (always)
  name: null,
  text: "Lead",
  href: "/lead-view?_id=64f...",
  phrase: '<a href="/lead-view?_id=64f...">Lead</a>',
}
```

`label` is **always** `entity.title` as-authored (`"Lead"`), the same in both branches — so an `event_overrides` author who composes with `{{ entity_ref.label }}` gets a stable, predictable value that never depends on whether a name happened to resolve. The mid-sentence lowercasing ("on lead …") is applied _only_ inside `phrase` composition, not to the exposed field; an override author who wants the lowercased form uses Nunjucks' `{{ entity_ref.label | lower }}`.

`phrase` is the whole entity clause (label word + anchor when named; bare anchor when not), so the templates only ever place `on {{ entity_ref.phrase | safe }}` and never branch on presence — the entity block is required on every workflow (Part 57), so `entity_ref` is always non-null.

## Default title templates (rewritten)

`{{ E }}` below is shorthand for `{{ entity_ref.phrase | safe }}`. Two verbs that already contain "on" are reworded so every title ends on a single, uniform `on {{ E }}`.

**Action signals** — actor-driven (`submit` branches on `status_after`):

| Signal / branch        | New default title                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `submit` → `in-review` | `{{ user.profile.name }} submitted {{ action.title }} on {{ E }} for review`                      |
| `submit` → `done`      | `{{ user.profile.name }} completed {{ action.title }} on {{ E }}`                                 |
| `approve`              | `{{ user.profile.name }} approved {{ action.title }} on {{ E }}`                                  |
| `request_changes`      | `{{ user.profile.name }} requested changes to {{ action.title }} on {{ E }}` _(was "changes on")_ |
| `progress`             | `{{ user.profile.name }} started {{ action.title }} on {{ E }}`                                   |
| `not_required`         | `{{ user.profile.name }} marked {{ action.title }} on {{ E }} as not required`                    |
| `resolve_error`        | `{{ user.profile.name }} resolved an error for {{ action.title }} on {{ E }}` _(was "error on")_  |
| fallback (defensive)   | `{{ user.profile.name }} updated {{ action.title }} on {{ E }}`                                   |

**Tracker-mirror** — system-driven, no actor; the parent workflow's entity (the tracker action lives on the parent):

| Signal                            | New default title                         |
| --------------------------------- | ----------------------------------------- |
| `internal_mirror_child_active`    | `{{ action.title }} started on {{ E }}`   |
| `internal_mirror_child_completed` | `{{ action.title }} completed on {{ E }}` |
| `internal_mirror_child_cancelled` | `{{ action.title }} cancelled on {{ E }}` |

**Lifecycle** — workflow-level:

| Handler          | New default title                                                   |
| ---------------- | ------------------------------------------------------------------- |
| `StartWorkflow`  | `{{ user.profile.name }} started {{ workflow.title }} on {{ E }}`   |
| `CancelWorkflow` | `{{ user.profile.name }} cancelled {{ workflow.title }} on {{ E }}` |
| `CloseWorkflow`  | `{{ user.profile.name }} closed {{ workflow.title }} on {{ E }}`    |

**Fields-update** (Part 24) reuses the action fallback, so it gets the entity clause for free.

## Current state

- `planEventDispatch.js` holds `DEFAULT_SIGNAL_TITLES`, `LIFECYCLE_TITLES`, `resolveActionSignalTitle` (the `submit` branch), and `ACTION_FALLBACK_TITLE` — plain Nunjucks strings composed over `{{ action.title }}` / `{{ workflow.title }}`, rendered by `renderEventDisplay` → `renderTree` → `parseNunjucks` and stored in `display.{app}.title`.
- The render context is `{ user, action, workflow, signal, status_before, status_after, submitted_form }` (action events) — no entity handle beyond `workflow.entity.{connection_id, id, ref_key}` (Part 59).
- `resolveEntityData(context, wfConfig, entityId)` (Part 26) already calls the host `entity.data` routine server-side **via `context.callApi`** on `wfConfig.entity.data_endpoint`, and returns `{ name, …host fields }` or `null`; the three read handlers (`GetWorkflowAction:239`, `GetWorkflowOverview:220`, `GetWorkflowActionGroupOverview:172`) use it to populate `entity_link.name` on their responses. This design reuses it unchanged on the write path.
- `StartWorkflow` builds the workflow doc's `entity` object (`StartWorkflow.js:172`) and is async with `context.callApi`. The other write handlers (`CancelWorkflow`, `CloseWorkflow`, `handleSubmit`/`SubmitWorkflowAction`) and each `runTrackerCascade` level also hold `context.callApi` and `workflowConfig` already.
- `EventsTimeline.js` sanitizes and HTML-renders both title (`:226`) and description (`:286`).

## Files changed

- `plugins/.../planners/planEventDispatch.js` — new `entityConfig` and `entityData` params; build `ctx.entity_ref` from them; rewrite the template maps + the `submit`/fallback branches; new pure phrase helper (colocated or in `shared/render/`).
- `plugins/.../StartWorkflow/StartWorkflow.js` — resolve `entityData` via `resolveEntityData` at the top of the handler; pass `entityData` + `entityConfig` into `planEventDispatch`. **No doc write** — nothing persisted.
- `plugins/.../CancelWorkflow`, `CloseWorkflow`, `SubmitWorkflowAction`/`handleSubmit` — resolve `entityData` at the top of the handler; thread it (with `entityConfig: workflowConfig.entity`) into `planSubmit`/`planFieldsUpdate` → `planEventDispatch`.
- `plugins/.../runTrackerCascade.js` + `planTrackerLevel.js` — resolve each level's `entityData` at the top of the per-level loop (its parent entity), thread into the level's `planEventDispatch` call.
- Pure planners (`planSubmit`, `planFieldsUpdate`, `planTrackerLevel`) gain an `entityData` pass-through input — same shape as their existing `user` input; no I/O added to the planners.
- Tests: `planEventDispatch.test.js` (anchor + label fallback + reworded verbs + `entityData` input), handler suites (resolve-once-per-event via `callApi`, fallback when `resolveEntityData` returns `null`).
- `docs/workflows/` events reference; demo assertions if any e2e checks event copy. No workflow-doc schema change.

## Non-goals

- **No re-resolution at read time** — the name is resolved once, at event write, and frozen into the rendered event HTML (point-in-time per event). The timeline does not re-resolve it when read: the title is stored HTML rendered via `dangerouslySetInnerHTML`, so there is no live `Link` on this path (see the constraint under "Build the phrase …").
- **No new override channel** — the existing three-source `event_overrides[signal]` chain already lets apps rewrite any title, including the entity clause.
- **No client-side routing on the anchor** — a plain `<a href>` full navigation is fine for an audit link.
- **No `basePath` handling** — the href is a root-relative literal; host apps are assumed to serve at the domain root with the entity page not being the home page (see the constraint under "Build the phrase …"). Not built for speculatively.
- **No persisted `entity.name` on the workflow doc** — the name is resolved per event, not stored, so there is no field to add, populate, or backfill (a snapshot-at-Start approach would have needed all three; see the decision above).
- **No denormalization of `page_id`/`id_query_key`/`title` onto the doc** — those stay in config and ride in via `entityConfig`.

## Related

- Part 53 (`_completed/53-titles`) — the curated verb-template design this extends.
- Part 26 (`_completed/26-entity-data-contract`) — the `entity.data` routine and `resolveEntityData` this reuses.
- Part 57 / 59 — the `entity` config block and document pointer this reads.
- Part 50 (`_completed/50-unified-events-timeline`) — the cross-entity timeline where the entity link is most valuable.
- Part 33 (`_completed/33-comment-rendering`) — the comment-HTML path, a _contrasting_ approach (fold-after-render, never through the compile); not a precedent for this design's `| safe`-value technique.
