# Part 61 — Multi-app comment visibility (shared vs internal)

Workflow comments today are written into a single app's view of an event — whichever app the action was submitted through — so in a multi-app deployment (e.g. a team app + a customer portal sharing one workflow) a comment is invisible to every other app. That silos comments in both directions: a customer's comment never reaches the team, and a team note never reaches the customer. This part makes a comment **visible to all of the workflow's apps by default**, with an explicit **internal** option for notes that should stay within the app that wrote them.

## Proposed change

1. **A comment carries a visibility: `shared` (default) or `internal`.** `shared` means every app that already sees the event also sees the comment; `internal` means only the app that wrote it does.
2. **Shared is implemented by writing the comment into every app bucket the event already has.** An event's `display` carries one bucket per app that the author has given a title for (the submitting app's default title + any per-app title overrides). The comment fold writes the comment into **all** of those buckets for `shared`, and into **only the submitting app's** bucket for `internal`. No project-wide app registry is needed — the buckets on the event _are_ the set of apps that see it.
3. **The read side is unchanged.** Every timeline (and the Part 56 changes-requested callout) still reads `event.{app_name}.description`. Visibility is decided entirely at write time by which buckets receive the comment.
4. **The writer chooses per comment, where the choice is offered.** A small shared/internal control sits beside the comment input; it defaults to `shared`. Because a single app deployment has no "other app" to share with or hide from, the control is **opt-in per app** via a connection flag — apps that need the distinction (the internal/team app) enable it; single-app and customer-facing apps leave it off and every comment is simply `shared`.
5. **One chokepoint, both comment paths.** The fan-out lives in the single `foldCommentIntoEvent` helper that both the submit pipeline and Part 24's `UpdateActionFields` already route through (Part 33 D3), so the two cannot drift.

## Background — how it works today

- A comment is the whole TipTap value `{ html, text, fileList } | null`, posted under the `comment` payload key from every surface and mapped onto the engine handlers by `makeWorkflowApis` (`makeWorkflowApis.js:127,183`).
- `foldCommentIntoEvent(eventPayload, comment, appName)` writes `comment.html` into `display[appName].description` for a **single** `appName` — `connection.app_name` of the app that processed the submit (`planEventDispatch.js:149,295`). Part 33 reserved the `description` slot for the comment (comment-only, single writer); titles are the author-overridable, per-app channel.
- The events module's `new-event` Api spreads `display` onto the top level of the stored event doc (`modules/events/api/new-event.yaml`), so at rest an event is `{ _id, type, date, created, metadata, {app_name}: { title, description? }, …references }`.
- A timeline shows an event for an app **only if that app has a bucket on the event** (`{ [app_name]: { $ne: null } }`, `GetEventsTimeline.js:67`; same guard in `events-timeline.yaml`) and reads `event.{app_name}.{title,description}` (`GetEventsTimeline.js:203-204`).
- Each app's workflow connection knows **only its own** `app_name` (`WorkflowAPI/schema.js:108`). There is no list of the other apps anywhere in the config — which is exactly why the design works off the event's own buckets rather than a registry.

## Key decisions

### D1 — Shared writes to every bucket; the title is the visibility indicator

A comment is attached to an event, and an event is visible to an app **iff that app has a title bucket on it** (today's gate, author-controlled). So "shared with every app that sees this event" is implemented by writing the comment's `description` into **every bucket present on the rendered display** — i.e. the submitting app's default-title bucket plus any per-app title overrides the author wrote. `internal` writes into only the submitting app's bucket (`connection.app_name`).

This reuses the existing visibility mechanism instead of inventing a parallel one:

- **No fallback title, no neutral slot, no read-time merge.** The two timeline sources and the Part 56 callout keep reading `event.{app_name}.description` verbatim.
- **No app registry.** The engine never needs to enumerate "all apps" — it iterates the buckets already on the event it is writing.
- **The two gates compose.** Title-bucket existence decides whether an app sees the _event_; `shared`/`internal` decides whether the _comment text_ rides along. Worked example: the team requests changes, marks the note **internal**, and the author has given the customer a title override for that event. The customer sees the event ("Quote returned for revision") but not the comment — each gate doing its own job.

**Consequence (documented, not a gap):** `shared` reaches "every app that already sees the event," not literally every deployed app. For a shared comment to reach an app that isn't the submitter, that app must have a title for the event — i.e. the author wired a per-app title override for that signal (which they do anyway to surface the event in that app). This is the intended meaning of shared, and it fixes the real bug — comments now travel wherever events travel — without new title machinery.

### D2 — Author-time enablement, writer-time choice

Two facts force the split:

- Only the writer knows, per comment, whether a given note is for everyone or internal (the same review step often carries both kinds — "please update your address" vs "margin's too thin, flag finance"). So the **per-comment** choice belongs to the **writer**, not a per-action config setting.
- But the comment surface is a page block that **cannot detect** whether the deployment is multi-app (no registry; the connection knows only itself). Showing a shared/internal toggle in a single-app deployment is meaningless ("internal to whom?"), and showing it to customer-portal users invites mistakes.

So the control is **enabled per app** by a connection flag (`enable_internal_comments`, default `false`), and _when enabled_ the writer makes the per-comment call. This maps cleanly onto reality: the internal/team app sets the flag and its users get the choice; single-app and customer apps leave it off and every comment is `shared` (the default). The flag is the app's own knowledge ("I am an app that sometimes needs to keep a comment off other apps"), readable by the page because it is the app's own connection var — no registry needed.

`shared` is always the default audience whether or not the control is shown, so an app with the flag off behaves as "every comment shared" with zero UI.

### D3 — Default flips from single-bucket to shared; this is the fix, not a regression

Today every comment lands in one bucket (the submitter's). After this part the default is `shared`. The behaviour change is the point — comments stop being accidentally siloed. Scope of impact:

- **Single-app deployments (the common case):** the event has exactly one bucket, so `shared` and the old single-bucket behaviour are identical. No change.
- **Multi-app deployments:** a default comment now also lands in any _other_ app bucket the event already has (i.e. apps the author gave a title override). If a deployment relied on comments staying in the submitter's bucket while _also_ authoring cross-app title overrides, those comments would now surface in the other app — the writer marks them `internal` to restore that. This is a narrow, deliberate case; it is called out in Verification.

No backfill of historical events (consistent with Part 33's migration stance) — old events keep their single-bucket comments; only new comments fan out.

### D4 — `internal` is the existing behaviour, kept as the opt-out

`internal` is _exactly_ what the engine does today: write the comment into the submitting app's bucket only. So the `internal` path needs no new write logic — it is the unchanged single-bucket fold. Only the `shared` path (the new default) adds the fan-out across buckets. This keeps the change small and means the riskier path (multi-write) is the one under the most test focus.

### D5 — Two-tier audience only (`shared` | `internal`)

Visibility is a closed two-value choice, not an arbitrary per-app audience set. The concrete need is "everyone vs. keep-it-in-this-app." A richer model ("these two apps but not that one") is speculative — no workflow today has 3+ apps with a partial-audience need — and would require the app registry this design is built to avoid. If that need ever surfaces with a real caller, the `comment_visibility` field can grow from a two-value enum into an explicit bucket list then; until then, two tiers.

## Wire & config shape

**Connection var (per app, opt-in control):**

```yaml
# connections/workflow-api.yaml (host app wires from a module var)
enable_internal_comments: true # default false; when true the comment surfaces show the shared/internal control
```

**Comment payload (unchanged shape, one new sibling key):**

```yaml
# every comment-posting surface
payload:
  comment: { _state: <comment-state-path> } # { html, text, fileList } — unchanged
  comment_visibility: { _state: <toggle-state> } # "shared" (default) | "internal" — NEW
```

`comment_visibility` is optional; absent or unrecognised → `shared`. The engine never trusts the client for _who_ sees what beyond this flag — `shared` fans out only to buckets the author already created, and `internal` is the submitter's own bucket, so a malicious/garbage value can at worst fall back to the safe-for-collaboration default.

## Files changed

### Plugin — `plugins/modules-mongodb-plugins/src/connections/`

- **`shared/phases/planners/foldCommentIntoEvent.js`** — add a `visibility` argument (`'shared' | 'internal'`, default `'shared'`). The emptiness gate is unchanged. On a non-empty comment: `internal` → write `display[appName].description = comment.html` (today's behaviour); `shared` → write `comment.html` into the `description` of **every** key present on `display` (each app bucket the rendered event already has). The helper still runs **after** render and the override merge (Part 33 D4), so all title buckets exist to write into. Pure; still the single call site.
- **`shared/phases/planners/planEventDispatch.js`** — accept `comment_visibility` and pass it to `foldCommentIntoEvent`. No other change (type/title/metadata logic untouched; description stays comment-only).
- **`shared/phases/planSubmit.js`** — thread `comment_visibility: params.comment_visibility` into the `planEventDispatch` call beside the existing `comment`.
- **`WorkflowAPI/UpdateActionFields/UpdateActionFields.js`** (Part 24 path) — thread `comment_visibility` through to its `planEventDispatch` call, so a fields-update comment honours the same choice via the same fold. No new logic.
- **`WorkflowAPI/schema.js`** — add the optional `enable_internal_comments` connection property (boolean, default false; doc: "When true, comment surfaces in this app offer a shared/internal visibility control; comments default to shared regardless.").

### Module — `modules/workflows/`

- **`resolvers/makeWorkflowApis.js`** — add `comment_visibility: { _payload: "comment_visibility" }` to the submit endpoint properties (`:127`) and the update-fields endpoint properties (`:183`), beside the existing `comment` mapping.
- **Comment surfaces** — add the shared/internal control next to each comment `TiptapInput`, shown only when `enable_internal_comments` is set, posting `comment_visibility`:
  - `components/check-action-surface.yaml` — the optional surface comment and the Request Changes modal comment.
  - `templates/review.yaml.njk` — the Request Changes modal's `change_request_comment`.
  - the regular form-submit comment surface (`templates/edit.yaml.njk` / wherever a submit comment is captured).
    To avoid a 4-way drift (one-correct-way), extract a **single shared "comment input + visibility control" fragment** that all surfaces `_ref`, parameterised by state path and the gating flag — rather than copying the control into each surface.
- **`module.lowdefy.yaml`** — document the `enable_internal_comments` connection var (and the module var the host wires it from).

### Read side — explicitly unchanged

`GetEventsTimeline.js`, `modules/events/connections/events-timeline.yaml`, the `EventsTimeline` block, and the Part 56 changes-requested callout all keep reading `event.{app_name}.description`. No read-side file changes.

## Verification

- **Unit (`foldCommentIntoEvent`):** with `internal`, writes only the submitting app's bucket; with `shared` (and default-when-absent), writes the comment into every bucket on a multi-bucket display; no-ops on empty comments regardless of visibility; never touches `title`.
- **Unit (`planEventDispatch` / `planSubmit`):** `comment_visibility` flows from params to the fold; absent → `shared`.
- **Integration (multi-app demo):** an event with team + customer title buckets — a `shared` `request_changes` comment renders in both timelines; an `internal` one renders only in the submitting app's timeline; the event title still renders per-app in both cases.
- **Integration (single-app):** `shared` and `internal` produce identical output (one bucket); control hidden when `enable_internal_comments` is unset; comments default to shared.
- **Behaviour-change guard (D3):** a multi-app event that previously relied on single-bucket comments now surfaces a default (shared) comment in the other titled app; marking it `internal` restores submitter-only visibility.
- **Part 56 callout:** the changes-requested callout reads the comment unchanged via `event.{calling app_name}.description`; an `internal` team note does not appear for the customer app, a `shared` one does (where the customer has a title for the event).

## Non-goals

- **Arbitrary per-app audience sets** (D5) — two tiers only until a concrete 3+-app partial-audience need appears.
- **A project-wide app registry** — deliberately avoided; the design works off each event's own buckets.
- **Backfilling historical comments** — old single-bucket events are left as-is.
- **Per-role comment redaction within an app** — the meaningful boundary is the app; within an app the timeline already shows comments to all roles, so gating the comment by role would be inconsistent. Out of scope.
- **Editing/deleting comments after the fact** — events remain immutable (Part 33 non-goal, unchanged).

## Relates to

- **Part 33 — comment rendering** (shipped) — establishes the single `foldCommentIntoEvent` chokepoint, the comment-only `description` slot, and the per-app `display` model this part extends. This part changes _which_ buckets the fold writes; everything else Part 33 decided stands.
- **Part 56 addendum — action-page layout** — the changes-requested callout is the first consumer that makes single-app-keying visibly wrong on a page; it reads the comment unchanged and inherits the corrected visibility.
- **Part 24 — universal fields** (shipped) — `UpdateActionFields` shares the fold, so fields-update comments honour the same choice with no extra wiring.
