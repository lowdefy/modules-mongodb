# @lowdefy/modules-mongodb-contacts

## 0.2.0

### Minor Changes

- [#14](https://github.com/lowdefy/modules-mongodb/pull/14) [`1c912ee`](https://github.com/lowdefy/modules-mongodb/commit/1c912eebc030b951ceb402a0d74a855982a37005) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Add `ContactSelector` block and wire it into the `contacts` module as a reusable picker (`contacts.contact-selector` component). Search runs against an Atlas `$search` + `$match` pipeline (`search_contacts`), enrichment via `get_contacts_data`, and add/edit go through the existing `create-contact` / `update-contact` APIs (patched to accept the picker's payload shape). The `companies` form now consumes the picker for linked contacts.

  **Breaking — contacts module vars renamed:**

  - `all_contacts` (module, default `false`, company-scoped) → per-call `company_only_contacts` (default `false`, **unscoped**). The default flipped: callers that relied on the old company-scoped default must now pass `company_only_contacts: true` explicitly.
  - `verified` (module enum `off|trusted|untrusted`) → `use_verified` (module boolean, default `false`) + per-call `verified` (boolean). The module flag toggles the verification UI/payload writes globally; per-call `verified` decides the value each picker instance writes.
  - Removed: module-level `phone_label` (no-op since Task 4) and the per-call `payload` var (deprecated by per-key var pass-through).

  **Migration:**

  ```
  all_contacts: false       →  company_only_contacts: true   (per-call)
  all_contacts: true        →  company_only_contacts: false  (per-call, or omit)
  verified: trusted         →  use_verified: true (module) + verified: true  (per-call)
  verified: untrusted       →  use_verified: true (module) + verified: false (per-call)
  verified: off             →  use_verified: false (module, default)
  ```

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

- [#27](https://github.com/lowdefy/modules-mongodb/pull/27) [`24b8dd1`](https://github.com/lowdefy/modules-mongodb/commit/24b8dd1e389ef6aaeab8d4fa56f7f393187db32c) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix silent empty `display` payload on every event-emitting endpoint. The `_build.array.map` callback that builds per-app event display titles returned `{key, value}` objects, which `_build.object.fromEntries` (native `Object.fromEntries`) silently rejected as `{}` — so events landed in MongoDB without `title` or `description`. Switched callback bodies to a 2-element `[key, value]` array tuple to match the spec, and quoted `"0.0"` so YAML parses it as a path string instead of the float `0`. Affects 9 endpoints: `contacts/api/{create,update}-contact`, `companies/api/{create,update}-company`, `user-admin/api/{invite,update}-user`, `user-admin/api/resend-invite`, `user-account/api/{create,update}-profile`. Also fixed two latent typos (`_result` → `_step`) in `user-account/api/{create,update}-profile.yaml` that were hidden by the silent failure.

- [#19](https://github.com/lowdefy/modules-mongodb/pull/19) [`46234e1`](https://github.com/lowdefy/modules-mongodb/commit/46234e1fc925c64a848a660bb7bf16629114f946) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Rewrite the two linked-record sidebar tiles — contacts on company-detail and companies on contact-detail — from a broken antd-style `List` (`properties.dataSource` + `properties.renderItem`) to a plain `Html` block. Both tiles previously rendered blank; both now list the linked records with name + email / display name and link through to the record's detail page using `_module.pageId`.

  Adds an optional `{ label, value }` extension slot per tile under each module's `components` var group:

  - `components.contact_card_extra_fields` on the companies module — appends rows under each contact's name/email on the company-detail tile.
  - `components.company_card_extra_fields` on the contacts module — appends rows under each company's display name on the contact-detail tile.

  `value` must be a top-level key on the document as projected by `get_company_contacts` / `get_contact_companies`. Falsy primitives (`0`, `false`, `""`) render; only `null`/`undefined` are skipped.

  Plugin housekeeping: declare `@lowdefy/nunjucks` as a peer dependency of `@lowdefy/modules-mongodb-plugins`. The plugin's `parseNunjucks.js` imports it but the package wasn't declared anywhere — Turbopack failed to resolve it on fresh installs.

- [#31](https://github.com/lowdefy/modules-mongodb/pull/31) [`fcd328b`](https://github.com/lowdefy/modules-mongodb/commit/fcd328b031df108450147a91b87d85a508c1f008) Thanks [@Yianni99](https://github.com/Yianni99)! - Small UX fixes across modules and the EventsTimeline block:

  - `release-notes`: Empty-state fallback now triggers when `content` is null OR an empty/whitespace-only string. The previous `_if_none` only caught null, so consumers with an empty `CHANGELOG.md` saw a blank Card instead of the "No release notes available yet" message.
  - `companies` / `contacts` / `user-admin` table components: Added a conditional `overlayNoRowsTemplate` that renders "Loading…" while the `get_all_*` request is in flight and "No rows" once the request completes empty. Previously AG Grid's default "No Rows To Show" appeared during the initial load, indistinguishable from a genuinely empty result.
  - `EventsTimeline` (plugin): Avatar hover swapped from `<Popover>` to `<Tooltip>` so it matches the timestamp's TimeAgo style — same name-on-hover, lighter dark-tooltip styling.

## 0.1.1

### Patch Changes

- [#20](https://github.com/lowdefy/modules-mongodb/pull/20) [`e4d608a`](https://github.com/lowdefy/modules-mongodb/commit/e4d608a664775a73737b75ea9ef7f9793a0eb7eb) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix plugin version constraints in module manifests. `@lowdefy/modules-mongodb-plugins` references updated from the invalid `^1` (no matching published version) to `^0.1.0`, and missing `version` declarations added for `@lowdefy/modules-mongodb-plugins` and `@lowdefy/community-plugin-xlsx` where the module validator required them.

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.
