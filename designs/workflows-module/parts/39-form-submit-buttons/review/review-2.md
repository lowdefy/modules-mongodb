# Review 2 — The `fields`-drop rationale vs. Part 24/38, and the modal-payload blind spot

Reviewed the **current** design (post review-1 resolutions) against the shipped templates
(`modules/workflows/templates/{edit,view,review,error}.yaml.njk`), the dependency designs
[Part 24](../../24-universal-fields/design.md) and [Part 38](../../_completed/38-engine-rebuild/design.md),
the form FSM table in [state-machine](../../../../workflows-module-concept/state-machine/design.md),
and the Lowdefy `_ref` build-time `key` mechanism.

Two prior-review findings re-confirmed as **sound, no further action**:

- **FSM source-stages map (D3, lines 132–138)** — re-verified cell-by-cell against the form
  FSM table (state-machine §"Form kind"). All six lists match the stages where
  `formTable[stage][signal]` is defined (`submit` includes `done`; `request_changes` is
  `[in-review, done]`; `not_required` spans the six non-terminal stages). The guard-test
  derivation is correct.
- **`_ref: { path, key }` build-time mechanism (D2/D3)** — verified against Lowdefy's build:
  `getKey.js` applies `get(input, refDef.key)` generically to any resolved ref content (path or
  module), called from `walker.js:700`, and `buildRefs.test.js:862` ("get key from referenced
  yaml file") covers exactly this. `_ref: { path: enums/button_signal_sources.yaml, key: progress }`
  resolving to the list at build time is valid.

The findings below are about the design's *stated rationale* for dropping `fields`, the
*scope* of that drop across the four templates, and a structural blind spot in every code
sample.

## Correctness / accuracy

### 1. The "load-bearing / would clobber" rationale for dropping `fields` contradicts Part 24 and Part 38 — the guard is **kind-based**, not payload-presence-based

> **Resolved.** Confirmed against Part 24:147 and Part 38:558 — the field-write guard is kind-based (writes universal fields only for `kind: simple`; never for `kind: form`), so a stray `fields` payload is ignored, not clobbering. Rewrote the "Why a dedicated part" paragraph (design.md:24): the `fields` drop is now framed as **hygiene** (no dead state, no spurious `^fields\.` validation), not a no-clobber correctness precondition, with explicit pointers to the kind-based guard. Also fixed the matching "so submit no longer clobbers them / depends on its no-clobber guard" wording in the Related → Part 24 entry. The change itself (dropping `fields`) is unchanged; only the rationale corrected.

This is the headline. D1 (line 24) and the "Why a dedicated part" prose justify dropping
`fields` from the `submit`/`progress` payloads as a **correctness precondition**:

> "Part 24's no-clobber guard in `planActionTransition.js` only `$set`s the fields when
> `payload.fields` is present, so an *absent* `fields` payload is what tells the engine
> 'leave them untouched.' … if submit kept sending `fields: { _state: fields }`, the guard's
> 'present' branch would fire and submit would overwrite whatever the sidebar last saved …
> defeating the decoupling."

Both of Part 39's dependencies describe the guard differently — and explicitly refute the
"presence" reading:

- **Part 24 design (line 147):** "The rule keys on the action's `kind` … **not** on the
  payload shape, so it cannot be defeated by a stray `fields` payload, and the form template
  dropping `fields` (Part 39) becomes **hygiene** … **rather than a correctness precondition**."
- **Part 38 design (line 558):** `planActionTransition.js` carries a *kind-agnostic generic
  passthrough*; Part 24 "layers a **kind-based rule** on top (write the universal fields only
  for `kind: simple`; `kind: form` owns them via its own operation)."

So for a `kind: form` action the planner **never** writes `assignees`/`due_date`/`description`,
regardless of whether `payload.fields` is present. A stale `fields` payload from form submit is
**ignored**, not clobbering. Part 39's premise — that an absent payload is what protects the
sidebar's writes — describes a guard that Part 24 deliberately engineered *not* to exist
(precisely so the protection can't depend on every caller remembering to omit the key —
CLAUDE.md "One correct way").

This matters beyond pedantry: a reviewer or implementer reading D1 will believe there is a
live clobber bug if `fields` is ever sent from a form page, and may "fix" review/error by the
wrong reasoning (or panic that simple-kind submit clobbers, which it correctly does not). The
real reason to drop `fields` is the one Part 24 names: **hygiene** — don't validate sidebar
inputs on submit, don't post dead state.

**Fix:** Rewrite D1's rationale (and the matching "Why a dedicated part" paragraph) to match
Part 24/38: the guard is kind-based; form submit never writes the universal fields; dropping
`fields` is hygiene (no dead payload, no spurious `^fields\.` validation), not a no-clobber
correctness requirement. Keep the change; correct the *why*.

### 2. The `fields` dead-payload drop is applied to `edit` only — `review` and `error` still send it

> **Resolved** via option (a). Extended the `fields` drop + `^fields\.` Validate-narrowing to `review` (`approve` both copies + `request_changes`) and `error` (`resolve_error` both copies), since both render the universal fields in display (read-only) mode (Part 24) — identical primed-then-resent dead state to `edit`. Updated both Files-changed rows with the exact regex narrowing (`review` → `[^form_review\.]`, `error` → `[^form\.]`) and a note that it spans both inline + modal copies; generalized the "Why a dedicated part" statement so the drop reads as uniform across all writable form templates rather than edit-only.

If the drop is hygiene (finding #1), it applies identically to **every** form-kind button that
posts the dead `fields` bag — but the design scopes it to `edit`'s `submit`/`progress` only. The
other two writable templates still carry it, and the design's Files-changed rows (lines 229–230)
are silent about it:

- **`review.yaml.njk`** — `submit_approve` payload sends `fields: { _state: fields }`
  (`review.yaml.njk:312–313` *and* the modal copy at `:426–427`); `submit_request_changes`
  likewise (`:351–352`). Both `Validate` steps include `^fields\.` (`:289–290`, `:403–404`).
  The page primes `_state.fields` in `prime_form_state` (`:100`), and renders universal-fields
  in **`display`** mode (`:125`) — per Part 24's page table (line 86) review is read-only for
  metadata. So that `fields` payload is purely primed-then-resent dead state, exactly like
  `edit`'s was.
- **`error.yaml.njk`** — `submit_resolve_error` sends `fields: { _state: fields }`
  (`:293–294` and modal copy `:352–353`), validates `^fields\.` (`:271`, `:330`), primes
  `_state.fields` (`:95`), renders universal-fields `display` mode (Part 24 table line 87).
  Same dead payload.

So the design leaves `review`/`error` posting (and validating) the same dead `fields` the
`edit` rewrite removes — an internal inconsistency. Under the kind-based guard none of these
clobber, so it's not a correctness bug; but the hygiene argument that motivates the `edit` drop
applies verbatim here.

**Fix:** Either (a) extend the `fields` drop + `^fields\.` Validate-narrowing to `review`'s
`approve`/`request_changes` and `error`'s `resolve_error` (recommended — uniform hygiene, one
rule), updating those Files-changed rows; or (b) state explicitly why `edit` is special and the
others deliberately keep posting dead `fields`. Right now it reads as an oversight.

## Completeness / implementation

### 3. Every modalable button has **two** payload copies — the design's samples and Files-changed rows address only one

> **Resolved.** Added a "Both payload copies migrate" note to D1: the sample is the `onClick` else-branch copy, every `.modal` button carries a second copy in the confirm-modal `onOk`, and all migration items (signal, `fields` drop, `form_review` drop, Validate narrowing) apply to both. Flagged it on the `edit` Files-changed row (`submit`/`not_required`); the `review`/`error` rows already carry the "both inline + modal copies" note from #2. `progress` has no modal (single copy), noted in D1.

In all four templates, a button whose `page_config.buttons.{name}.modal` is set renders its
`CallAPI` **twice**: once in the `onClick` `else` branch (modal not configured) and once in the
confirm-modal's `onOk` (modal configured). Each copy is a full, independent payload + `Validate`.
The design's D1/D2 code samples and the Files-changed table show only the `else`-branch copy, so
a literal implementer will migrate one and miss the other. Concretely:

| Template | Button | onClick payload | modal `onOk` payload |
| -------- | ------ | --------------- | -------------------- |
| `edit`   | `submit_edit`     | `:242–261` | `:362–381` |
| `edit`   | `not_required`    | `:310–327` | `:410–427` |
| `review` | `approve`         | `:294–313` | `:408–427` |
| `review` | `request_changes` | (modal-only — `:333–352`) | — |
| `error`  | `resolve_error`   | `:275–294` | `:334–353` |

Each migration item in this part — `interaction:` → `signal:`, dropping `fields`, dropping the
dead `form_review` key on `error` (review-1 #8), and narrowing the `Validate` regex to
`^form\.` / `^form_review\.` — must be applied to **both** copies wherever a `.modal` variant
exists. The `Validate` step is likewise duplicated (e.g. `edit` `:233–238` and `:353–358`;
`error` `:267–271` and `:326–330`).

**Fix:** Add a one-line note to D1 (and each affected Files-changed row) that buttons with a
`.modal` config carry the payload + `Validate` twice and both must be migrated. No structural
change — just so the rewrite doesn't migrate the inline path and leave the modal path on the
old `interaction:`/`fields:` shape. (`progress` has no modal, so D2 is unaffected.)

## Minor

### 4. The `form` FSM-table public export is a contract Part 38's design doesn't yet record

> **Resolved** — but ownership inverted from the review's suggestion. Rather than load the export contract onto the already-XL Part 38, **this part** adds the public export itself: a `./fsm` entry in the plugin package's `exports` map (`"./fsm": "./dist/connections/shared/fsm/tables.js"`), since Part 39's guard test is what needs it and Part 39 sequences with/after Part 38 (so `tables.js` exists). Verified the package uses an explicit `exports` map with no FSM entry today (only a `./*` catch-all → deep dist path, the coupling #7 avoided). Rewrote D3's guard-test placement, updated the Tests bullet, and added a `package.json` Files-changed row. Part 38's design is left untouched.

D3's guard test (line 177) and the Tests section import the `form` FSM table from the **plugin
package's public API**, and the design correctly flags this "adds a small export contract on
Part 38." But Part 38's design (line 569) only states that `tables.js` *exports* the tables at
the module level (`FSM_TABLES`, with `simple` aliased to `form`) — its files-changed does **not**
mention re-exporting them from the plugin package's `index` / public surface. As written, Part 38
could land with `tables.js` plugin-internal and Part 39's guard test would have nothing to
import without reaching a raw file path (the reverse-coupling review-1 #7 moved away from).

**Fix:** This is a cross-part dependency that should be reflected on **both** sides. Add a note
to Part 38 (or confirm it when Part 38 is next touched) that the plugin package must export the
`form` table — or a derived source-map — from its public API, so the export is owned and tested
on Part 38's side rather than assumed by Part 39.
