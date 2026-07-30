# Review 1

Verified against `modules/user-admin/requests/**`, `modules/user-admin/module.lowdefy.yaml`,
`apps/demo/modules/user-admin/**`, `docs/shared/slots.md` and the installed
`@lowdefy/community-plugin-xlsx@1.1.0`.

Claims that check out and need no further work: `get_user_detail.yaml:39-50` does normalise all
three bags under exactly those names; `members_base` never projects and neither does
`get_all_members`; `get_users_excel_data` injects no `request_stages` slot while
`module.lowdefy.yaml:152-158` documents `get_all_users` as applying to the export;
`components.download_columns` is wired at `pages/all.yaml:126`; `DownloadXlsx` resolves `value:`
through `get(row, column.value)` so dot paths work; the demo configures `profile.department`,
`user_attributes.notes` and `member_attributes.team` but sets only `request_stages.write`, so
`field: department` genuinely resolves to nothing; `get_activities_excel_data.yaml:31` does order
the slot after the `$sort`; and dotted AgGrid `field:` paths are already proven in-repo
(`modules/contacts/components/table_contacts.yaml:37` uses `field: profile.department`).

## Correctness

### 1. The `$unset` is a breaking change for column paths that resolve today, and the design calls it non-breaking

> **Resolved.** New "Breaking changes" section names four: raw join paths, stripped alias duplicates,
> `get_all_users` now running in the export, and `picture` leaving export rows — with the single
> migration (lift to a top-level key in a `get_all_users` `$addFields`, which still runs before the
> close). `docs/user-admin/how-to/migration.md` added to Files changed; changeset is a minor, module
> being pre-1.0 at 0.17.0. D2's non-breaking claim rewritten to scope to `filter_match` explicitly.
>
> The passkey-leak upside was deliberately left out: the note stays short because the BetterAuth rebuild
> already changed the schema out from under any v0.x config, and the migration page already tells
> consumers to expect re-authoring rather than tweaking.

D2 asserts the change is "non-breaking" but scopes that claim only to
`request_stages.filter_match`. It isn't the only surface affected. Because
`members_base.yaml` never projects, a consumer can bind a Members column to a raw join path
**right now** with no `request_stages` entry at all — `field: user.emailVerified`,
`field: contact.profile.department`, `field: contact.updated.by` all resolve on the live wire row
the design itself enumerates. After `members_row.yaml` runs last, every one of those goes blank,
silently, with no build error. The design's own evidence that consumers reach for stored paths is
sitting in the repo: the orphan `apps/demo/modules/user-admin/components/table_columns.yaml` binds
`profile.department`, and `docs/shared/slots.md:76` teaches the pattern ("the list table renders the
column directly from the same path"). Per the repo's "absence of a caller is not absence of need"
rule, the demo's silence is not evidence nobody does this.

The export change has the same character in the other direction: injecting
`request_stages.get_all_users` at `get_users_excel_data.yaml:99` means an existing consumer stage
written for the list row now also runs over export rows (where `user`/`contact` are already
projected away) and over invitation rows. A stage doing `$addFields: dept: "$contact.profile.department"`
starts emitting nulls; one doing `$project`/`$replaceRoot` can break the export outright.

Fix: state both as breaking, and give the changeset a real migration note — `field: user.x` /
`field: contact.x` becomes a `get_all_users` `$addFields` that lifts the value to a top-level key
before `members_row` unsets the join. `docs/user-admin/how-to/migration.md` already exists as the
place for it. Worth naming the upside in the same note so the break is justified rather than
incidental: today the detail read ships every full `user-passkeys` document to the browser for an
arbitrary other user (`get_user_detail.yaml:30-34` `$lookup`s the collection and only
`passkey_count` is consumed), so `members_row` is closing a credential-metadata leak, not just
trimming payload.

### 2. D4's premise that both union branches must produce the same flat shape is false

> **Resolved.** Premise struck from D4 — confirmed `$unionWith` needs no shape parity and
> `DownloadXlsx.js:10` resolves columns via `get(row, column.value)`, so a missing key and an empty
> bag are indistinguishable. The `profile: {}` / `user_attributes: {}` additions are dropped from
> change 3 and Files changed, and D5 is now a documentation note about invitation rows rather than a
> pipeline change. Whether the whitelists themselves stay is #3.

D4 keeps the two `$project` whitelists (`get_users_excel_data.yaml:45`, `:89`) and adds
`$addFields: profile: {}` / `user_attributes: {}` to the invitations branch because "both union
branches must produce the same flat shape." Neither half of that holds:

- MongoDB `$unionWith` does not require matching shapes — it concatenates documents, heterogeneous
  or not. That is already true in this pipeline: `expires` is `null` on members and `$expiresAt` on
  invitations only because someone chose to add it, not because the stage demanded it.
- `DownloadXlsx` builds one value function per column and calls `get(row, column.value)` per row
  (`@lowdefy/community-plugin-xlsx/dist/actions/DownloadXlsx.js`). A missing key yields `undefined`
  and an empty cell. `get({}, 'profile.department')` and `get(rowWithNoProfile, 'profile.department')`
  are indistinguishable in the output.

So the `profile: {}` / `user_attributes: {}` additions are dead weight — delete them from the plan
and D5 collapses to a one-line documentation note. More importantly, the premise is the only thing
holding the whitelists in place, which is what finding #3 is about.

### 3. `get_all_users` ends up with two different input shapes — the exact failure D2 rejects the whitelist for

> **Resolved.** Adopted the uniform close: both export `$project` whitelists are deleted, and
> `members_row` (`$unset: [user, contact, passkeys, inviter]`) is the final stage of all three reads.
> D2 and D4 rewritten accordingly; change 2 and 3 and Files changed updated. One correction to the
> proposed ordering — the close runs **after** the slot in every read, not before it in the export as
> suggested here, since placing it before would only flip the asymmetry. Accepted cost: export rows
> carry ~20 keys instead of nine on an unpaginated fetch; the whitelists never controlled the emitted
> spreadsheet columns, so nothing user-visible changes.

D2's case against a terminal `$project` is precise and correct: "a whitelist placed **before**
`request_stages.get_all_users` strips `user` and `contact` out from under the consumer stage,
destroying the escape hatch." D4 then does exactly that in the export — the whitelist at `:45` runs
before the slot is injected at `:99`, so an export-side consumer stage sees a nine-key row with no
`user` and no `contact`, while the same slot in `get_all_members` sees the full raw joins.

One slot, two contracts, and the manifest is asked to describe both in one sentence. It also means
the export still has no escape hatch for anything the three bags don't cover, which is half of the
problem the design opens with ("`download_columns` … is strictly worse off … empty _and_ unfixable").

With #2's premise removed, the symmetric fix is available and cheaper: drop both `$project`
whitelists and close the export row with the same exclusion stage after the `$unionWith` and
`$sort` but before the slot — `$unset: [user, contact, passkeys, inviter]` (`inviter` is the
invitations branch's raw join, `invitations_base.yaml:15-22`). Every read then closes the same way,
the slot has one input shape everywhere, and the row contract in the design becomes literally true
instead of aspirational. The cost is a handful of extra keys on an unpaginated one-shot fetch that
`DownloadXlsx` ignores, since the emitted columns are schema-driven.

### 4. The raw `attributes` bag survives the `$unset`, so the row carries two paths for the same data

> **Resolved.** D2 now states the rule the exclusion list follows — raw `$lookup` payloads, plus every
> stored field that already ships under a canonical alias — and notes it is derived from the schemas
> rather than an observed row. `attributes`, `createdAt` and `expiresAt` are all added; the third is
> the same defect on the invitations branch (`expires_at` / `expires` both alias it), in scope now that
> #3 and #8 apply the close there. Verified nothing built-in binds the raw forms.

`members_row.yaml` unsets `user`, `contact`, `passkeys`. It does not unset `attributes` — the member
document's own field, which `members_base` will read to produce `member_attributes`. Both keys ship.
A consumer can bind `field: attributes.team` or `field: member_attributes.team` and both resolve,
which is precisely the multiple-shapes problem this design exists to eliminate ("One vocabulary
across manifest var, form state path, row key, table column and export column").

The live-rig listing in "The list row is an accidental shape" doesn't show `attributes` only because
the demo member has no attributes stored — the design says so itself in the Verification section.
That is a good illustration of why an exclusion-based contract needs its exclusion list derived from
the schema rather than from one observed row. Add `attributes` to `members_row.yaml`'s `$unset`.

Same class, lower stakes: `createdAt` survives alongside its alias `signed_up`, and isn't in the
contract table either. Either unset it or list it.

### 5. `picture` cannot be a "declared key" under an exclusion-based row

> **Resolved.** New D8 declares `picture`, `created` and `updated` via `$ifNull` fallbacks to `null` in
> `members_base`, with the rationale that a stable key set is what lets a blank column be diagnosed
> (the F26 confusion) and what makes the Verification key-set assertion meaningful. `name` needs
> nothing.
>
> Two related decisions came out of the same discussion. `profile.picture` joins the close stage's
> exclusion list under #4's alias rule — it holds an ~800-character data-URI SVG, so both paths shipping
> means the blob rides twice per row; verified safe against `modal_profile`'s subtree round-trip because
> `write-profile` merges with `$mergeObjects`. And the export appends `$unset: picture` after the close
> (D4): a spreadsheet has no use for the data URI, and the export fetches every row at once. The list
> keeps it for the Name column's avatar.

The design wants the contract to "keep `picture` a declared key so its absence is a data problem,
not a shape problem" — but D2 closes the row by exclusion, so nothing declares anything. The
contract table is prose; the wire row is whatever survives the `$unset`. `picture` stays absent (not
null) for exactly the reason the design correctly diagnoses: `$addFields` against a missing path
omits the key.

One line in `members_base.yaml:39` makes the design's own claim true:

```yaml
picture:
  $ifNull:
    - "$contact.profile.picture"
    - null
```

Worth doing for `name`/`created`/`updated` too if the goal is a row whose keys are stable
independent of data — `created` and `updated` both vanish today when the contact row is absent
(`preserveNullAndEmptyArrays: true` at `members_base.yaml:31-33` makes that reachable).

## Contract and documentation

### 6. The contract table is not one row shape — the export is a different, smaller row

> **Resolved.** Mostly moot after #3 — the uniform close means export rows carry the contract keys.
> The two surviving divergences get a two-line note rather than a per-read column or a key rename:
> the export joins stored role ids into a string for `roles`, and adds `expires`. Judged not worth
> more structure than that.

"Every members read returns rows with these keys" is false for `get_users_excel_data` as designed.
With the whitelists kept (D4), export rows carry nine keys plus the three bags and omit `_id`,
`userId`, `organizationId`, `role`, `picture` and `roles_arr` — `$project: _id: 0` at `:46`/`:90`.
Worse, `roles` **collides across reads with a different type**: the contract table types it
`{label, orphan}[]` (from `roles_from_catalog.yaml`), but the export builds `roles` as a `", "`-joined
CSV string at `get_users_excel_data.yaml:22-43` and never runs the catalog stage. And the export has
an `expires` key that the contract table doesn't mention at all.

Either adopt #3's uniform close (then the table is true, minus `roles`, which still needs a
divergence note and arguably a different key name on the export branch), or add a per-read column to
the table so a consumer can tell which keys a `download_columns` entry may actually bind. As written,
a consumer following the design's own worked example would reasonably expect `value: userId` to work
in the export.

### 7. `docs/shared/slots.md` still scopes `get_all_*` to the list read

> **Resolved (auto).** Added `docs/shared/slots.md` to "Files changed" — widen the `get_all_*`
> description (`:45`) to cover the Excel export, and point the worked example at the new row-contract
> reference page.

`docs/shared/slots.md:43` documents `get_all_*` as "stages appended to the list-page read pipeline."
Change 4 makes `get_all_users` apply to the export as well, and `docs/` is the source of truth for
consumer-observable behaviour — but `docs/shared/slots.md` isn't in "Files changed". Add it (and,
since the row contract is what `table_columns` binds against, a pointer from the slots worked
example to the new `docs/user-admin/reference/` page).

### 8. `members_row` is scoped to two reads, not "each read", and the sibling invitations read is untouched

> **Resolved.** The wording half is settled by #3 — the close stage now genuinely runs last in every
> read. The invitations half is folded in rather than deferred: new D7 applies the stage to
> `get_all_invitations` so the tab stops shipping the whole `inviter` document. Verified there is no
> breaking edge — `all_invitations_table.yaml` binds only `inviter_name` / `inviter_id`, and D6 leaves
> that tab without a `table_columns` slot, so no consumer could have bound a raw path. The stage is
> renamed `close_row.yaml`, since it is now the shared close for four pipelines rather than a
> members-specific one.

Proposed change 2 says `members_row.yaml` is "applied as the last stage of each read", but "Files
changed" applies it to `get_all_members` and `get_user_detail` only — the export keeps its
whitelists. Reconcile the wording with whichever of #3's options is chosen.

Separately, `get_all_invitations.yaml` is the other tab of the same page and ships the entire
`inviter` user document on every row (`invitations_base.yaml:15-22` `$lookup` + `$unwind`, no
projection anywhere in the request) — the identical defect the design opens with, one file over. D6
declines to give Invitations a `table_columns` slot, which is a defensible scope call, but closing
its row is not the same question and the non-goals don't mention it. Either fold the `inviter` unset
in (it is one stage in a file the design is already touching if #3 is adopted) or add it to
Non-goals explicitly so it isn't lost.

## Verification and the demo

### 9. The row shape is verifiable read-only today; the design declares it unverifiable and defers

> **Rejected.** The developer will verify the row shape by hand rather than the design carrying a
> formal key-set gate. Verification section left as-is, including the demo-comment suggestion.

The Verification section concludes that `pnpm ldf:b` "cannot prove a column resolves" and that
seeding is "a data change for the developer to make". The seeding call is right and matches the
repo's write prohibition. But the _shape_ question — does the row carry the three bags, and are
`user`/`contact`/`attributes` gone — needs no writes: `lowdefy_run_request` executes a request with
a test payload and is read-only unless the app opts into writes. Running `get_all_members` and
`get_users_excel_data` through it and asserting the key set is the verification step this design is
missing, and it is exactly the check that would have caught #4. Add it as an explicit gate; "verify
at code time" on an answerable question is what the repo's design rules forbid.

Note also what green-build-plus-blank-columns means for the deliverable: after this change the demo's
Department and Team columns render blank, which is visually identical to the F26 symptom being fixed.
State the data prerequisite where a demo reader will hit it (a comment in
`apps/demo/modules/user-admin/vars.yaml` next to the columns), not only in the design.

### 10. The `member_attributes.team` worked example renders the stored slug, not the label

> **Resolved.** Team column stays and gains a slug→label `cellRenderer` following the Roles column
> pattern (`all_invitations_table.yaml:41`), so the canonical example shows the complete treatment and
> the member document stays exercised. The row-contract section (and the docs page built from it) now
> states the rule plainly: a bag column renders the stored value, and enum-backed fields need
> formatting at the column.

`apps/demo/modules/user-admin/member_attributes_fields.yaml` defines `member_attributes.team` as a
`Selector` over `{label: Alpha, value: alpha}`. The row carries the stored value, so
`field: member_attributes.team` renders `alpha`, and `download_columns` `value: member_attributes.team`
with `type: String` exports `alpha`. The module's canonical worked example for the attribute-bag half
of the contract would therefore demonstrate a raw slug in a UI column — and this repo's own enum rule
exists because slugs need prettifying "on a view page or filter".

Options: pick a free-text attribute for the example (`user_attributes.notes` is a `TextArea`, so it
displays as stored), or keep `team` and show the `valueFormatter` / `cell` treatment alongside it so
the example is complete. Either way the row contract page should say plainly that a bag column
renders the stored value and enum-backed fields need formatting at the column — otherwise every
consumer rediscovers it.
