# Review 1 — Reconciliation scope, visibility mechanism, and the new `view` bar

Reviewed against the four shipped templates (`modules/workflows/templates/*.yaml.njk`),
the FSM tables in [state-machine](../../../../workflows-module-concept/state-machine/design.md),
the role-check primitive (`modules/workflows/components/action_role_check.yaml`), and the
current state of the [ui](../../../../workflows-module-concept/ui/design.md) /
[submit-pipeline](../../../../workflows-module-concept/submit-pipeline/design.md) concept docs.

The signal-vocabulary mapping is sound: I verified the proposed `button_signal_sources.yaml`
(design §D3, lines 126–134) against the form FSM table (state-machine §"Form kind", lines
131–140) cell-by-cell — every source list matches the stages where `formTable[stage][signal]`
is defined. The guard-test derivation is correct.

The findings below are about scope accuracy, the visibility *mechanism*, and gaps in the
one net-new surface (`view`'s bar).

## Correctness / accuracy

### 1. The concept-doc reconciliation is largely already done; the design's read of it is stale

> **Resolved.** Verified against the live docs — `ui` D2's button table is already keyed on `signal`, D4 is about the four event verbs (untouched), D7 already documents the removed selector, and `submit-pipeline` D3 is already "Per-template button bars over the signal namespace" with the interaction→target-status table gone. Cut the reconciliation section hard to its sole residual — add a `view` / `request_changes` row to `ui` D2's button table — and fixed the four stale mentions (intro, Proposed change #5, Current state, Files-changed → Concept docs). The `progress`-row column fix is tracked under #2.

This is the headline issue. The design's "Current state" (line 33) and the "Concept-doc
reconciliation" table (lines 175–180) describe the `ui` doc as still in the old interaction
model. It is not — it was already reconciled (state-machine §345's 2026-05 note states
explicitly: "ui `simple-edit` … all reflect this model"). Concretely:

- **`ui` Decision 2** is already on signals. Its button table (`ui/design.md:121–128`) header
  is already `` `signal` value ``, already lists `submit`/`progress`/`not_required`/
  `request_changes` rows, and already FSM-references the target column. The block-tree sketch
  (`ui/design.md:134–158`) already emits `signal: submit`. There is **no `interaction` column
  to replace** and **no `submit_edit → submit` rename to do**. The only genuine change left is
  *adding* the `view` `request_changes` row (and `view` is absent from the table today). The
  reconciliation row as written would have an implementer hunt for prose that isn't there.
- **`ui` Decision 7** (`ui/design.md:405–416`) is already titled "Signal buttons on
  `simple-edit` (no status selector)" and already describes the selector as removed and the
  signal buttons in its place. The design's instruction (line 179) to "mark it superseded …
  the selector is removed, not rebuilt" describes work that is **already complete**. Nothing
  to do here.
- **`ui` Decision 4 "Why fixed names"** (`ui/design.md:350–358`) is about the **four event
  verbs** (`onMount`/`onSubmit`/`onApprove`/`onRequestChanges`), not an "interaction
  vocabulary." The design's row (line 178) says it "frames the interaction vocabulary as the
  locked thing" — it doesn't. D5 of this design even says the event verbs are untouched, so
  this row likely has no real work.
- **`submit-pipeline` Decision 3** (`submit-pipeline/design.md:140`) is already titled
  "Per-template button bars over the signal namespace" and already emits `signal: submit`
  (line 153). The top-note supersession is already in place. Re-verify what residual old
  sub-table actually remains before claiming "the button-bar body still reads in the old
  model" (line 33).

**Fix:** Re-scope the reconciliation section to what's actually left after the
`workflows-module-concept` reconciliation commit. As far as I can tell that is: (a) add a
`view` / `request_changes` row to the `ui` D2 table, and (b) nothing in D4/D7. Confirm
against the docs rather than the design's recollection of them. As written, the section claims
credit for work that's done and would send an implementer chasing absent prose.

### 2. `progress` event-verb behaviour contradicts the (reconciled) `ui` doc

> **Resolved** (resolution reversed from the review's suggestion). Rather than make `progress` fire nothing (the review's preferred read of D2), the design now gives it its own author verb **`onProgress`** — symmetric with `submit`/`onSubmit`, since a draft save is a distinct semantic and would otherwise be the one silent button. D2 and D5 rewritten (D5 retitled "add `onProgress`", vocabulary grows four→five); the prior YAGNI Out-of-scope item removed. This adds reconciliation edits on top of #1: `ui` D2's `progress`-row handler → `onProgress`, and `ui` D4's locked verb list four→five.

Design D2 (lines 113, 169) states `progress` fires **no** author verb — "No author event
verb. `progress` does not fire `onSubmit`." But `ui/design.md:124` lists the `progress` row's
"Author event handler fired" as **`onSubmit`**. These disagree.

This is a real design decision to make (I think D2's "no verb" is the better call — a draft
save firing the submit-payload builder is surprising), but it's also a *reconciliation item
the design missed*: if D2 stands, the `ui` D2 table's `progress` row must change from `onSubmit`
to "—". Add it to the reconciliation list and resolve the contradiction.

### 3. `view`'s Edit-nav button will bounce off a `done` action unless it sets `skip_status_redirect`

> **Resolved.** D4's Edit-nav bullet now specifies `input: { skip_status_redirect: true }`, mirroring `review.yaml.njk:223–224`, and notes this is what makes the `done` re-open path (and e2e test (c)) reachable. Verified the guard (`edit.yaml.njk:63–82`) excludes `done`.

D4 (line 160) specifies the Edit button as "a `Link` to `page_ids.edit` … Pure navigation."
But `edit.yaml.njk`'s stale-URL guard (lines 63–82) redirects to `-view` for any stage **not**
in `[action-required, in-progress, changes-required]` — and `done` is not in that list. The
only escape hatch is `_input: skip_status_redirect = true`, which `review.yaml.njk`'s Edit-link
sets explicitly (`review.yaml.njk:223–224`, with the rationale comment at lines 9–12).

`view` is the default landing for `done`. So a `view`→Edit click on a `done` action will load
`edit`, hit the guard, and bounce **straight back to `view`** — a dead button — unless `view`'s
Edit-link also sets `input: { skip_status_redirect: true }`.

This directly undercuts D4's own claim (line 165) that "the main re-open path (re-edit a `done`
action) is already covered by `submit` from `done` on the edit page" and the e2e test (c)
(line 218: "`submit` from `done` on the edit page re-opens to `in-review`"): that path is
**unreachable from the UI** without the skip flag. **Fix:** D4 must specify that `view`'s
Edit-nav button sets `input: { skip_status_redirect: true }`, mirroring `review.yaml.njk`.

## Mechanism

### 4. Runtime `_global: workflow_button_sources` is the wrong tool — the module has no global-enum wiring, and this data is build-time

> **Resolved.** Verified zero real `_global` enum wiring in the module (only a README example) and that the module already does build-time enum lookups via `_ref` (`edit.yaml.njk:276`). D3's mechanism rewritten to build-time `_ref` + `key`; both code samples (D2 `button_progress`, D3 `visible`) updated; the "Global wiring" Files-changed row deleted and the enum row corrected; the two Simple-actions references re-pointed at `button_signal_sources.yaml` via `_ref`. Added an explicit "Build-time list, runtime test" note: the source list resolves at build via `_ref`, but the membership test stays runtime `_array.includes` because pages are generated per action *type* and the loaded action's stage is only known at runtime (can't be `_build.array.includes`).

D3 (lines 123, 144–148) and the Files-changed table (lines 212–213) load
`button_signal_sources.yaml` into `global.workflow_button_sources` and read it at runtime via
`_global: workflow_button_sources.X`. Two problems:

- **No such convention exists in this module.** There is **zero** `_global` usage anywhere
  under `modules/workflows/`, and nothing wires an enum into `global`. The design's "Global
  wiring — same enums-into-global convention used elsewhere" (line 213) points at a convention
  that isn't present. (The CLAUDE.md `_global: enums.X` convention is for app-level global
  config populated by the *app*, not a mechanism a module can rely on.) So "load it into
  global" is an unspecified new wiring step, not a reuse.
- **The data is fully static at build time.** Source-stage lists are constants; `makeActionPages`
  renders these templates per action at build time. The module **already** consumes an enum at
  build time via `_ref` for exactly this kind of lookup — see the `not_required` priority hack
  this design replaces (`edit.yaml.njk:274–278`, `statuses: { _ref: enums/action_statuses.yaml }`).

**Fix:** Match the module's existing pattern — inline the source list with a build-time `_ref`
+ `key`, dropping the runtime `_global` dependency and the "Global wiring" row entirely:

```yaml
- _array.includes:
    - _ref: { path: enums/button_signal_sources.yaml, key: submit }
    - _state: action.status.0.stage
```

This is strictly simpler ("one correct way": no runtime global to populate, no wiring step to
get wrong) and keeps the visibility data co-located with the FSM-guard test that reads the same
file. If there's a deliberate reason to prefer runtime `_global` (e.g. the simple sibling pages
are static and can't `_ref` the module enum at build time — though they can), state it; right
now the design asserts a convention that doesn't exist.

### 5. The blanket "author opt-out (default true)" flips `not_required` from opt-in to opt-out

> **Resolved.** D3 now specifies per-button opt-out defaults — `true` for `submit`/`progress`, `false` for `not_required` — and the `edit.yaml.njk` Files-changed row flags "keep `not_required` at `default: false`." Verified `edit.yaml.njk:268` and `ui` D2's "(opt-in)" annotation.

D3 (line 138) describes the author opt-out as "default true" and the generic example uses
`default: true`. Applied uniformly, this changes `not_required`'s visibility default. Today it
is **opt-in**: `page_config.buttons.not_required.visible` defaults to **`false`**
(`edit.yaml.njk:268`), and `ui/design.md:125` explicitly annotates the row "(opt-in)". Under a
blanket `default: true`, "Mark Not Required" would render by default on every form edit page
(gated only by source-stage + role).

**Fix:** Specify the per-button opt-out defaults rather than a blanket value. Preserve
`not_required` at `default: false` (opt-in) to match current behaviour and `ui` D2; `submit` /
`progress` stay `default: true`. Note this in the `edit.yaml.njk` Files-changed row so the
rewrite doesn't silently flip it.

## Access gating

### 6. `view`'s `request_changes` cannot be review-verb-gated with the current primitive, and `view` has no stage guard

> **Resolved** via option (a) + a reframing the review didn't surface. The button stays, gated by the **coarse `action_allowed`** like every other template button — the "reviewers only" framing is dropped, not implemented. The concrete justification is the **no-`review`-verb** config: such an action ships no review page, so `view` is the *only* surface to send it back (`done → changes-required`), and with no review verb there's no reviewer subset to gate on — coarse gating is correct, not a compromise. The button is also made **opt-in** (`visible` default `false`), so it's off unless the author wants it. The `in-review` stage overlap is **accepted** (FSM-legal; author hides it if unwanted) — no per-template stage narrowing, preserving the single shared source map. Verb-scoped gating (option b) is explicitly not built. Reconciliation added for `state-machine` line ~235 and `ui` D2 (drop "reviewers only"). Also added to D3: a full per-button-instance opt-out defaults table and the rule that `visible`/`disabled` accept an operator expression (AND'd with the gates → restrict-only), with a pass-through requirement on `makeActionPages`/the Part 36 validator.

state-machine §235 and `ui` D2 specify that `request_changes` on `view` "surfaces only to users
with `review` access, not to plain viewers." But the role primitive the templates use,
`action_role_check.yaml`, computes a **single coarse `action_allowed`** from `access.roles`
(lines 4–29) — it takes **no verb argument** and is not per-verb. (`ui/design.md:279` *describes*
it as "verb-map + role-gate," but the shipped component is role-gate only — a pre-existing
doc/impl gap.) So a `view`-bar `request_changes` gated on `action_allowed` will show to *anyone
with action access*, not just reviewers.

Compounding it: `view.yaml.njk` has **no stale-URL guard** (line 67: "Step 3 … intentionally
omitted on view"), so `view` renders for *any* stage. With `request_changes`'s source list
`[in-review, done]`, the button would also appear on `view` for an `in-review` action —
duplicating the `review` page's button.

**Fix:** D4 should either (a) acknowledge that, with today's primitive, `view`'s
`request_changes` is gated by the coarse `action_allowed` (same as every other template button)
and accept it shows to all action-access users — and drop the "only reviewers" framing from the
reconciled `ui`/state-machine prose; or (b) introduce verb-scoped gating, which is net-new work
this design doesn't currently scope. Decide explicitly; don't leave the gate ambiguous.

## Minor

### 7. Guard-test placement inverts the package dependency direction

> **Resolved.** Verified the module has its own Jest suite (`resolvers/*.test.js`) and declares the plugin as a dependency (`module.lowdefy.yaml` `plugins:` → `@lowdefy/modules-mongodb-plugins`). Moved the guard to the module's test suite (alongside `makeActionPages.test.js`), importing the FSM table from the plugin package — natural module→plugin direction. Added the one consequent contract: Part 38 must export the `form` table from the plugin's public API (currently plugin-internal); noted in D3 and the Tests section.

D3 (lines 154, "Guard test placement") puts the enum/FSM guard **in the plugin**, reading the
**module's** `enums/button_signal_sources.yaml`. The module depends on the plugin (it declares
`plugins:` in its manifest), so a plugin test reaching up into a sibling module's source files
is a reverse coupling — the plugin package shouldn't know module file paths.

**Fix:** Put the guard in the **module's** own test suite (the module already has Jest —
`modules/workflows/resolvers/makeActionPages.test.js`), importing the FSM table from the
published plugin package. That follows the natural module→plugin dependency direction and keeps
the test next to the enum it guards. The design's rationale for plugin placement ("sibling to
Part 38's `tables.test.js`") is convenience, not correctness.

### 8. `error.yaml.njk` payload carries unset `form_review` / `fields` (pre-existing, but the rewrite touches this block)

> **Resolved.** The `error.yaml.njk` Files-changed row now says to drop the dead `form_review` payload key while rewriting the `CallAPI` payload (the page primes only `form`/`fields`/`comment`).

`error.yaml.njk`'s `submit_resolve_error` payload includes `form_review: { _state: form_review }`
(lines 291–292), but the error page never primes `form_review` state (`prime_form_state`, lines
87–102, sets only `form`/`fields`/`comment`). This is pre-existing, but since the design's
`error.yaml.njk` row (line 210) rewrites this exact `CallAPI`'s payload field, it's the natural
moment to drop the dead `form_review` key. Optional, but cheap while you're in the block.
