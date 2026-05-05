---
"@lowdefy/modules-mongodb-companies": patch
"@lowdefy/modules-mongodb-contacts": patch
"@lowdefy/modules-mongodb-events": patch
"@lowdefy/modules-mongodb-files": patch
"@lowdefy/modules-mongodb-layout": patch
"@lowdefy/modules-mongodb-notifications": patch
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-release-notes": patch
"@lowdefy/modules-mongodb-user-account": patch
"@lowdefy/modules-mongodb-user-admin": patch
---

Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.
