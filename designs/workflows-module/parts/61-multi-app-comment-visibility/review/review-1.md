# Review 1

Reviewed against the live engine source (`planEventDispatch.js`, `planSubmit.js`,
`planFieldsUpdate.js`, `foldCommentIntoEvent.js`, `mergeEventOverrides.js`,
`UpdateActionFields.js`, `makeWorkflowApis.js`, `WorkflowAPI/schema.js`) and the
module's comment surfaces. The core idea — fan the comment into every bucket the
event already has, reusing the title-bucket visibility gate rather than inventing
a registry — is sound and matches how `mergeEventOverrides` already adds per-app
buckets. The line references (`makeWorkflowApis.js:127,183`,
`planEventDispatch.js:149,295`) are accurate. Findings below are about
completeness and one server-side enforcement gap.

## Correctness / security

### 1. The connection flag is never enforced server-side, so a crafted `internal` payload re-silos the very comments this part exists to un-silo

The design adds `enable_internal_comments` to the connection schema
(`WorkflowAPI/schema.js`) and states (D2) that "single-app and customer apps
leave it off and every comment is `shared`." But nothing in the engine reads that
connection property — the fold decision is driven **entirely** by the
client-supplied `comment_visibility` payload key. `enable_internal_comments` is
used only to gate the _UI_.

Consequence: in a multi-app deployment, a customer-portal app with the flag
**off** still has a live `comment_visibility` payload mapping
(`makeWorkflowApis.js` submit endpoint). A client that posts
`comment_visibility: "internal"` — by crafting the request, not through the UI —
gets the `internal` single-bucket fold: the comment lands only in the customer
app's bucket and the team never sees it. That is exactly the silo bug Part 61
sets out to fix, reintroduced through a payload the UI doesn't expose but the
endpoint still honours.

The design half-acknowledges this in the Wire section ("the engine never trusts
the client for _who_ sees what beyond this flag") but then only defends against
_garbage_ values (→ `shared`), not against a _valid_ `internal` from an app that
never enabled internal comments.

**This also resolves the question of whether the schema property is dead.** As
written, `enable_internal_comments` on the connection is consumed by nobody on
the server. Either:

- **(preferred) Enforce it in the engine.** `planEventDispatch` already receives
  `connection` (`planEventDispatch.js:145,149`), so `foldCommentIntoEvent` can be
  passed `connection.enable_internal_comments` and coerce
  `internal → shared` when the flag is false. This makes the connection property
  meaningful, closes the crafted-payload hole, and makes "customer apps → always
  shared" a server guarantee rather than a UI convention — the "one correct way"
  posture this codebase prefers. The page still reads the **module var** for UI
  gating (see #3).
- **(otherwise) Drop the connection property** as unused surface and document
  that visibility is UI-gated only — but that leaves the silo hole open, so this
  is the weaker option.

## Completeness — file/surface inventory

### 2. The Part 24 thread is mis-routed: `UpdateActionFields.js` has no `planEventDispatch` call; `planFieldsUpdate.js` is the missing changed file

> **Resolved (auto).** Confirmed against source: `UpdateActionFields.js:54` calls `planFieldsUpdate`, and `planFieldsUpdate.js:85` calls `planEventDispatch`. Added `planFieldsUpdate.js` to the changed-files list (new `comment_visibility` param → its `planEventDispatch` call) and reworded the `UpdateActionFields.js` bullet to read `params.comment_visibility` and pass it into `planFieldsUpdate`, not `planEventDispatch`.

The "Files changed" list says: "`UpdateActionFields.js` (Part 24 path) — thread
`comment_visibility` through to its `planEventDispatch` call." But
`UpdateActionFields.js` does **not** call `planEventDispatch` — it calls
`planFieldsUpdate` (`UpdateActionFields.js:54`), and `planFieldsUpdate` is the
planner that calls `planEventDispatch` (`planFieldsUpdate.js`, the `event = planEventDispatch({...})` block).

So the actual thread is three hops:
`UpdateActionFields.js` (read `params.comment_visibility`) → `planFieldsUpdate`
(new `comment_visibility` param, beside the existing `comment`) →
`planEventDispatch`. **`planFieldsUpdate.js` must be added to the changed-files
list**, and the `UpdateActionFields.js` bullet reworded — as written, an
implementer following the list literally would look for a `planEventDispatch`
call in `UpdateActionFields.js` that isn't there.

### 3. The comment-surface inventory is materially incomplete — it lists 3 surfaces; at least 8 post a comment, and the Part 24 surface (which the design explicitly wires) is omitted

The design's surface list is `check-action-surface.yaml`, `review.yaml.njk`, and
"`edit.yaml.njk` / wherever a submit comment is captured." A grep for comment
payloads across the module shows the control would actually be needed in:

- `components/check-action-surface.yaml` ✓ (listed)
- `templates/review.yaml.njk` ✓ (listed)
- `templates/edit.yaml.njk` ✓ (listed)
- `templates/action.yaml.njk` — check/custom-kind full action page; posts
  `current_action.comment` + a request-changes modal comment (`action.yaml.njk:251`)
- `templates/view.yaml.njk` — request-changes modal `change_request_comment`
  (`view.yaml.njk:343`)
- `templates/error.yaml.njk` — recovery comment + request-changes comment
  (`error.yaml.njk:350,438`)
- `components/check-action-modal.yaml` — wraps the check surface comment paths
- `components/universal-fields/universal-fields.yaml` — the **Part 24
  update-fields** comment (`universal-fields.yaml:175`)

The omission of the universal-fields surface is the sharpest: finding #2 wires
`comment_visibility` all the way through the update-fields endpoint and planner,
yet no UI surface in the design sends it — so the Part 24 path would accept the
key but never receive it. The `action.yaml.njk` / `error.yaml.njk` omissions mean
check/custom-kind action _pages_ (as opposed to the modal) get no control even
though they post `request_changes` comments.

A missing control isn't dangerous (those comments default to `shared`, the safe
value), but it makes the "writer chooses, wherever the choice is offered"
guarantee patchy: a team user can mark a comment internal from the check modal
but not from the full action page, the error page, or the universal-fields modal.
The design's own remedy — extract one shared "comment input + visibility control"
fragment `_ref`'d by every surface — is the right call; the inventory it feeds
just needs to be complete (or the design must state which surfaces deliberately
get no control, and why).

## Clarity

### 4. D2's "readable by the page because it is the app's own connection var" is mechanically inaccurate

Lowdefy connection config is server-side; a page block cannot read a connection
property at runtime. The actual page-readable mechanism is the **module var**:
surfaces gate on `_module.var: enable_internal_comments` at build time, exactly as
`app_name` is wired (`module.lowdefy.yaml` documents `app_name` as "Apps wire this
from `_module.var: app_name`", and `components/*.yaml` already read other flags via
`_module.var`). The Files-changed note ("the module var the host wires it from")
is correct; D2's prose rests on a false premise. Reword D2 to say the page reads
the module var (the host wires the same var onto the connection for the engine —
which, per #1, the engine should actually consume). This is wording, not a design
flaw, but the rationale currently leans on a capability that doesn't exist.

### 5. Specify the toggle's default and control type so "absent → shared" actually holds

The wire shape is `comment_visibility: { _state: <toggle-state> }`. For the
default-shared guarantee to hold when the control _is_ shown, the toggle's initial
state must resolve to `shared` (or be unset → `_state` yields `undefined` → engine
treats as `shared`). Worth pinning down in the design: control type (a Switch
where on = `internal` makes the default-off = `shared` mapping fall out naturally),
its reset on modal close (the surfaces already reset `current_action.comment` to
null on `onClose` — the visibility toggle needs the same reset), and the explicit
fold predicate (`visibility === 'internal'` ⇒ single bucket; **everything else**,
including `undefined`/garbage, ⇒ `shared`). The last point matches the "garbage →
safe default" intent but should be stated as `=== 'internal'`, not `=== 'shared'`.
