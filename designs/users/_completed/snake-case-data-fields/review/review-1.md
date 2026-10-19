# Review 1

### 1. The URL query-key decision is self-contradictory, and its read sites are missing from the file list

> **Resolved.** Standardise the query key on `user_id`. Verified the writer (`all_members_table.yaml:93-95`), all six readers (`get_user_detail:22`, `get_user_accounts:12`, `get_user_memberships:20`, `get_user_sessions:13`, `get_user_passkeys:7`, `tile_activity:20`, all `_url_query: userId`), and the events default (`module.lowdefy.yaml:69`, already `?user_id={id}`). Rewrote the design paragraph to state the key is a non-column label, chose `user_id` (fixes the events-deeplink mismatch), and enumerated the writer key + row value + all six reader flips in Files-changed.

The paragraph on `_url_query` ("Components / pages — client reads", design lines 136–139) tries to settle the deep-link query-string key in one sentence and contradicts itself doing it: the reads "can stay as the query-string key," but "must resolve consistently with whatever the linking table now emits (`user_id`)," and you should "align the `events` deep-link example (`?user_id={id}`, already snake) and the table's outbound param." Those clauses can't all hold. Either the key stays `userId` (then the table and events example must be `userId`, not `user_id`), or the key becomes `user_id` (then the reads cannot "stay").

The root confusion is conflating two different things. The **row-field value** `row.userId → row.user_id` is a data-plane rename and must flip (the row contract changed). The **query-string key** (`?userId=` vs `?user_id=`) is an arbitrary label, not a column — the snake_case rename has no bearing on it; it only needs writer/reader agreement.

Concretely, the writer is `all_members_table.yaml:93-95`:

```yaml
urlQuery:
  userId: # the key
    _event: row.userId # the value — this must become row.user_id
```

and the readers of that key are **six sites the Files-changed list never names as key-flip targets**: `get_user_detail.yaml:22`, `get_user_accounts.yaml:12`, `get_user_memberships.yaml:20`, `get_user_sessions.yaml:13`, `get_user_passkeys.yaml:7` (all `_url_query: userId`), and `tile_activity.yaml:20` (`_url_query: userId`). If the design standardises the key on `user_id` (as the "table's outbound param" and the events example push toward), but the audit only flips the writer and the row values, every view-page request reads a now-absent `userId` query key → null payload → `$match` misses → **the user-detail page loads empty**.

There is also a pre-existing latent mismatch this is the moment to resolve: the events module's deep-link default is already `/user-admin/view?user_id={id}` (`modules/events/module.lowdefy.yaml:69`), while the view requests read `_url_query: userId` — so an app configuring `contact_page_url` with that documented example already deep-links to a broken page today.

Fix: state that the query key is a non-column label the rename does not touch, pick one name, and enumerate every site. Recommended — standardise on `user_id` (it fixes the events-deeplink mismatch too), and add all six reader flips plus the table's outbound key to Files-changed. Or keep `userId` everywhere and correct the events example to `?userId={id}` — but decide, and list the sites.

### 2. Auth-hook payloads are an unclassified plane, and `link-contact-on-signup.yaml` is in no list

> **Resolved (auto).** Confirmed `link-contact-on-signup.yaml:33` reads `_payload: user.emailVerified` from a `user.create.before` / `email.verified` hook — a better-auth JS record, not a stored column, so it must stay camelCase. Added a "better-auth hook payloads" row to the "does not flip" table, and listed the endpoint (plus its `create-or-link-contact.yaml` / `write-profile.yaml` fragments) as audited-no-change in the API section.

The governing distinction and the two "What flips / does not flip" tables cover native reads, projection outputs, action params, action responses, and JSON bag keys — but not **better-auth hook payloads**. `modules/user-account/api/link-contact-on-signup.yaml:33` reads `_payload: user.emailVerified` from a `user.create.before` / `email.verified` hook. That object is better-auth's own JS user record (logical/camelCase names, before `transformInput` maps to physical columns), so `user.emailVerified` must **stay camelCase** — but it pattern-matches a data read exactly (`.emailVerified` on a `user`), and the file appears in none of the design's lists. An implementer running the "plane-aware audit" the design calls for has no rule for it and could easily flip it to `user.email_verified`, breaking the signup-link hook.

Add a "does not flip" row for hook payloads (better-auth JS objects, camelCase), and list `link-contact-on-signup.yaml` explicitly as audited-no-change. (The shared fragments it calls — `create-or-link-contact.yaml`, `write-profile.yaml` — check out: their `userId`/`organizationId` are `UpdateUserProfile` action params and `contactId` is a `profile` bag key, so the design's "shared/contact/\* do not change" holds.)

### 3. "Files changed" reads as the whole audit scope, but renamed column names survive in comments

> **Resolved (auto).** The scope question resolves to "yes" by repo convention — CLAUDE.md requires comments to describe the current code, so a comment naming a column the rename drops is a defect, not an optional cleanup. Verified the cited comment sites exist. Added a note under "Files changed" that the sweep updates comment references to renamed columns too, listing the known sites (including files otherwise no-change).

The Files-changed section enumerates data-binding sites; it says nothing about comments. Yet several files that the design lists as no-change (or omits) carry the renamed physical column names **only in comments**, which after the rename will name columns that no longer exist: `all_members_filters.yaml:7,52` (`appRoles`), `all_invitations_table.yaml:2` (`expiresAt`), `tile_attributes.yaml:50` (`appRoles`), `view.yaml:46` (`userId`), `get_accounts.yaml` header (`providerId`/`accountId`), and `get_user_detail.yaml:2,34` (`userId`). Per CLAUDE.md, comments describe the current code — a comment naming `appRoles` beside a `$match` on `app_roles` reads to the next agent as an unresolved question.

This is a scope question, not a bug: decide whether the audit sweep updates comment references too, and say so, so the follow-up rename pass doesn't leave a trail of stale column names.

### 4. The "drop the caveat paragraph" doc instruction applies to only one of the two `indexes.md`

> **Resolved (auto).** Confirmed only `user-admin/reference/indexes.md:32` has the "has not landed" caveat; `user-account/reference/indexes.md` has none but still needs field flips (`organizationId`/`appRoles` at 54/57, `userId` at 74/77). Split the design's docs instruction: field flips apply to both files (including `user-two-factors` `userId → user_id`), caveat-drop to `user-admin` only.

The docs section (design lines 143–147) tells the implementer to flip index field names in **both** `docs/user-admin/reference/indexes.md` and `docs/user-account/reference/indexes.md` and to "drop the 'the rename has not landed' caveat paragraph." Only `user-admin/reference/indexes.md:32` actually has that caveat paragraph. `user-account/reference/indexes.md` has no such paragraph — but it _does_ still need field flips (`organizationId`/`appRoles` at line 54, `userId` at line 74). Split the instruction: field flips apply to both files; the caveat-drop applies to user-admin only. Minor, but as written it sends the implementer hunting for a paragraph that isn't there.
