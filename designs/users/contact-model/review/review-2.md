# Review 2

Review 1's six findings are all annotated as resolved and the design has been revised
accordingly, so this pass is fresh — it re-verifies the revised claims against the code and
surfaces what the revision did not reach. The `contact`/`user`/`member` split and the four
decisions are sound; the findings below are all at the edges Decision 1 and 3 touch.

### 1. The collection rename's blast radius omits every cross-module and plugin `contactsCollection` default — all of which still say `user-contacts`

> **Resolved.** Confirmed all eight sites plus the demo default to `user-contacts` (events/workflows/
> activities module vars; both plugin connections' hard-coded JS; `apps/demo/modules/events/vars.yaml`).
> Decision: `contacts` becomes the **canonical default everywhere**, not just the contacts module's own
> connection — leaving the others recreates the exact "default mis-signals the real name" problem the
> rename exists to remove, and a default pointing at a dead collection is a silent avatar-join failure.
> Added a Decision 1 paragraph stating the cross-module/plugin reach and that the plugin half is a
> **version bump** (hard-coded in published JS), added the plugin bump to the trade-off, and enumerated
> all eight sites + the demo vars as three new Changes-table rows (module var defaults; plugin
> default/fallback/doc-string + package bump; demo events vars). The design's "mechanical and zero-risk"
> phrase is left as-is — it scopes only to the connection-**id** rename (internal wiring, auto-scoped),
> which genuinely is; the new paragraph names the collection-default reach as the part that is neither.

Decision 1 renames the physical collection `user-contacts` → `contacts`, and the Changes table
enumerates what it claims is the full reach: the three connection files, the connection-id rename,
the seven `_module.connectionId` call sites, three hard-coded `$lookup { from: user-contacts }`
sites (`members_base`, `get_account`, `get_selected_deal`), the five contacts reads, the docs, and
"rebuild the demo." But several **other modules and both plugins** resolve the same physical person
collection through a `contactsCollection` var whose default is the string `user-contacts`, and none
of them are in the table:

- `modules/events/module.lowdefy.yaml:83` — `contacts_collection` default `user-contacts`
- `modules/workflows/module.lowdefy.yaml:152` — `contacts_collection` default `user-contacts`
- `modules/activities/module.lowdefy.yaml:193` — `lookup_collections.contacts` default `user-contacts`
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js:177` — `contactsCollection` default `"user-contacts"`
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js:40` — `connection.contactsCollection ?? "user-contacts"`
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js:130` — same fallback
- `plugins/modules-mongodb-plugins/src/connections/EventsTimeline/schema.js:36` — `contactsCollection` default `"user-contacts"`
- `apps/demo/modules/events/vars.yaml:3` — the demo explicitly sets `contacts_collection: user-contacts`

These drive the `$lookup from` that resolves each event author's / workflow contact's avatar. If the
physical collection is renamed to `contacts` and these defaults stay `user-contacts`, every consumer
that relies on the default (the demo included) gets a `$lookup` against a collection that no longer
exists — the join silently returns empty, avatars fall back to initials, and no error is raised.
This also undercuts two of the design's framings: the rename is not confined to the contacts
"people-model" surface the table describes, and it is not "mechanical and zero-risk" — the plugin
defaults are hard-coded in JS source and changing them is a **plugin version bump**, not a config
edit. **Fix:** decide explicitly whether the canonical default becomes `contacts` everywhere (then
list all eight sites plus the plugin bump in the Changes table and note the demo's events vars), or
whether these defaults deliberately stay `user-contacts` and the design's "canonical name is
`contacts`" claim is scoped only to the contacts module's own connection. Leaving it unstated repeats
the exact "the default mis-signals the real name" problem Decision 1 exists to remove.

### 2. The design mis-names the existing link field as `profile.contact_id` (snake_case); it is `profile.contactId` (camelCase), so the migration copies a field that does not exist

> **Resolved (auto).** Confirmed the stored/indexed field is `profile.contactId` (camelCase) in
> `members_base.yaml:53`, `get_account.yaml:27,44`, `create-or-link-contact.yaml:113,135`, and
> `docs/user-account/reference/indexes.md:39-44`. Corrected every current-state reference (Decision 3,
> the current-model table, "What's actually wrong", the fallback, upstream ask 1's superseded shape,
> and Migration item 3) from `contact_id` → `contactId`, and named the promotion explicitly as a
> camelCase → snake_case normalization (source `profile.contactId` → target `contact_id`) so the
> implementer doesn't assume the source is already snake_case. The target `contact_id` (snake) is the
> design's deliberate choice, matching the `_user` projection convention (`email_verified`).

Decision 3 and the migration describe the current link as `profile.contact_id` /
`_user.profile.contact_id`, and Migration item 3 (line 254) says "copy `profile.contact_id` →
`contact_id`" with the index moving from `users.{ 'profile.contact_id': 1 }`. But the field is stored
and indexed as **`profile.contactId`** (camelCase) everywhere in the code:

- `docs/user-account/reference/indexes.md:39-44` — the partial-unique index is `{ "profile.contactId": 1 }`
- `modules/user-admin/requests/stages/members_base.yaml:53` — `localField: user.profile.contactId`
- `modules/user-account/requests/get_account.yaml:27,44` — `localField: profile.contactId`, `contact_id: "$profile.contactId"`
- `modules/shared/contact/create-or-link-contact.yaml:113,135` — writes `contactId`
- the upstream design itself spells it `contactId` (user-model lists `contactId`; user-profile Decision 2 is titled "`contactId` lives inside `profile`")

Run as written, Migration item 3's `copy profile.contact_id → contact_id` copies a nonexistent field
and every user ends up with `contact_id: null`, silently breaking every join the promotion retargets.
The index-move "from" spec is wrong for the same reason, as is the fallback ("keep
`_user.profile.contact_id`"). **Fix:** correct the current-state name to `profile.contactId`
throughout Decision 3, the fallback, and Migration item 3 — the promotion is a `profile.contactId` →
top-level `contact_id` move (which is also a camelCase→snake_case normalization worth naming so the
implementer doesn't assume the source is already snake_case).

### 3. `write-profile` is listed as a `contact_id` write site, but it never writes the user↔contact link — that is owned solely by `create-or-link-contact`

> **Resolved (auto).** Confirmed against `write-profile.yaml`: its `contact_id` var is the target
> contact's own `_id` (used to query/write the contact, lines 52-53, 61-62), and its
> `UpdateUserProfile` re-denorm passes only `profile`/`name`/`image` (lines 158-163) — never the link.
> The link lives on the user as `profile.contactId` and is set solely by `create-or-link-contact`
> (inline pre-write + `UpdateUserProfile` on `email.verified`); it does not change on a profile edit,
> which is all `write-profile` handles. Removed the `write-profile` row from the Changes table (the
> file is not touched by this design) and rewrote Decision 3's site list: read/join sites
> (`members_base`, `get_account`, `get_selected_deal`, `get_users_for_selector`, `invite` /
> `update-profile` reads) plus the one write site (`create-or-link-contact`).

Decision 3 lists `write-profile` among the sites that "read against" the promoted `contact_id`, and
the Changes table (line 235) instructs it to "Write `contact_id` as a first-class field via
`UpdateUserProfile` (ask 1)." But `write-profile` does neither today and does not need to. Its
`_var: contact_id` is the **target contact's own `_id`**, used only to query and write the contact
(`write-profile.yaml:16, 52-53, 61-62`); its `UpdateUserProfile` re-denorm passes `profile`, `name`,
`image` only (`write-profile.yaml:155-169`) and never the link. The link is set exclusively by
`create-or-link-contact` — inline pre-write on `user.create.before` and via `UpdateUserProfile` on
`email.verified` (`create-or-link-contact.yaml:97-146`) — and it does not change on a profile edit,
which is the only thing `write-profile` handles. Adding a `contact_id` write there is a redundant
write of an unchanging value and misattributes where the link lives; it also has nothing to do with
`write-profile`'s stated invariant (that `user.profile` is a faithful denorm of `contact.profile`,
lines 4-8), because `contactId` was never part of the contact's profile bag. **Fix:** drop
`write-profile` from Decision 3's site list and the Changes table row; the promotion touches only the
read/join sites (`members_base`, `get_account`, `get_selected_deal`, `get_users_for_selector`) and
the one write site (`create-or-link-contact`), plus `invite`/`update-profile` where they read the
link.

### 4. The `global_attributes` → `attributes` sweep restores the name, but the design doesn't establish that `_user.attributes.company_ids` is actually populated

Decision 2's sweep (and the Changes-table row) rewrites `_user: global_attributes.company_ids` →
`_user: attributes.company_ids` on `search_contacts.yaml:53,59`, on the premise that the auth upgrade
renamed the caller's authorization bag and the filter "silently no-ops today." The rename direction
is right — the auth model states `user.attributes` holds "global authorization inputs … today's
`global_attributes`" (`lowdefy-design` user-model Decision 4). But the design presents the rewrite as
a definite _fix_ ("restores company-scoping") without confirming the caller's `attributes` bag ever
carries `company_ids`. The evidence cuts the other way: `company_ids` is documented as a **contact**
field — "`global_attributes.company_ids` on the contact document is the single source of truth for
the company-contact relationship" (lowdefy-design contacts design) — and the auth model routes
company data to the contact, not to `user.attributes`. The design's own name-collision note (line 92)
flags that these are two different `global_attributes.company_ids`. If no caller populates
`attributes.company_ids`, the sweep swaps one empty path for another and the scoping filter still
matches everything (the `_array.length > 0` guard just stays false). There is no regression risk —
the filter can only tighten — but the stated benefit may be illusory. **Fix:** verify against the
host app's admin-set attributes whether `company_ids` is a real caller authorization input (and note
where it is written); if it is not, say so and either drop the "restores scoping" claim or route the
scope from the source that actually holds it. This is exactly the kind of open question CLAUDE.md
says to resolve now rather than leave for the implementer to rediscover.

### 5. The migration renames a collection that carries an Atlas Search index, but treats index recreation as a single lockstep step with no reindex window

Migration item 1 says to `db.user-contacts.renameCollection('contacts')` "with the connection updates
deployed in lockstep" and to "Recreate indexes (the Atlas Search `default` index and the regular
indexes) on the new name." The regular `mongod` indexes can indeed be recreated instantly, but the
Atlas Search `default` index is a `mongot` index that does **not** follow a `renameCollection` and
must be built from scratch on `contacts` — and `docs/contacts/reference/indexes.md` is explicit that
this index is _required_: without it "the list, Excel export, and contact-selector searches match
nothing." So the moment the connection cuts over to `contacts`, every Atlas-search read is dark until
the new search index finishes building, which is not instantaneous on a populated collection. "In
lockstep" hides a real availability gap. **Fix:** sequence the migration so the search index is built
on `contacts` (or the renamed collection) _before_ the connection cutover, and state the expected
reindex window — or note that searches degrade to the non-Atlas fallback during it. This is an
operational ordering the migration must call out, not a detail an operator should have to infer.
