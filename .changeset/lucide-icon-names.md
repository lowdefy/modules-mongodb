---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-activities": minor
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-ai-reporting": minor
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-deals": minor
"@lowdefy/modules-mongodb-notifications": minor
"@lowdefy/modules-mongodb-organizations": minor
"@lowdefy/modules-mongodb-release-notes": minor
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
"@lowdefy/modules-mongodb-workflows": minor
---

**Breaking: icon names are Lowdefy 7 semantic and Lucide names.** Lowdefy 7 replaces react-icons with Lucide and fails the build on a react-icons name, so every `AiOutline*`, `AiFill*` and `Lu*` name in the modules and the plugin blocks is rewritten with the `@lowdefy/codemods` `v7-0-0/react-icons-to-lucide.json` table: a semantic name (`edit`, `delete`, `mail`) where one fits, otherwise the Lucide name (`Waypoints`, `FileSpreadsheet`).

The modules now need a Lowdefy version with Lucide icons. Glyphs the table marks for review: filled status icons (`check-circle`, `close-circle`, `CircleAlert`) are outline, the FileManager's PDF and Word icons are both `FileText` and its Excel icon is `FileSpreadsheet`, and the Cluster icon is `Waypoints`.

Apps that pass icon names into module vars (menu entries, enum `icon` fields, `event_types`) need the same rewrite; `lowdefy upgrade` applies it.
