# Review 1 — Avatar architecture, dead-code migration, and reuse

Verified against `modules/user-account`, `modules/user-admin`, `modules/contacts`,
`modules/shared/profile`, and `modules/shared/layout`. No prior reviews exist for this part.

## Avatar architecture — the `user-avatar` fallback contradicts how the codebase actually renders avatars

### 1. The "first-letter on gradient" fallback the design sketches does not exist and is not how avatars work here

> **Resolved.** Deleted the fictional gradient/seed-by-`_id` prose. `user-avatar` now renders `src: { _var: user.profile.picture }` with the Avatar block's built-in `icon: UserOutlined` fallback (matching `identity-header.yaml:18`). Added a design Note documenting that the gradient+initial SVG is generated at *write* time into `profile.picture`, and that the colored-initials *render-time* fallback (the `EventsTimeline` plugin's name-hash palette) is React-internal and intentionally not replicated in this YAML component.

The proposed component (design lines 31–56) sets `src: { _var: user.profile.picture }` and then
leaves a prose comment promising a fallback: *"first-letter on gradient, mirrors profile-avatar's
look. avatar_colors module-var drives the gradient pool; seed by user._id for stability."* None of
that machinery exists, and it misdescribes the real pattern:

- **`profile-avatar.yaml` has no fallback at all.** It is literally two lines —
  `src: { _user: profile.picture }` (`modules/user-account/components/profile-avatar.yaml:1`).
  There is no gradient, no first-letter, no seeding. The claim that `user-avatar` should "mirror
  profile-avatar's look" with a gradient fallback is factually wrong.
- **The gradient/initials avatar is generated at *write* time, not render time.** When a profile or
  contact is created, `modules/shared/profile/generate-avatar-svg.js.njk` builds a first-letter-on-gradient
  SVG and stores it as a `data:image/svg+xml` URI in `profile.picture` (see
  `modules/contacts/components/contact-selector.yaml.njk:186–198` `generate_avatar`, and
  `modules/user-account/pages/new.yaml`). So `profile.picture` is *already* a populated fallback
  image for any created profile — there is nothing to fall back to at render time.
- **The gradient is not seeded by `_id`.** A `{from,to}` pair is picked once from the `avatar_colors`
  pool at create time and stored in `profile.avatar_color` (`contact-selector.yaml.njk:169–185`); the
  generator reads `state('{prefix}.avatar_color')`. There is no `_id`-seeded runtime selection
  anywhere, and the generator reads from page **state**, not from a passed-in doc var — it cannot be
  pointed at `user-avatar`'s `user` var without a rewrite.

**Fix:** Delete the gradient/seed prose. The correct, codebase-consistent component is just the
Avatar with `src: { _var: user.profile.picture }`. For the genuinely-empty case (a contact that was
never run through profile/contact creation, so has no generated SVG), use the Avatar block's built-in
icon fallback — `icon: UserOutlined` — exactly as `modules/shared/layout/identity-header.yaml:18`
already does. No `avatar_colors`, no seeding, no `_id`.

### 2. `_id` is listed as a required var but the component never uses it

> **Resolved.** Dropped `_id` from the `user` var contract; it now reads "needs `profile.picture` and `profile.name`."

The vars contract (design line 62) says `user` "needs `_id`, `profile.picture`, `profile.name`.
Required." `_id` only appears in the (to-be-deleted) seed-by-`_id` comment. With finding #1's fix the
component reads only `profile.picture` and `profile.name`, so `_id` should drop out of the required
list. (`profile.name` is real — it's a derived field set on write at
`modules/user-account/api/create-profile.yaml:39`, so that part of the contract is sound.)

## Reuse — two existing components already cover most of this

### 3. `identity-header.yaml` is a near-twin of the proposed `user-avatar`

> **Resolved (justify-the-split).** Added a design note distinguishing the two. Corrected the review's "layout-owned" framing: `identity-header` is not a module export — it's a shared **file-path fragment** in `modules/shared/layout/` (deliberately placed there per profile-view-layouts review-2 #5, since there's no component-bearing layout module). The split is justified on accurate axes: identity-header is a flat-var, email-bearing, card-styled detail-page header consumed by relative path within-repo; `user-avatar` must be a user-account *module export* (doc-shaped, compact, no email) because its first consumer Part 24 is in a different module and needs `_ref: { module: user-account, component: user-avatar }` — a relative-path reach to identity-header would break module encapsulation. Not merged.

`modules/shared/layout/identity-header.yaml` is already a shared `Box` laying out `Avatar` + name
(+ email) in a row from vars (`avatar_src`, `name`, `email`, `extra`), with the `icon: UserOutlined`
fallback finding #1 recommends. The proposed `user-avatar` is ~80% the same widget. The design
introduces a brand-new component without acknowledging this one or explaining why it can't be reused
or generalized. Per CLAUDE.md "One correct way" and "understanding multiple implementations costs more
than writing one," the design should either:

- reuse/extend `identity-header` (it takes flat vars rather than a doc; a thin `user-avatar` wrapper
  could map `user.profile.*` → those vars), or
- explicitly justify the split (e.g. "identity-header is layout-owned and flat-var; user-avatar is
  user-account-owned, doc-shaped, and exported for cross-module `_ref`") in the design.

Right now a future reader finds two avatar+name components with no note connecting them.

### 4. The AgGrid `avatar` cell renderer already handles table surfaces — note it to prevent duplication

> **Resolved.** Added a scope note to the `user-avatar` section: block-level surfaces only; for table cells use AG Grid's built-in `cell: { type: avatar }` renderer (citing `table_users.yaml:27–31` and `table_contacts.yaml`).

`modules/user-admin/components/table_users.yaml:27–31` renders avatars in tables via a built-in cell
type (`type: avatar` with `nameField`/`srcField`/`idField`). `user-avatar` is a *block-level*
component for non-table surfaces (timelines, assignee chips) — legitimately distinct — but the design
should say so, so nobody later tries to `_ref` `user-avatar` into a grid cell or re-invents the cell
renderer.

## Migration framing — `user-selector` is currently dead code

### 5. `user-selector` has zero consumers in this repo; the "no regression / breaking change" framing is moot

> **Resolved.** Reframed the part as a relocation of an unused export (grep confirms no in-repo consumer; Part 24 is the first). Dropped the "audit user-admin pages and rewrite each" step and the no-regression verification bullet (nothing to regress). Kept the downstream concern but stated it honestly: private apps *may* `_ref` the old path, and since the repo is pre-stable that's an acceptable break — recorded in user-admin's CHANGELOG as a breaking change under a **minor** bump (pre-1.0 semver), not implied in-repo breakage.

A repo-wide grep for `user-selector` and `get_users_for_selector` (excluding the source files and the
user-admin manifest) returns **nothing** — no page, component, or app config consumes it. That
invalidates several claims:

- **Verification (line 95):** "user-admin app pages that used the old `user-selector` continue to
  render the same dropdown" — there are no such pages to regress.
- **In-scope audit (line 25):** "Audit user-admin's own pages for `_ref` / `connectionId` references
  to the moved files and rewrite each" — there are none to rewrite.
- **Consumers (line 91) / Contract to neighbours (line 105):** "pages that previously consumed
  `user-admin/user-selector` switch to…" and "Document as a breaking change in user-admin's CHANGELOG"
  — within this repo nothing consumes it, so it isn't a breaking change here. (It *may* be consumed by
  private downstream apps; if that's the concern, say so explicitly rather than implying in-repo
  consumers exist.)

This is good news — it's a relocation of an unused export, not a risky live migration — but the design
should be reframed accordingly. The first real consumer is Part 24, which makes the *fitness*
question (finding #7) the one that actually matters, not regression risk.

### 6. user-admin does **not** currently depend on user-account; "already exists transitively" is false

> **Resolved.** Removed the false rationale (the "transitively / both modules share a connection" sentence is gone). Reversed the conclusion in light of #5: user-admin has no consumer of the migrated selector and references no other user-account export, so §3 now says **do not** add the `user-account` dependency — adding it would declare a relationship that doesn't exist. Made it conditional: add it only if a user-admin page later consumes a user-account export.

Design line 25 says the "Declared dependency on user-account already exists transitively (both modules
currently share the same connection)." Both halves are wrong:

- user-admin's manifest declares `dependencies: [layout, events, notifications]`
  (`modules/user-admin/module.lowdefy.yaml:5–11`) — **no** user-account dependency, transitive or
  otherwise.
- The two modules do **not** "share a connection." Each defines its *own* `user-contacts-collection`
  connection (`user-admin/module.lowdefy.yaml:140–141`, `user-account/module.lowdefy.yaml:59–60`);
  the app remaps both to the same app-level connection. Connection co-naming is not a dependency
  relationship.

The design's conclusion (add `user-account` to user-admin `dependencies:`) is correct **and mandatory**
— a cross-module `_ref` to `user-account/user-selector` requires it — but the supporting rationale is
false and should be corrected so the implementer doesn't skip the step thinking it's already covered.
(That said: per finding #5, if user-admin has no in-repo consumer of the selector, user-admin may not
need the dependency at all after the move — confirm whether any user-admin page will actually `_ref`
the migrated selector before adding it.)

## Selector fitness for Part 24

### 7. "as-is, no behaviour change" conflicts with "Part 24's multi-select needs no change"

> **Resolved.** Verified the repo has distinct `Selector` and `MultipleSelector` blocks (scalar vs array state). Resolved by keeping `user-selector` a genuine as-is single-select move (it's a real export consumed by external apps) and adding a **separate** `user-multi-selector` component (new §2) built on `MultipleSelector` with array state, sharing the `get_users_for_selector` request. Rejected the `mode`-var approach (would branch block type and value contract). Out-of-scope bullet rewritten accordingly. Flagged the consumer-side contract fix: Part 24's design line 172 references `user-selector` for the multi-valued assignees edit and must change to `user-multi-selector` when Part 24 is actioned (noted in Consumers + Contract to neighbours).

Out-of-scope (line 80) says v1 moves the selector "as-is" and that Part 24's `assignees` array "uses
the multi-Selector mode that's already in the block — no change required here." But
`user-selector.yaml` sets no `mode`/`multiple`/`maxTagCount` prop — it's a single-value Selector.
"The block supports multi-select" ≠ "this component is configured for it." Part 24 (review-1 #5/#11
confirms `assignees` is an array, and #11 wants it requirable) needs multi-select, so one of the
following is true and the design should pick one:

- the component must expose a `mode` (or `multiple`) var so Part 24 can opt into multi-select — which
  *is* a behaviour-affecting change, contradicting "as-is"; or
- Part 24 wraps/extends it separately.

Leaving both statements as-is means the implementer ships a single-select component that Part 24
can't use for assignees.

## Process

### 8. "Open questions: None" — but the fallback is genuinely unresolved

> **Resolved (moot via #1 and #7).** Both underlying open questions were settled in this action review from existing code — #1 via the write-time-SVG pattern + `icon: UserOutlined` fallback, #7 via the distinct `Selector`/`MultipleSelector` blocks. Nothing is deferred, so "Open questions: None" is now accurate rather than premature. Annotation only; no further design edit.

Findings #1 and #7 are open factual/design questions the part currently punts on (a hand-wavy fallback
comment; contradictory multi-select statements). Per CLAUDE.md "Resolve the open question; don't defer
it," these should be settled in the design before it's actioned — both are answerable now from the
existing code (the SVG-at-write-time pattern and the `icon` fallback for #1; the missing `mode` prop
for #7).
