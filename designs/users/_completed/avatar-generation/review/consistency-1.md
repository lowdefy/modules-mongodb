# Consistency Review 1

## Summary

Checked `design.md` against review-1's thirteen decisions and against the code it cites. All thirteen
resolutions are correctly reflected in the design — no review-vs-design drift on any decision. Fourteen
inconsistencies found, all stale references or status notes: thirteen auto-resolved, one (F17's tracking)
resolved by the user.

## Files Reviewed

**Design:** `designs/users-fixes/avatar-generation/design.md`

**Reviews:** `designs/users-fixes/avatar-generation/review/review-1.md` (13 findings — 10 `Resolved` /
`Resolved (auto)`, 1 `Rejected`, plus findings 7, 8 and 13 resolved into D6, D7a and D7b)

**Tasks / plans:** none exist yet.

**Cross-referenced (not part of this design):**
`designs/users-fixes/04-planning/findings.md`, `designs/users-fixes/_completed/05-ui-rework/findings.md`,
`designs/users-fixes/_completed/table-row-contract/design.md`, and commits `dda6e4ed` / `3e6a0ffa` for
the F14 / F17 / F9 provenance.

**Source verified against every line reference the design makes:**
`modules/shared/contact/write-profile.yaml`, `modules/shared/contact/create-or-link-contact.yaml`,
`modules/shared/profile/avatar-picker.yaml`, `avatar-picker-seed.yaml`,
`modules/contacts/api/create-contact.yaml`, `update-contact.yaml`, `modules/contacts/pages/new.yaml`,
`edit.yaml`, `modules/contacts/components/form_profile.yaml`, `contact-selector.yaml.njk`,
`modules/user-account/pages/onboarding.yaml`, `components/view/modal_profile.yaml`,
`components/user-avatar.yaml`, `modules/user-admin/api/invite.yaml`, the three `module.lowdefy.yaml`
manifests, `docs/shared/avatar-colors.md`, `docs/user-account/concepts/write-pathways.md`.

## Inconsistencies Found

### 1. Review-1 finding 4's resolution contradicts D10

**Type:** Review-vs-Design
**Source of truth:** design.md D10 (a later decision than the finding-4 annotation)
**Files affected:** `review/review-1.md`
**Resolution:** Finding 4's annotation ended "`new.yaml`'s `_id` handling is untouched", which D10 later
reversed — the contact `_id` is minted server-side and the inline `_id: {_uuid: true}` is deleted. The
design is internally coherent (D9 explicitly says it "leaves D10 free to take the id away from the
client entirely"); the review annotation was the stale side and would read to a future agent as a
standing instruction not to touch `new.yaml`'s id. Appended a clause to the annotation recording that
D10 superseded it, rather than rewriting the historical resolution.

### 2. `user-admin/module.lowdefy.yaml:170` — wrong line for the `avatar_colors` var

**Type:** Stale Reference
**Source of truth:** the manifest — the var is declared at `:188`
**Files affected:** `design.md` (D7)
**Resolution:** `:170` → `:188`. The wrong number originated in review-1 finding 2 and was carried into
D7 verbatim; the other two manifests (`user-account:32`, `contacts:103`) are correct.

### 3. Current-state table cites the wrong line for all three `generate_avatar` sites

**Type:** Stale Reference
**Source of truth:** the source files
**Files affected:** `design.md` (Current state, "One generator, three of seven callers use it")
**Resolution:** `new.yaml:92` → `:91`, `edit.yaml:129` → `:128`, `contact-selector.yaml.njk:190` →
`:186` — the `generate_avatar` action ids the table is pointing at.

### 4. `contact-selector`'s random-colour init cited as `:176-186`

**Type:** Stale Reference
**Source of truth:** the source file — `pick_avatar_color` spans `:169-185`; `:186` is `generate_avatar`
**Files affected:** `design.md` ("Colour selection contradicts its own documentation")
**Resolution:** `:176-186` → `:169-185`.

### 5. `avatar-picker.yaml` ranges run past the end of the file

**Type:** Stale Reference
**Source of truth:** the source file — 92 lines; `set_avatar_color` is `:84-92`
**Files affected:** `design.md` (D7a, Files changed)
**Resolution:** D7a's `:84-96` → `:84-92`, and Files changed's `:67-96` → `:67-92`.

### 6. The `avatar_color_index` seeding ranges include the seed ref the design keeps

**Type:** Internal Contradiction
**Source of truth:** design.md — Files changed says the `avatar-picker-seed` refs are unchanged
**Files affected:** `design.md` (D7a, Files changed)
**Resolution:** `onboarding.yaml:30-31` → `:30` and `modal_profile.yaml:27-28` → `:27`. Line 31 / 28 in
those files is the `avatar-picker-seed.yaml` `_ref`, which the design explicitly keeps — so the ranges
as written told the implementer to delete it.

### 7. `user-avatar.yaml:14` cited for the `icon: AiOutlineUser` fallback

**Type:** Stale Reference
**Source of truth:** the source file — `:12-14` is the comment, `:15` is the `icon` property
**Files affected:** `design.md` (D7b)
**Resolution:** `:14` → `:15`. Files changed's separate `:12-14` reference to the comment it rewrites is
correct and was left alone.

### 8. Three D10 line references off by one or more

**Type:** Stale Reference
**Source of truth:** the source files
**Files affected:** `design.md` (D10, Files changed)
**Resolution:** `new.yaml`'s inline `_id: {_uuid: true}` `:105-106` → `:106-107` (both occurrences);
`contact-selector`'s `generate_id` SetState `:156-165` → `:157-165` (both occurrences);
`create-contact`'s `contactId` `:return:` resolution `:147-158` → `:147-159`.

### 9. Both `contactId`-read references were wrong

**Type:** Stale Reference
**Source of truth:** the source files
**Files affected:** `design.md` (D10, Files changed)
**Resolution:** `contact-selector.yaml.njk:228` → `:230`, `new.yaml:135` → `:128` (the file is 128 lines
long, so the old reference pointed past its end), and `appendContact`'s `:220-229` → `:221-230`. These
matter more than the other off-by-ones: D10's whole argument is that both callers already read the
authoritative id from the response, and the Verification section asks for that to be re-confirmed.

### 10. `write-pathways.md:36-56` covers only one of the two stale claims

**Type:** Stale Reference
**Source of truth:** the doc — "two writes in one routine" is at `:42-43`, the `_ref`-var enumeration at
`:65`, outside the cited range
**Files affected:** `design.md` (Files changed → Docs)
**Resolution:** split into `:42-43` and `:65`.

### 11. Non-goals points F9 at the wrong path and implies it is outstanding

**Type:** Stale Status/Blocker
**Source of truth:** commit `3e6a0ffa` ("Close 05-ui-rework, spec F9 picker") — F9 shipped and the folder
moved into `_completed/`
**Files affected:** `design.md` (Non-goals)
**Resolution:** path corrected to `../_completed/05-ui-rework/findings.md` and linked; the entry now says
F9 is already done and that it deliberately left the write-path half to this design, instead of reading
as a pending item. The Non-goal itself stands — this design does not touch the picker's aesthetics.

### 12. F17 no longer exists anywhere

**Type:** Stale Reference
**Source of truth:** the user
**Files affected:** `design.md` (Non-goals)
**Resolution:** **Asked user — keep the Non-goal as the only record.** F17 was deleted from
`04-planning/findings.md` by commit `dda6e4ed`, the same commit that created this design ("drop … F17 +
F14 (now avatar-generation)"), but this design makes the shared-header question a Non-goal — so the id
resolves to nothing. Reworded to describe the open question (does the shared page-title component render
the avatar itself, or expose a slot pages opt into?) without citing a dangling id. The user chose this
over restoring F17 to the planning list, so the header-avatar call is deliberately untracked.

### 13. The Related entry for F14 links to a file that no longer contains it

**Type:** Stale Reference
**Source of truth:** commit `dda6e4ed`, which removed the F14 section
**Files affected:** `design.md` (Related)
**Resolution:** replaced the link with a note that F14 was retired from `04-planning/findings.md` when
this design was written, because this design is its resolution. The provenance is kept; the broken link
is not. The in-body "This is the correction to F14" in Current state still reads correctly against it.

### 14. Related's table-row-contract link text predates the move to `_completed/`

**Type:** Stale Reference
**Source of truth:** the filesystem — the design is at `../_completed/table-row-contract/design.md`,
which the link target already pointed at
**Files affected:** `design.md` (Related)
**Resolution:** link text corrected to match the target.

## No Issues

- **All thirteen review-1 decisions are correctly propagated.** Spot-checked each against the design:
  the `.js.njk` double extension (D8 + every mention in D5, D7, D8 and Files changed), the required
  `avatar_colors` `_ref` var plus all three splice sites, `read_profile_contact`'s rename with the
  collision recorded, D9's deletion of the preview, D2's retained atomic `$mergeObjects`, D6's
  stage-level `$literal` rule with its site table, D7's random-then-stored colour, D7a's deleted cursor,
  D7b's null name and unset picture, the three-package changeset list, `write-pathways.md` added to Docs,
  the three-seam cost accounting.
- **The design has no `derive-profile.js` (single-extension) references left** — finding 1's rename is
  complete in D5, D7, D8, D6's table and Files changed.
- **Files changed accounts for every consumer of the files it deletes.** Grepped the tree:
  `generate-avatar-svg.js.njk` has five call sites (contact-selector, new, edit, avatar-picker,
  avatar-preview), `avatar-preview.yaml` exactly one (`form_profile.yaml:8`), `avatar-picker.yaml` two
  (both `user-account`), and `avatar_color_index` lives in exactly the three files D7a names. Every one
  appears in Files changed.
- **The remaining line references are accurate**, including the ones the argument leans on:
  `write-profile.yaml:42-48` / `:53-61` / `:10-11`, `update-contact.yaml:28-33` / `:34-39` / `:44-52`,
  `create-contact.yaml:4-15` / `:17-30` / `:19-22` / `:35-38` / `:39-43` / `:46-51`,
  `create-or-link-contact.yaml:83`, `invite.yaml:76` / `:108` / `:22`, `avatar-picker.yaml:78`,
  `avatar-picker-seed.yaml:15-19`, `form_profile.yaml:8`, `new.yaml:33-43` / `:54`, `edit.yaml:96`,
  `user-avatar.yaml:12-14`, `user-account/module.lowdefy.yaml:87-93` (quoted wording matches).
- **"Each of the four write paths" in Verification is correct, not a stale count.** It reads oddly beside
  the seven-row table and the three seams, but the end-to-end check names `users.profile.picture` and
  `users.image` — written only by `write-profile`'s denorm — and there are exactly four forms behind it
  (onboarding, `user-account`'s profile modal, `user-admin`'s profile modal, the invite form), which are
  also the four rows the table marks as storing no picture. Left as written.
- **No design-vs-task or design-vs-plan drift is possible yet** — neither `tasks/` nor `plan/` exists.

## Noted, not changed

`_completed/05-ui-rework/findings.md:158` (F9's shipped spec) says "`avatar_color_index` stays as the
Change-colour cursor only", which D7a now deletes. That file is completed-design history and read-only
per the repo's Designs rule, and F9 itself defers the write-path change to this design
(`:249-254`), so the two are coherent in intent — only F9's state sentence has aged. No edit made; D7a in
this design is the current word on the picker's state shape.
