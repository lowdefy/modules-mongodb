# Review 2

Review-1's findings are all resolved and the design was reshaped around a stock-block
`List` (no plugin). This pass verifies the reshaped design against source. The core
feasibility claims check out:

- The stock **`Avatar` block emits `onClick`** and renders `content` as an initial fallback
  (`@lowdefy/blocks-antd` `Avatar/Avatar.js`: `onClick={() => methods.triggerEvent({ name: 'onClick' })}`,
  `cursor: pointer` when wired) — so `List → Tooltip → Avatar (+Link)` is buildable.
- A **`List` binds to a pre-seeded state array at its `id`** — the documented read-only pattern
  (`.claude/guides/lists.md`, "read-only lists populated from requests"), confirming the design's
  central thesis that `assignee_docs` already-in-state needs no seeding.
- The `error` palette matches exactly (`#fff1f0` / `#ff7875` / `#cf1322`, `shared/enums/action_statuses.yaml`).
- Every cited line reference is correct: `current_action.stage` is seeded at `action.yaml.njk:165`
  and `:460`, and `check-action-surface.yaml:602`; the two `current_action.*` consumers vs. four
  `action.*` consumers split exactly as the design states.

Three findings remain, all in the reshaped `List` section.

## Var contract

### 1. The assignees-List var-contract change is not captured in §Files changed or the chips header

> **Resolved.** §Files changed now spells out the var-contract change on both the chips entry and the consumers entry: the assignees field's `List` `id` must be a literal state path, so the chips take `assignee_docs` as a build-time **path string** (used as the `List` `id` and via `_state: {path}` for the `+N` count) instead of an operator leaf; the `action_data` map shrinks to `due_date` + `stage`; and the header comment documenting the old contract is rewritten. Approach was already forced by `List` semantics — this was a documentation-completeness gap, not a design change.

§The assignees List (line 37) requires the docs **path as a build-time string** to use as the
`List` `id` ("passed as a build-time var so each consumer binds its own path"). But today all six
consumers pass `assignee_docs` as an **operator leaf** under `action_data`, not a path string:

- form templates — `_state: action.assignee_docs` (`edit`/`view`/`review`/`error.yaml.njk`, e.g. `edit.yaml.njk:86`)
- converged — `_state: current_action.assignee_docs` (`action.yaml.njk:101`, `check-action-surface.yaml:141`)

An operator value cannot serve as a `List` `id` — the `id` must be the literal state path at build
time. So every consumer must change that var from an operator to a path string (e.g.
`assignee_docs: action.assignee_docs`), and the `+N` overflow's count must read `_array.length: { _state: <path> }`
off that same path. This also restructures the `action_data` map: `assignee_docs` leaves it and the
new `stage` leaf (§Due pill) joins it, so `action_data` ends up carrying only `due_date` + `stage`.

§Files changed (line 85) lists only "pass the new `stage` leaf and thread `contact_page_url`" — it
omits the assignee_docs operator→path-string change, which touches all six consumers and is the
single most invasive edit in the part. It also omits updating the chips header comment
(`universal-fields-chips.yaml:10-17`), which still documents `action_data.assignee_docs` as the
avatar source and will be stale after this change (the same class of stale-comment issue review-1 #6
called out). Fix: spell out the var-contract change in §Files changed and note the header rewrite.

## Contact link

### 2. The `{id}` → URL substitution mechanism is unspecified, and "mirroring the events module" doesn't carry over to a `Link` action

> **Resolved.** Reshaped rather than patched. Investigating the finding surfaced that workflows already declares a `contacts` dependency and the contacts `view` page reads its id from `_url_query: _id` — so the avatar link needs no URL string and no `{id}` substitution at all. Proposed change 5 was reworked: the avatar `onClick` fires a `Link` to `_module.pageId: { id: view, module: contacts }` with `urlQuery: { _id: <assignee _id> }`, resolved structurally in the shared chips file. The `contact_page_url` var, the docs var, the demo wiring, and the substitution question are all dropped. Trade-offs accepted (recorded in Proposed change 5): the link is always-on and hardwired to the contacts view (no per-app target/opt-out), and `contacts` becomes a build-time dependency of the chips. §Files changed updated: no new manifest var — instead the `contacts` dependency description is corrected; consumers thread nothing for the link.

Proposed change 5 and §The assignees List say the avatar `onClick` fires a `Link` action
"substituting the assignee `_id` into the `{id}` placeholder (mirroring the events module)." The
substitution does not come for free:

- The events module does the substitution **in React** — `buildContactHref(contactPageUrl, user.id)`
  (`EventsTimeline.js:127`) replaces `{id}` before rendering `<a href>`.
- The Lowdefy `Link` action (`actions-core/Link.js`) performs **no** substitution — it forwards
  `{ url, urlQuery, pageId }` to `methods.link` verbatim. Its schema exposes `url` (relative/external
  string) and `urlQuery`, nothing that expands `{id}`.

So the chips must build the href **at runtime** — e.g. `_string.replace` / `_regex.replace` over the
build-time `contact_page_url` var, injecting `_state: {docs}.$._id`, then pass the result as the
`Link` `url`. There is no existing YAML precedent for this (the demo passes `contact_page_url`
straight into the React events block; `lead-view.yaml:140`). Per CLAUDE.md "resolve the open question;
don't defer it," the design should name the operator it will use rather than leave "substituting …
into the `{id}` placeholder" as prose.

Separately, "mirroring the events module's var" overstates parity. The events var
(`events/module.lowdefy.yaml:52-60`) supports three behaviours: `{id}` placeholder, a no-placeholder
`?_id=<id>` append fallback, and a per-call `disable_contact_link` override. The workflows version
only does `{id}` substitution + disable-when-empty. That's a reasonable deliberate simplification —
but say so, and confirm the value form workflows expects (demo events uses `/contacts/view?_id={id}`,
`apps/demo/modules/events/vars.yaml:5`).

## Empty states

### 3. The divider must be gated on both fields being shown, or a single-field action renders a dangling separator

> **Resolved.** §Labels & empty states now specifies the divider is gated (build-time `_build.array.includes`) on both `assignees` and `due_date` being in `show`, matching the per-field gate, so a single-field action renders no dangling separator.

`show` is author-driven per action — every form consumer passes `show: { _var: action_config.universal_fields }`
(`edit`/`view`/`review`/`error.yaml.njk:83-84`), so an action may legitimately declare only
`[assignees]` or only `[due_date]`. §Labels & empty states describes "a thin divider `Box` (1px)
**between the two fields**" as an unconditional middle element. When only one field is in `show`, an
un-gated divider renders a dangling 1px separator with nothing on one side. Fix: gate the divider with
a `_build.array.includes` test requiring **both** `assignees` and `due_date` in `show` (build-time,
same mechanism the per-field chips already use), so it only appears when both fields render.
