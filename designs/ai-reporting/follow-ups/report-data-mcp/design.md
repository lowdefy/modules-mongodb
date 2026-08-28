# Report-data MCP (DRAFT)

> **Status: draft, updated 2026-08-28.** The original crux — identity and
> authorization for MCP callers — is now resolved by a Lowdefy platform
> feature (verified against the framework source and published experimental
> packages, see below). What remains open is adoption timing and the module
> packaging details, not the security model.

A saved report already resolves to structured data — the open engine runs each
section's validated pipeline and returns rows (KPI values, table rows, the rows
behind each chart). Today that data only ever renders inside the reporting UI.
The idea: expose it over an MCP server so a user can reference a report by id and
pull its resolved data into _their own_ agent, then build a presentation, a
narrative, a spreadsheet — whatever — from it, without re-deriving the queries.

## The platform feature this builds on

Lowdefy ships (in experimental releases — see **Version status** below) a
first-class **MCP server surface**: a top-level `mcp` block in `lowdefy.yaml`
exposes the app's own `Api` endpoints as MCP tools, served at `POST /api/mcp`
over streamable HTTP. This is not the dev-server docs MCP (`/lowdefy-docs/mcp`,
dev tooling only) — it is a product surface available in production builds.

Verified behaviour (from `@lowdefy/api` `routes/mcp/createMcpServer.js` and
`@lowdefy/build` `buildMcp.js` in the current experimental release):

- **Config surface:**

  ```yaml
  mcp:
    name: my-app-tools # serverInfo; title/websiteUrl/icons optional branding
    endpoints:
      - id: reporting/list-reports
        scope: mcp:read
      - id: reporting/get-report-data
        scope: mcp:read
  ```

- **Tools are just API endpoints.** Each exposed endpoint must be type `Api`
  (`InternalApi` fails the build), and must carry a `description` and a
  `payloadSchema` — the schema becomes the MCP tool's `inputSchema`, so
  clients know exactly what arguments to pass. Tool names are the endpoint id
  with `/` → `__` (so module-scoped ids survive as legal tool names).
- **Agent tools were removed** from the `mcp` block (`mcp.agents` is a build
  error with a removal notice). Endpoints are the only tool kind.
- **Authorization is the app's own auth, not a parallel scheme.**
  - Tool listing and tool calls run through the same per-caller
    `context.authorize` as pages and API endpoints; unauthenticated MCP
    clients see only public tools.
  - Protected or role-gated tools **require `auth.oauthProvider`** — the app
    acts as its own OAuth authorization server (consent page, dynamic client
    registration, JWKS, resource binding), so MCP clients such as claude.ai
    connectors or Claude Code run a standard OAuth flow and present bearer
    tokens. The build fails if a non-public endpoint is exposed without it.
  - The resolved caller is a real app user: `_user` in the endpoint routine
    is populated, so **owner scoping (`owner.user_id`) and per-viewer role
    gates carry over unchanged** — the exact property the original draft
    flagged as the unresolved crux.
  - A second gate on this surface only: each tool carries a `scope` tag
    (`mcp:read` | `mcp:write`, write implies read) checked against the
    OAuth token's granted scopes, both at listing and at call time.
  - A role or scope shortfall answers identically to an unknown tool name,
    so gated tools cannot be enumerated.

### Version status (verified 2026-08-28)

- Stable `@lowdefy/api` (5.6.0) does **not** contain the MCP server route.
- The pinned version in this repo (`0.0.0-experimental-20260814133003`) also
  predates it.
- Current experimental releases (verified `0.0.0-experimental-20260828095120`)
  ship `routes/mcp/createMcpServer.js` plus the OAuth resource lifecycle
  (`getMcpJwks.js`, `getMcpResourceBinding.js`, `oauthResourceLifecycle.js`).
- The framework's `feat/agents-external-api-mcp-channels` branch holds an
  earlier iteration (API-key/JWT `auth.strategies`, agent tools, external
  agent API); the shipped experimental moved protected MCP to the app's own
  OAuth provider and dropped agent tools. Design against the experimental
  package, not that branch.

Adopting this feature therefore means **bumping the repo's Lowdefy pin** to an
experimental release that carries it (and absorbing whatever else moved
between 08-14 and that release), or waiting for it to land in a stable line.

## Goal

Expose the reporting module's saved reports as MCP tools so an external agent
can consume a report's data directly:

- `list_reports` — reports the caller may see.
- `get_report` — a report's spec/metadata (sections, filters, titles).
- `get_report_data` — resolve a report (optionally with filter values) and
  return its section rows as structured JSON.

With the platform feature, each of these is simply a module `Api` endpoint
with a `description` and `payloadSchema`, listed in the consuming app's `mcp`
block with `scope: mcp:read`.

## What this reuses

- **Resolution already exists.** `resolve-report` / the `AnalyticsPipeline`
  connection and `query-data` / `chart-data` endpoints already turn a saved spec
  into rows through the validated engine. The MCP tools call the _same_
  resolution path — one correct way. Most likely the MCP-facing endpoints are
  thin wrappers (or direct exposure) of existing endpoints once those carry
  `payloadSchema` + `description`.
- **Saved specs** live in the `report_layouts` collection (`reports_collection`
  var). `list`/`get` read from there.
- **The catalog is the authorization boundary**, bound at the connection, and the
  data connection uses a read-only principal — the same properties the UI relies
  on carry over.
- **Identity and role gates** — resolved by the platform (above): the MCP
  caller is an authenticated app user, `_user` works in routines, so scope
  filters and per-viewer section gates apply exactly as in the UI. No module
  work needed to get this; the module's job is to keep using `_user` the same
  way in the MCP-facing endpoints.

## Remaining open questions

- **Version adoption.** When to move the repo to a Lowdefy version carrying
  the MCP server (and `auth.oauthProvider`). This is the gating dependency.
- **Module packaging.** Does the module manifest declare which endpoints are
  MCP-suitable (leaving the app to list them in its `mcp` block with the
  module-scoped ids), or does the modules system grow an `mcp` export? The
  `mcp` block is app-level config today; endpoint ids are entry-scoped
  (`{entryId}/{endpointId}`), which the `/`→`__` tool-name rule handles.
- **Endpoint shape.** Whether to expose the existing `resolve-report` /
  `query-data` endpoints directly (adding `payloadSchema` + `description`)
  or add dedicated `mcp`-facing endpoints with a friendlier envelope. The
  consuming agent wants something self-describing — likely a normalized
  envelope (section id, type, columns, rows) over raw section rows.
- **Filter parameters.** `get_report_data` should accept filter values via
  `payloadSchema`, reusing the same filter-binding the UI uses; the schema
  makes the accepted filters discoverable to the client.
- **Publish/share interaction.** The platform enforces roles; whether report
  visibility over MCP should track the existing publish/`share_roles` model
  needs a decision — the natural answer is yes, since the endpoints read the
  same collections through the same `_user`-scoped queries as the UI.
