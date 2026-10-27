# @lowdefy/modules-mongodb-user-account

## 1.3.0

### Patch Changes

- [#315](https://github.com/lowdefy/modules-mongodb/pull/315) [`e494429`](https://github.com/lowdefy/modules-mongodb/commit/e494429f364cee1b00b88708027e7af2edcdefb0) Thanks [@SamTolmay](https://github.com/SamTolmay)! - A banned user who tries to sign in is now told their access was removed. Before, the login page had no message for a ban: a sign-in link landed on "Something went wrong while signing you in", and a correct emailed code toasted "That code is wrong or has expired", so the person kept retrying. A sign-in link or password sign-in now shows the "You don't have access to this app" wall with "Your access to this app has been removed. Contact an administrator if you think this is a mistake." A correct emailed code for a banned user, or for one with no access to the app, toasts the matching message in place of the wrong-code one. A sign-in link reaches the wall once Lowdefy redirects a refused magic-link sign-in to the error page.

## 1.2.0

### Patch Changes

- [#310](https://github.com/lowdefy/modules-mongodb/pull/310) [`64f4b6f`](https://github.com/lowdefy/modules-mongodb/commit/64f4b6f31927d4b1babdddcc374ee1f727c37989) Thanks [@machielvdw](https://github.com/machielvdw)! - Pressing "Accept and continue" on an invitation now goes straight into the app. Before, the accept page reloaded itself partway through and stopped on "You're already a member" until the invitee pressed "Go to app". Accepting makes the invitee a member, and the page called the join log before it refreshed its session, so Lowdefy saw the call answered as a different caller and reloaded the page. The page now refreshes the session first, on the accept path and on a retry of an already-accepted invitation.

## 1.1.0

## 1.0.0

### Major Changes

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the modules need Lowdefy 7.** This release moves every module and the plugins package to Lowdefy 7 and its auth engine, page paths, tenant wall, websockets and Lucide icons. Apps on Lowdefy 5 or 6 stay on the previous release.

  To upgrade, move the app to Lowdefy 7 (`lowdefy upgrade` applies the framework codemods), then work through the breaking entries in this release, chiefly:

  - **Icon names** are Lowdefy 7 semantic and Lucide names; icon names an app passes into module vars need the same rewrite.
  - **`app_name` is gone.** Declare `slug:` on the root of `lowdefy.yaml` and drop the var from every module entry.
  - **`user-account` and `user-admin` run on the Better Auth engine**, with contacts linked to their auth user and organization authority separate from app roles.
  - **Search:** `request_stages.filter_match` takes plain `$match` clauses, the new `atlas_search` var picks Atlas `$search` or a regex fallback, and the Atlas Search index contract changes.
  - **Events:** `contact_page_url` is replaced by `contact_page_id`.
  - **ai-reporting:** the app lists the module's `report-policy` in `policies.dynamicBlocks`, and the report endpoints return `report_id` without `url`.
  - **`profile.picture`** is derived by every write, and `create-contact` mints the contact `_id` itself.

### Minor Changes

- [#127](https://github.com/lowdefy/modules-mongodb/pull/127) [`b8a2ef6`](https://github.com/lowdefy/modules-mongodb/commit/b8a2ef697323f432926ba784b2e49ff88a599140) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the `app_name` module var is replaced by Lowdefy's `_app` operator.** Apps now declare their identity once, as `slug:` on the root of `lowdefy.yaml`, and every module reads it directly with `_build.app: slug`.

  Migration for consumers:

  - Add `slug: <your-app-slug>` to the root of `lowdefy.yaml` if it isn't there already. It must be kebab-case (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) — Lowdefy validates it, and referencing an undeclared slug fails the build.
  - Remove the `app_name:` var from every module entry. `activities`, `companies`, `contacts`, `deals`, `notifications`, `user-account`, `user-admin` and `workflows` no longer declare it.
  - `events.display_key` is now optional, defaulting to the app's own slug. Drop it unless the app deliberately renders another app's event display strings.
  - If a `change_stamp` override baked in an app-attribution literal (`app_name: my-app`), change the value to `{ _build.app: slug }`. The stamp field keeps the name `app_name`.
  - Any shared config file that existed only to hold `app_name` (e.g. an `app_config.yaml`) can be deleted.

  No data migration is required — the slug produces the same string the `app_name` var did, and no stored field or key is renamed. `created.app_name` keeps its name on event and notification documents.

  Connection schema changes in `@lowdefy/modules-mongodb-plugins`: the `WorkflowAPI` connection property `app_name` is renamed to `slug`, and the `EventsTimeline` connection property `app_name` is renamed to `display_key` (it carries the events module's `display_key`, which may legitimately differ from the slug). Apps wiring these connections directly must rename the property keys.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`240e981`](https://github.com/lowdefy/modules-mongodb/commit/240e981479be3a5747ad200a0ace8458d2c0c1c2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the profile name and avatar are derived on the server when a profile is written.** `contacts`' `create-contact` and `update-contact`, and the shared `write-profile` fragment that `user-account` and `user-admin` use, all call one derivation (`modules/shared/profile/derive-profile.js.njk`). It sets `profile.name`, `profile.avatar_color` and `profile.picture`.

  - **A payload's `profile.picture` is ignored.** The write computes it, so renames update the avatar on every path. The contacts create and edit forms do not render an avatar preview.
  - **`profile.name` is the non-empty given and family names joined by a space**, so a person with only one name part keeps their name. Initials are the first letter of each part, or the first two letters of the only part.
  - **A profile with no `avatar_color` is given one random palette entry, and it is stored** so it stays stable. Picking a colour still wins, and people who already have a stored colour keep it. Because the rendered avatar is stored too, existing people are recoloured on their next write, not at upgrade. To recolour everyone, clear `profile.avatar_color` in a migration. See `docs/shared/avatar-colors.md`.
  - **A profile with no name stores no `picture`**, so the Avatar block shows its person icon.
  - **Profile photos.** The new `AvatarUpload` plugin block is a round avatar that is also the upload control. It crops, downscales and compresses the image in the browser to a data URI, which is stored inline. The shared avatar picker (onboarding and the profile modals) binds it to `profile.photo`, and an uploaded photo becomes the stored `profile.picture`. Removing the photo goes back to the initials avatar. `update-profile` rejects a photo that is not an image data URI or is over about 512 KB.
  - **`create-contact` mints the contact `_id` on the server and ignores a payload `_id`.** Read the new id from the response's `contactId`. A payload carrying a known `_id` with a new email could otherwise overwrite that contact.
  - **Every payload value these writes put into an aggregation update is wrapped in `$literal`**, so a value that begins with `$` (a `given_name` of `$email`, or an email local part) is stored as written instead of being read as a field path.

  `request_stages.write` stages still run last, so a stage that overrides `profile.name` or `profile.picture` still wins.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **A person's contact links to their auth user through `user-contacts.user_id`.** A contact belongs to one organization, while the auth `user` is global, so the link lives on the contact and a person holds one contact per organization.

  - The caller's own contact is the one with `{ organization_id, user_id }`: the organization from the tenant wall and the user from the session. The shared `modules/shared/contact/resolve-own-contact.yaml` fragment resolves it. If the person has no linked contact there, it claims the unlinked contact for their verified address and stamps `user_id`. A contact already linked to someone else is never claimed. After the claim, identity is by id, so an email change does not break the link.
  - `modules/shared/contact/ensure-contact.yaml` makes sure a contact exists and is safe to run on every sign-in. It sets `user_id` only when there is an auth user, so a contact minted for an invitee who has no login yet is unlinked until they first sign in.
  - Joins from `users` to `user-contacts` match through `modules/shared/contact/contact-match-expr.yaml`: `user_id`, or the address while the contact is still unclaimed.
  - The events timeline (`GetEventsTimeline`) finds an author's picture through the contact's `user_id`. Under `policy: tenant` only the caller's organization's contact is read. An author whose contact has no `user_id` yet shows initials.
  - App config that needs the caller's contact should resolve it with `resolve-own-contact`, or match `{ organization_id, user_id }` in a join.

  **New required index** on `user-contacts`: `{ organization_id: 1, user_id: 1 }`, unique, partial on `user_id: { $exists: true }`, alongside the partial-unique `{ organization_id: 1, lowercase_email: 1 }`. Under `pinned` the single-field `{ user_id: 1 }` and `{ lowercase_email: 1 }` work too. See `docs/user-account/reference/indexes.md`. No backfill is needed: an existing contact is claimed on its person's next sign-in.

  Contacts are minted and claimed only for a verified email. Turn on `requireEmailVerification` so that an unverified signup holds no session.

- [#242](https://github.com/lowdefy/modules-mongodb/pull/242) [`9e083dc`](https://github.com/lowdefy/modules-mongodb/commit/9e083dc8a2696abeee3c91004c75fdc2606196d8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: icon names are Lowdefy 7 semantic and Lucide names.** Lowdefy 7 replaces react-icons with Lucide and fails the build on a react-icons name, so every `AiOutline*`, `AiFill*` and `Lu*` name in the modules and the plugin blocks is rewritten with the `@lowdefy/codemods` `v7-0-0/react-icons-to-lucide.json` table: a semantic name (`edit`, `delete`, `mail`) where one fits, otherwise the Lucide name (`Waypoints`, `FileSpreadsheet`).

  The modules now need a Lowdefy version with Lucide icons. Glyphs the table marks for review: filled status icons (`check-circle`, `close-circle`, `CircleAlert`) are outline, the FileManager's PDF and Word icons are both `FileText` and its Excel icon is `FileSpreadsheet`, and the Cluster icon is `Waypoints`.

  Apps that pass icon names into module vars (menu entries, enum `icon` fields, `event_types`) need the same rewrite; `lowdefy upgrade` applies it.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Module links follow Lowdefy page paths and `basePath`.** No module builds a page URL by hand any more, so nothing breaks when a page has a `path` or the app has a `basePath`.

  - **Pages with paths.** The layout `page` component takes a `path` var, such as `tickets/{ticket_id}`, to serve the page at a URL pattern.
  - **Record links.** Links in HTML (company and contact lists, the activities timeline, the company hierarchy, the deal card and the deal's people, the workflow open-actions card and the overview subtitle) are `data-page-id` links, so they move within the app without a full page load. `DataDescriptions` and `SmartDescriptions` render contact and company links with Lowdefy's `Link`, and `ActionSteps`, `WorkflowProgress` and `EventsTimeline` pass a link's `pathParams` to it. The sign-in, sign-up, forgot-password and accept pages link to each other by page id.
  - **Workflows.** A workflow's `entity:` block takes `id_path_key`, the entity page's path placeholder for the entity id (for a page at `deals/{deal_id}`, `id_path_key: deal_id`); the entity link then carries the id in `pathParams`. `id_query_key` defaults to `_id` only when `id_path_key` is not set, so set both to also pass the id in the query. `tracker.start_link` and the custom-kind `status_map` `link:` / `view_link:` cells take `pathParams` next to `urlQuery`, with the same `action_id: true` / `entity_id: true` sentinels. Breadcrumbs, the return to the entity after a terminal signal, the events timeline and the deal's open items pass `pathParams` too.
  - **Breaking (events): `contact_page_url` is replaced by `contact_page_id`.** Set it to the contact page's id, such as `contacts/view`. The contact id goes in the query as `contact_id_query_key` (default `_id`), in the path value `contact_id_path_key` names when the page has a path like `contacts/{contact_id}`, or both. The events-timeline component takes the same three vars per call, and the `EventsTimeline` block takes `contactPageId`, `contactIdQueryKey` and `contactIdPathKey` in place of `contactPageUrl`. The timeline's avatar, timestamp and note @mentions link to the contact page; `note-capture` stores each @mention as a `#contact-<id>` link, and mentions in notes saved before this show unlinked.
  - **Breaking (ai-reporting): `generate-report`, `create-report` and `duplicate-report` return `{ ok, report_id }` without `url`.** Open a report with a `Link` to the `report` page and `urlQuery: { report_id }`. The reporting agent points the user to the panel's "Reports from this chat" list instead of replying with a link.
  - **Fix (deals):** deal event titles name the user as plain text. The old link pointed at `/contacts/view` with the user's id, which is not a contact id.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: `user-account` is rebuilt on Lowdefy 7's BetterAuth auth engine.** It is now the app's auth-pages module and its signed-in account workspace. This is a rebuild, not an in-place upgrade: expect to redo the module entry. Step-by-step upgrade: `docs/user-account/how-to/migration.md`.

  **Pages.** The auth engine ships no UI, so every auth page is this module's, and the build points `auth.authPages.*` at them:

  - `login` renders the sign-in methods the app's `auth:` config enables (email and password, magic link, email code, OAuth, passkey), read through `_build.authConfig` rather than module vars. The new `providers` var sets each OAuth button's label, icon and order. Pressing Enter in a field does what the page's main button does. Login also serves the `authPages.error` role.
  - `signup`, `forgot-password`, `reset-password` and `verify-email`. Signup captures the email and password only, and `onboarding` captures the profile. Every verification email the module sends carries the inbound `?callbackUrl=` on to login.
  - `magic-link`: the emailed sign-in link opens a page that signs in on a button click, so a mail scanner that opens the link cannot use it up. With `auth.emailOTP` on, the same email carries a code that the "check your email" screen accepts, and a login page reached from an expired link asks for that code before offering a new link.
  - `two-factor` (the second-factor challenge) and `two-factor-enrol`, a protected page that `auth.twoFactor.required` sends unenrolled callers to.
  - `accept` accepts an invitation for `?invitationId=`. It names the inviter and the organization, explains an expired, withdrawn or wrong-address invitation, and prefills and locks the invited address on login and signup. After the accept it enters the app with a full page load to home, so the menus reflect the new roles.
  - `onboarding` (replacing `new`) completes a first-login profile, prefilled from what the inviting admin entered, and offers a passkey when passkeys are enabled. Saving sets `profile.profile_created: true`, the marker the app's router reads.
  - `view` is one account page with section-scoped tiles: Profile, Security (email and verification, change password, two-factor, passkeys, linked accounts), Sessions (list, sign out others) and, with the new `mcp_tokens` var, Access tokens.
  - `logout`.

  **Passwordless apps.** With `emailAndPassword.enabled: false` and `magicLink.enabled: true` sign-up collapses into the login page and there is no `/signup` route, so the app must set `auth.authPages.signUp: login`.

  **Access tokens.** With `mcp_tokens: true` the account page lists the member's own MCP member tokens in the active organization and creates and switches them off. A new token is shown once, with a copy button. It needs the app's MCP authorization server (`auth.oauthProvider`). Each create and switch-off is logged as `org-mcp-token-created` / `org-mcp-token-revoked`.

  **Removed:** the `new` and `edit` pages (`verify-email-request` is now `verify-email`), the `create-profile` endpoint, and the `app_name` var. `event_display` is a flat `{ event-type: template }` map. Its templates receive `user`, `org-member-joined` also receives `inviter` and `organization`, and the token events receive `token`.

  **Contacts and sign-in.** A `session.create.after` hook (`ensure-contact-on-signup`) makes sure every person with a verified email has a contact in the session's organization. It links an existing contact for that address or creates one, and it writes its change log to `log-changes-system`. `update-profile` writes the contact and copies the profile onto the auth user in the same routine, so `_user.*` is current with no client-side sync. Email changes are not supported.

  **Organizations.** The module builds and runs under both `auth.organizations.policy: pinned` and `tenant`. Under `tenant` an invited person who signs in from the login page holds no organization yet. The engine marks them `_user.awaiting_organization` with `_user.pending_invitation_id`, and the app's router should send them to `accept`. Joining is logged as one `org-member-joined` event in the invitation's organization, through the new `log-member-joined` endpoint and, under `tenant`, the shared `user-events-system` connection.

  **Required setup:**

  - The app runs Lowdefy 7 with an authored `auth:` config and an `auth.email` connection. Every auth email goes through `auth.email`, and `notifications` is not a dependency.
  - The BetterAuth adapter database, the `user-contacts` connection and the module's read connections resolve to one MongoDB database.
  - Indexes, in `docs/user-account/reference/indexes.md`: two partial-unique `user-contacts` indexes, `{ organization_id, lowercase_email }` and `{ organization_id, user_id }`, and a unique `user-two-factors { user_id }`. The auth collections store snake_case columns (`user_id`, `email_verified`, `expires_at`).

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.2

## 0.44.1

## 0.44.0

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.0

## 0.40.0

## 0.39.1

## 0.39.0

## 0.38.0

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

## 0.32.1

## 0.32.0

## 0.31.1

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.1

## 0.25.0

## 0.24.0

## 0.23.1

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.1

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.2

## 0.9.1

## 0.9.0

### Patch Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`163529c`](https://github.com/lowdefy/modules-mongodb/commit/163529cd6063914ff715b37934feea595967ee86) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking:** the `layout` `floating-actions` component now lays its buttons out with `direction: row` + `justify: flex-end` + `wrap: nowrap` instead of `direction: row-reverse`. Buttons are now listed in natural left-to-right order (the last one renders rightmost), and the bar never wraps onto a second line.

  Migration: reverse the order of buttons in each `floating-actions` `actions:` array — what used to be listed first (and rendered rightmost under `row-reverse`) must now be listed last. Every action button must set `layout: { flex: 0 1 auto }` so it is content-sized rather than a full-width grid column; a button without it stretches full width and stacks onto its own line. Any `spacer` Box or `width` var previously used to coax right-alignment is no longer needed and should be removed.

  All in-repo callers (contacts, activities, companies, user-account, user-admin) have been updated to the new order. The workflows action-page templates (edit/view/review/error) and the shared `check-action-surface` signal bar (used by the in-context action modal and the `workflow-action-*` pages) now set `flex: 0 1 auto` on every signal button and order them so the primary action lands rightmost, fixing buttons that previously stacked onto multiple lines and left-aligned. The signal bar's `justify` was also corrected from the invalid `flex-end` token to `end` (Lowdefy's justify map only accepts `end`; `flex-end` silently fell back to left alignment).

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`14d3861`](https://github.com/lowdefy/modules-mongodb/commit/14d38617ff71b2159965ef62917e110c1107422f) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Fix the `user-selector` / `user-multi-selector` options request returning no users. The request scoped the dropdown to `apps.{app_name}.is_user` using `_module.var: app_name`, but these components are only ever consumed through a cross-module `_ref` and `_module.var` resolved to `null` in that scope — so the query matched `apps.null.is_user` and returned nothing. It now reads the app slug via `_app: slug`, which resolves from the app root independently of module-entry-var resolution. Consuming apps must declare `slug:` on their `lowdefy.yaml` (kebab-case).

## 0.8.1

## 0.8.0

## 0.7.0

## 0.6.0

### Minor Changes

- [`ad80095`](https://github.com/lowdefy/modules-mongodb/commit/ad800955415ff9e5858a0ce3d8fc6ddd5b241046) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Bump `@lowdefy/community-plugin-mongodb` peer requirement from `^2` to `^3` across all modules that depend on it (`activities`, `companies`, `contacts`, `notifications`, `user-account`, `user-admin`). Consumer apps must update their plugin install to the v3 line; module config and exports are otherwise unchanged.

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.2

## 0.4.1

## 0.4.0

### Minor Changes

- [#45](https://github.com/lowdefy/modules-mongodb/pull/45) [`d64b5d2`](https://github.com/lowdefy/modules-mongodb/commit/d64b5d25183f77c0f9eae925765cfa858c742eaa) Thanks [@Yianni99](https://github.com/Yianni99)! - Change `event_display` defaulting and override semantics across all event-emitting modules. The default (no override) now renders titles under the consumer's `app_name` instead of a literal `default` key, and an override fully replaces the defaults instead of merging with them.

  **Behavior changes (potentially breaking for consumers):**

  - **Override fully replaces, no merge.** Whatever you write under `event_display` is exactly what's stored on the event document. Consumers that previously relied on partial overrides being merged with the module's defaults must now list every app and event type they want rendered.
  - **Defaults file shape changed.** `modules/{name}/defaults/event_display.yaml` is now a flat `{ event-type: template }` map. The previous top-level `default:` wrapper is gone — the build wraps the flat map under the consumer's `app_name` var. Consumers that `_ref` the defaults file directly will see the new shape.
  - **`companies` now requires `app_name`.** Every event-emitting module declares its app context the same way contacts/user-admin/user-account already did. Companies consumers must add `app_name` to their module vars (typically wired from `app_config.yaml`).

  **Migration:**

  - If you didn't override `event_display`, no action needed beyond setting `app_name` on companies.
  - If you overrode `event_display`, list every app and event type you want stored — defaults no longer fill the gaps. The override shape stays `{ [app_name]: { [event-type]: template } }`.

  See [`docs/shared/event-display.md`](../../docs/shared/event-display.md) for the updated reference.

## 0.3.0

## 0.2.1

### Patch Changes

- [#35](https://github.com/lowdefy/modules-mongodb/pull/35) [`930d7c1`](https://github.com/lowdefy/modules-mongodb/commit/930d7c18d1104fcc03e769907c4cae37ece3b771) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

  Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.

## 0.2.0

### Minor Changes

- [#28](https://github.com/lowdefy/modules-mongodb/pull/28) [`2c4aa70`](https://github.com/lowdefy/modules-mongodb/commit/2c4aa70f54840a33d5f21ea45539328a860d3525) Thanks [@Yianni99](https://github.com/Yianni99)! - Rename module pages from entity-prefixed IDs to semantic verbs to remove the redundant URL prefix (e.g. `/companies/companies` → `/companies/all`). Module pages now use `all`, `view`, `edit`, `new` consistently. Cross-module references via `_module.pageId:` and hardcoded scoped page IDs (`{entry-id}/{page-id}`) must be updated to the new IDs.

  Page ID changes per module:

  - `companies`: `companies` → `all`, `company-detail` → `view`, `company-edit` → `edit`, `company-new` → `new`
  - `contacts`: `contacts` → `all`, `contact-detail` → `view`, `contact-edit` → `edit`, `contact-new` → `new`
  - `user-admin`: `users` → `all`, `users-view` → `view`, `users-edit` → `edit`, `users-invite` → `new`, `check-invite-email` → `check`
  - `user-account`: `profile` → `view`, `edit-profile` → `edit`, `create-profile` → `new` (`login`/`logout`/`verify-email-request` unchanged)
  - `release-notes`: `release-notes` → `view`
  - `notifications`: `inbox` → `all` (`link`/`invalid` unchanged)

  Plugin defaults updated to match: `SmartDescriptions` now defaults `contactDetailPageId` to `contacts/view` and `companyDetailPageId` to `companies/view`; `EventsTimeline` schema example updated.

  Also includes two fixes to the contacts new page: removed a duplicate avatar render (the avatar block was included both directly and via `form_profile`), and fixed the post-create redirect that was navigating with a null `_id` because CallAPI return values are accessed at `_actions: <id>.response.response.<field>`, not `.response.<field>`. Same redirect fix applied to the companies new page.

### Patch Changes

- [#31](https://github.com/lowdefy/modules-mongodb/pull/31) [`a167d18`](https://github.com/lowdefy/modules-mongodb/commit/a167d18871d59b544cfaa546f65d31aa3250b0e4) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix Activity tile missing user-related events on contact-detail. user-account and user-admin events tagged the same shared `user-contacts` record under `references.user_ids`, while the Activity tile filters on `contact_ids` — so events like `update-profile`, `invite-user`, `update-user`, `resend-invite`, and `create-profile` never surfaced on the contact's timeline. Since contacts and users live in one collection with one `_id` space, a user IS a contact. Renamed the reference field on those 5 events from `user_ids` to `contact_ids` so the existing single-field timeline match returns them. Event semantics (user vs. plain contact) stay encoded in the event `type`. Migration for existing event docs is the consuming app's responsibility — `db.log-events.updateMany({ user_ids: { $exists: true } }, [{ $set: { contact_ids: '$user_ids' } }, { $unset: 'user_ids' }])`.

- [#27](https://github.com/lowdefy/modules-mongodb/pull/27) [`24b8dd1`](https://github.com/lowdefy/modules-mongodb/commit/24b8dd1e389ef6aaeab8d4fa56f7f393187db32c) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix silent empty `display` payload on every event-emitting endpoint. The `_build.array.map` callback that builds per-app event display titles returned `{key, value}` objects, which `_build.object.fromEntries` (native `Object.fromEntries`) silently rejected as `{}` — so events landed in MongoDB without `title` or `description`. Switched callback bodies to a 2-element `[key, value]` array tuple to match the spec, and quoted `"0.0"` so YAML parses it as a path string instead of the float `0`. Affects 9 endpoints: `contacts/api/{create,update}-contact`, `companies/api/{create,update}-company`, `user-admin/api/{invite,update}-user`, `user-admin/api/resend-invite`, `user-account/api/{create,update}-profile`. Also fixed two latent typos (`_result` → `_step`) in `user-account/api/{create,update}-profile.yaml` that were hidden by the silent failure.

## 0.1.1

### Patch Changes

- [#20](https://github.com/lowdefy/modules-mongodb/pull/20) [`e4d608a`](https://github.com/lowdefy/modules-mongodb/commit/e4d608a664775a73737b75ea9ef7f9793a0eb7eb) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix plugin version constraints in module manifests. `@lowdefy/modules-mongodb-plugins` references updated from the invalid `^1` (no matching published version) to `^0.1.0`, and missing `version` declarations added for `@lowdefy/modules-mongodb-plugins` and `@lowdefy/community-plugin-xlsx` where the module validator required them.

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.
