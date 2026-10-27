---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-ai-reporting": patch
---

**Breaking:** the plugin's CSV download action is renamed from `DownloadCsv` to `DownloadAnalyticsCsv`. If your app calls `DownloadCsv` with `columns`, it still builds and runs after this upgrade, but it now runs Lowdefy's own `DownloadCsv`, which ignores `columns`, so the file's columns change without an error. Switch it to `DownloadAnalyticsCsv` (same params), or keep `DownloadCsv` and pass `fields`.

The plugin's action had the same name as Lowdefy's and replaced it in every app that loads the plugin, so a `DownloadCsv` with `fields` ignored `fields` and wrote every key of every row, nested objects as JSON. `DownloadCsv` is Lowdefy's action again. The ai-reporting module uses the new name already.
