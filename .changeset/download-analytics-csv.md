---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-ai-reporting": patch
---

The plugin's CSV download action is now `DownloadAnalyticsCsv`, so `DownloadCsv` is Lowdefy's own action again. The plugin's action had the same name and replaced Lowdefy's in every app that loads the plugin, so a `DownloadCsv` with `fields` ignored `fields` and wrote every key of every row, nested objects as JSON.

The ai-reporting module uses the new name already. If your app calls `DownloadCsv` with `columns`, it still builds and runs after this upgrade, but Lowdefy's action ignores `columns`, so the file's columns change. Switch it to `DownloadAnalyticsCsv` (same params), or keep `DownloadCsv` and pass `fields`.
