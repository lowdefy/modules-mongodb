---
"@lowdefy/modules-mongodb-activities": major
"@lowdefy/modules-mongodb-ai-assistant": major
"@lowdefy/modules-mongodb-ai-reporting": major
"@lowdefy/modules-mongodb-companies": major
"@lowdefy/modules-mongodb-contacts": major
"@lowdefy/modules-mongodb-deals": major
"@lowdefy/modules-mongodb-events": major
"@lowdefy/modules-mongodb-files": major
"@lowdefy/modules-mongodb-layout": major
"@lowdefy/modules-mongodb-notifications": major
"@lowdefy/modules-mongodb-organizations": major
"@lowdefy/modules-mongodb-release-notes": major
"@lowdefy/modules-mongodb-support": major
"@lowdefy/modules-mongodb-user-account": major
"@lowdefy/modules-mongodb-user-admin": major
"@lowdefy/modules-mongodb-walkthroughs": major
"@lowdefy/modules-mongodb-workflows": major
"@lowdefy/modules-mongodb-plugins": major
---

**Breaking: the modules need Lowdefy 7.** This release moves every module and the plugins package to Lowdefy 7 and its auth engine, page paths, tenant wall, websockets and Lucide icons. Apps on Lowdefy 5 or 6 stay on the previous release.

To upgrade, move the app to Lowdefy 7 (`lowdefy upgrade` applies the framework codemods), then work through the breaking entries in this release, chiefly:

- **Icon names** are Lowdefy 7 semantic and Lucide names; icon names an app passes into module vars need the same rewrite.
- **`app_name` is gone.** Declare `slug:` on the root of `lowdefy.yaml` and drop the var from every module entry.
- **`user-account` and `user-admin` run on the Better Auth engine**, with contacts linked to their auth user and organization authority separate from app roles.
- **Search:** `request_stages.filter_match` takes plain `$match` clauses, the new `atlas_search` var picks Atlas `$search` or a regex fallback, and the Atlas Search index contract changes.
- **Events:** `contact_page_url` is replaced by `contact_page_id`.
- **ai-reporting:** the app lists the module's `report-policy` in `policies.dynamicBlocks`, and the report endpoints return `report_id` without `url`.
- **`profile.picture`** is derived by every write, and `create-contact` mints the contact `_id` itself.
