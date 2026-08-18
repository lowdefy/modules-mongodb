# Report-data MCP (DRAFT)

> **Status: draft.** A starting sketch and open questions, not a settled plan.
> The security model in particular is unresolved and is the crux of the design.

A saved report already resolves to structured data — the open engine runs each
section's validated pipeline and returns rows (KPI values, table rows, the rows
behind each chart). Today that data only ever renders inside the reporting UI.
The idea: expose it over an MCP server so a user can reference a report by id and
pull its resolved data into _their own_ agent, then build a presentation, a
narrative, a spreadsheet — whatever — from it, without re-deriving the queries.

The repo already ships one MCP surface as prior art (`lowdefy-docs`, served by
the dev server and registered in `.mcp.json`), so the pattern of a Lowdefy app
serving MCP tools is established. This is a _product_ MCP rather than a
dev-tooling one.

## Goal

An MCP server, exposed by an app that runs the reporting module, offering tools
roughly like:

- `list_reports` — reports the caller may see.
- `get_report` — a report's spec/metadata (sections, filters, titles).
- `get_report_data` — resolve a report (optionally with filter values) and
  return its section rows as structured JSON.

so an external agent can consume a report's data directly.

## What this can reuse

- **Resolution already exists.** `resolve-report` / the `AnalyticsPipeline`
  connection and `query-data` / `chart-data` endpoints already turn a saved spec
  into rows through the validated engine. The MCP tools should call the _same_
  resolution path, not a parallel one — one correct way.
- **Saved specs** live in the `report_layouts` collection (`reports_collection`
  var). `list`/`get` read from there.
- **The catalog is the authorization boundary**, bound at the connection, and the
  data connection uses a read-only principal — the same properties the UI relies
  on carry over.

## The hard part: identity and authorization

This is the whole design, and it is unresolved. The UI resolves a report _as the
logged-in user_ — scope filters match `owner.user_id`, per-viewer role gates
decide which sections/filter-options a viewer may see. An MCP client is not
inside that session. Open questions:

- **Who is the caller?** How does the MCP request carry an authenticated identity
  that maps to a `_user` the engine can authorize against? Bearer token,
  app-issued key, OAuth like the claude.ai MCP connectors? Without this, every
  other decision is premature.
- **Does the role gate still apply?** A report the owner can see may contain
  sections a different viewer cannot. Pulling data over MCP must apply the _same_
  per-viewer gate, not bypass it because "it's an API now".
- **Read-only, and how far.** `get_report_data` must never be a write or a
  wider-than-catalog query path. It should be the resolve path and nothing else.
- **Publish/share interaction.** Does MCP access track the existing
  publish/`share_roles` model, or is it a separate grant?

## Open questions (beyond auth)

- **Transport/hosting.** The dev-server MCP is fine for local docs; a product MCP
  needs a real deployment story (where it runs, how it's addressed per app).
- **Filter parameters.** Should `get_report_data` accept filter values so the
  caller can pull a specific slice, reusing the same filter-binding the UI uses?
- **Shape of the returned data.** Raw section rows, or a normalized envelope
  (section id, type, columns, rows)? The consuming agent wants something
  self-describing.

## Not yet decided

Everything downstream of the identity question. Resolve **who the caller is and
how they're authorized** first; the tool surface is straightforward once that is
fixed.
