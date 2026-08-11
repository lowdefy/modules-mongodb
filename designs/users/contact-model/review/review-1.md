# Review 1

### 1. The `global_attributes` sweep targets a line that must not change — it will break the live scoping filter

> **Resolved (auto).** Confirmed against `search_contacts.yaml`: lines 53 and 59 are the `_user:`
> caller reads (stale, rename); line 57 is the contact document's own `global_attributes.company_ids`
> field key being `$in`-matched (live, must stay). The Changes-table line list was self-contradicting
> — the design's own name-collision note already flagged this. Fixed the row to "lines 53 and 59
> only; line 57 stays."

The stale-authorization fix (Decision-side note "A stale authorization-scope read", and the Changes-table row for `search_contacts`) says to rewrite `_user: global_attributes.company_ids` → `_user: attributes.company_ids` at **lines 53, 57, 59**. But line 57 is not a caller read — it is the **contact document's own field** being matched:

```yaml
# modules/contacts/requests/search_contacts.yaml
53:  - _user: global_attributes.company_ids      # caller read — STALE, rename
57:  - global_attributes.company_ids:            # CONTACT field key — LIVE, must stay
58:      $in:
59:        _user: global_attributes.company_ids  # caller read — STALE, rename
```

The design's own prose flags exactly this collision ("Unrelated to the contacts module's own `contact.global_attributes.*` field bag, which is live"), yet the line list contradicts it by including 57. An implementer following the Changes table literally would rename the match key to `attributes.company_ids`, so the `$in` would match `contact.attributes.company_ids` — a field that does not exist — and the company-scoping filter would match nothing instead of no-op'ing. **Fix:** change the line list to "lines 53 and 59 only (the two `_user:` reads); line 57 is the contact field and stays."

### 2. Decision 4 removes the only path that writes `profile_created` onto the user, with no replacement

> **Resolved.** Confirmed the mechanism: `update-profile.yaml:50-60` sets `profile.profile_created`
> as a contact write-stage, and `write-profile.yaml:124/158-159` re-reads and denormalizes the whole
> bag onto the user — so the contact write is the sole path to the user's copy, and dropping it with
> no replacement would strand every invitee in onboarding. Rather than build the user-only write the
> finding proposes, we **cut the requirement that created the gap**: Decision 4's "stop writing it
> onto the contact" half is dropped. The contact-side `profile_created` is inert (nothing reads it;
> table-row-contract already waves it through), and scrubbing it would force `write-profile` to grow
> a "user-only profile field" exception that breaks its can-never-drift invariant — complexity bought
> to delete an inert key. The flag keeps riding the existing denormalization path unchanged, so the
> bug cannot occur. Decision 4 now keeps only its meaningful half (don't promote it; it stays in the
> bag). Migration item 4 and the `write-profile` contact-side change are removed.

Decision 4 says stop writing `profile_created` onto the contact and keep it "on only the user's copy." But trace how it currently reaches the user's copy. The onboarding marker is written as a **contact** write-stage in `modules/user-account/api/update-profile.yaml:50-60` (`$set: profile.profile_created`, appended to `write_stages`). The shared fragment then re-reads that contact (`write-profile.yaml:124 reread_contact`) and denormalizes the **whole bag** onto the user via `UpdateUserProfile` (`write-profile.yaml:158-159`, `profile: _step: reread_contact.profile`). So the contact write is the sole source that puts `profile_created` on `user.profile` today.

`UpdateUserProfile` shallow-merges `profile` per key (lowdefy-design `concepts/hooks/design.md:196`), so dropping the field from the contact write won't _clobber_ an existing `user.profile.profile_created` — but nothing will ever _set_ it either. The onboarding gate reads `_user.profile.profile_created` (`user-account/pages/onboarding.yaml:7`); if it never becomes `true`, the invitee is stuck in onboarding.

The Changes table only says "Stop writing `profile.profile_created` onto the contact" and lists no rewrite of `update-profile.yaml`. **Fix:** the design must specify the user-side write that replaces it — e.g. move the onboarding-completion write out of the contact `write_stages` and pass it through `UpdateUserProfile` (`profile: { profile_created: true }`, which shallow-merges onto `user.profile`) — and add the `update-profile.yaml` rewire to the Changes table.

### 3. The `deleted` stamp on a contact is not "written by `delete-user.yaml`" — nothing in the modules writes it

> **Resolved (auto).** Confirmed: `delete-user.yaml`'s header states "the contact ALWAYS survives",
> and soft-delete-convention says contacts has "no in-module delete endpoint … a host app is expected
> to write the soft-delete." Corrected the "What's actually wrong" bullet: dropped the false
> attribution, reframed the leak as **latent** (no module path produces a soft-deleted contact today),
> and kept the read-guard fix on "absence of a caller is not absence of need" grounds. Sub-point on
> `deleted: null`: the convention specifies live docs set it explicitly on insert, so Decision 2 now
> adds `deleted: null` to the create inserts (alignment, not correctness — the `$exists` predicate
> matches an absent field too).

The "live soft-delete filter is missing" section asserts the `deleted` change stamp is "written by `user-admin/api/delete-user.yaml`." It is not. That endpoint's own header states the opposite: "the contact ALWAYS survives (contact soft-delete stays the contacts-side convention)" (`modules/user-admin/api/delete-user.yaml:1-3`) — it hard-deletes the user identity and leaves the contact untouched. And the [soft-delete-convention](../../../_completed/soft-delete-convention/design.md) design is explicit that `contacts` "**[has] no in-module delete endpoint today — a host app is expected to write the soft-delete**"; the convention only normalized contacts' _read_ predicate, and even then only for the _companies_ lookup inside `get_contact_companies` (the one place contacts already queried a `deleted` field).

This matters because the section frames the leak as active ("soft-deleted contacts can still surface"), but no module code path produces a soft-deleted contact — the leak is latent and only manifests once a host app writes a contact `deleted` stamp. The Decision 2 read-guard fix is still correct (the reads _should_ honor `deleted` regardless — "absence of a caller is not absence of need"). But the rationale is built on a false attribution and should be corrected to match soft-delete-convention's framing. Related sub-point worth settling: soft-delete-convention says inserts set `deleted: null` explicitly, and `create-contact.yaml` currently does not — Decision 2 removes the `hidden:false`/`disabled:false` init; should it add `deleted: null` to keep contacts on-convention? (Harmless either way, since `deleted.timestamp: {$exists:false}` matches an absent field.)

### 4. The "recurring strip" evidence for promoting `contactId` is false — table-row-contract deliberately kept it in the bag

> **Resolved (auto).** Confirmed: table-row-contract lists `profile.contactId` among "a few
> housekeeping keys riding along" it chose to let through, and its terminal `$unset` strips the join
> payloads, never `profile.contactId`. Dropped the false "recurring strip / had to `$unset`" claim
> from both the "What's actually wrong" bullet and Decision 3. Replaced with the accurate cost:
> table-row-contract had to explicitly classify and consciously wave through a non-display key —
> which still supports Decision 3 on its real grounds (a foreign key in a display bag), without the
> fabricated evidence.

Decision 3 and the "What's actually wrong" section justify pulling `contactId` out of `profile` partly on this claim: "the [table-row-contract](../../_completed/table-row-contract/design.md) design already had to `$unset` it from read projections. A recurring strip is the tell it is in the wrong place." That is not what table-row-contract did. That design explicitly lists `profile.contactId` (with `profile.profile_created`, `profile.name`) as "a few housekeeping keys riding along" that it **chose to let through** — "this is not a disclosure the module needs to guard" (`table-row-contract/design.md:181-183`). Its terminal `$unset` strips the _join payloads_ (`user`, `contact`, `attributes`, `profile.picture` — `design.md:356`), never `profile.contactId`.

Decision 3 may still be right on its other grounds (a typed key vs. a foreign key in a display bag). But this specific piece of motivating evidence is factually wrong and should be dropped or corrected, so `resolve` doesn't weigh a "recurring strip" that never happened.

### 5. Six requests get the `deleted` filter but only three are named as leaking — and `get_contact` is a single-record view fetch

> **Resolved.** Confirmed `get_contact` is the by-id fetch behind the view page (guards only `hidden`
> today). Reconciled: the `deleted` guard applies to the **five list-shaped reads** only;
> `get_contact` is **excluded** and keeps only a `hidden`-guard drop, so it can still fetch a
> soft-deleted contact. This is deliberate — the contact view page should open a soft-deleted contact
> and show a "deleted" badge, captured as its own stub design (`designs/deleted-contact-view/`,
> outside the users designs). Decision 2 and the Changes table updated to state the exclusion and the
> intent.

The prose ("What's actually wrong") names three requests that leak — `get_all_contacts`, `search_contacts`, `get_contacts_for_selector`. The Changes table applies the `deleted.timestamp: { $exists: false }` guard to **six**, adding `get_contact`, `get_role_contacts_for_selector`, and `get_contact_excel_data`. The list/selector/export additions are reasonable, but `get_contact` is the **single-record fetch by `_id`** behind the contact view/detail page (`modules/contacts/requests/get_contact.yaml:18-24`, and note it guards only `hidden` today, not `disabled`). Adding the `deleted` predicate there means a soft-deleted contact's detail page returns nothing — an admin can no longer open a soft-deleted contact to inspect or restore it. That may be the intent, but the design doesn't state it, and it's a different decision from "don't leak deleted rows into lists." **Fix:** reconcile the prose count with the table, and state explicitly whether `get_contact` should hide soft-deleted contacts or remain able to fetch them by id.

### 6. Decision 1 renames the collection but leaves two of three connection ids carrying the misleading `user-` prefix

> **Resolved.** Renaming the ids too — the prefix lies just as much on the connection id, and it is
> internal module wiring (auto-scoped by the entry prefix; nothing in app config or another module
> depends on it), so the rename is mechanical and zero-risk. Decision 1 now states this, and the
> Changes table enumerates the full sweep: the two `connections/user-contacts-collection.yaml` files
> (→ `contacts-collection.yaml`) and their `id:` fields, both `module.lowdefy.yaml` `_ref` paths +
> connection-export ids, and all seven `_module.connectionId: user-contacts-collection` call sites in
> `user-admin`/`user-account`.

Decision 1's whole rationale is that the `user-` prefix "mis-signals ownership." The change renames only the physical `collection:` value (`user-contacts` → `contacts`). But the connection **ids** themselves stay `user-contacts-collection` in two of the three modules — only the `contacts` module already names its connection `contacts-collection`; `user-admin` and `user-account` name theirs `user-contacts-collection.yaml` (verified: `modules/{user-admin,user-account}/connections/user-contacts-collection.yaml`). After the rename you get a connection literally called `user-contacts-collection` pointing at a collection called `contacts` — the same misleading prefix the decision set out to remove, now on the connection id instead. Worth deciding: does Decision 1 also rename those connection ids to `contacts-collection` (a larger `_module.connectionId` sweep), or is it deliberately scoped to the physical collection name only? Either is defensible, but the design should say which, since the rationale reads as applying to both.
