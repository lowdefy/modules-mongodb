---
"@lowdefy/modules-mongodb-ai-reporting": minor
"@lowdefy/modules-mongodb-plugins": patch
---

ai-reporting: rename the `reporting` module to `ai-reporting`, and declare the AI gateway plugin it needs

The module is an AI surface — a chat that authors MongoDB pipelines against a catalog you
supply, and saves the answers as reports — but `reporting` named it as though it were a
static report renderer. `ai-assistant` already signals its nature in its name; this brings
the reporting module in line, so the module list reads as what each module actually is.

**Migration.** Point the `source` at the new path:

```yaml
modules:
  - id: ai-reporting
    source: "github:lowdefy/modules-mongodb/modules/ai-reporting@v0.36.0"
```

The entry `id` is yours to choose, and it is what scopes page URLs — `- id: ai-reporting`
serves the chat at `/ai-reporting/chat`. Renaming the entry alongside the source is the
recommended move and is what the demo and the docs now show, but it will break existing
bookmarks and any hard-coded links into the module's pages. Keep `- id: reporting` if you
would rather leave URLs where they are; nothing else depends on the entry being renamed.

Nothing inside the module was renamed. The `reporting-data` connection, the
`REPORTING_MONGODB_URI` and `REPORTING_DATA_MONGODB_URI` secrets, the `ReportingData`
connection type, the `_analytics` operator, the `reporting-assistant` agent and the
`lowdefy-reporting-catalog` bin all keep their names — so no connection remaps, no secret
renames, and no catalog regeneration. Documentation moved from `docs/reporting/` to
`docs/ai-reporting/`, which is the only change the catalog bootstrap CLI reflects: the
header comment it writes into a generated catalog now cites the new doc paths.

**The manifest now declares `@lowdefy/connection-ai-gateway`.** The module ships an `ai`
connection (`type: AIGateway`) and the reporting assistant (`type: AIGatewayAgent`), both
types from that package, but it never declared it — leaving each consuming app to know it
had to add the plugin itself, and to pick its version. If you were adding it by hand you
can drop it, unless your app declares an AI gateway connection or agent of its own.

That gap had teeth. The plugin's newest stable release, `5.5.1`, keys agent tools by
`endpointId` rather than by the configured tool `name`, and a module-scoped endpoint id
contains a `/` — which providers reject against the tool-name pattern
`^[a-zA-Z0-9_-]{1,128}$`, failing every chat turn with a 400 while the built agent config
looked entirely correct. The manifest therefore pins an exact version rather than a range,
because `^5` resolves straight back into the bug.
