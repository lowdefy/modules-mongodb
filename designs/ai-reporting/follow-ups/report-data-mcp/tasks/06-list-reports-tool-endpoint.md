# Task 6: The MCP-facing `list-reports` sibling

## Context

`list-reports` is the right shape for an MCP tool but cannot be listed as one: it
carries neither `description` nor `payloadSchema`, so it is a hard build error the
moment it appears in an `mcp` block. And the MCP surface should be **narrower** —
its `scope` parameter accepts `deleted`, and the recycle bin is a UI affordance;
an external agent pulling report data has no business enumerating soft-deleted
reports.

That narrowing has to live in a **routine guard**, not in a `payloadSchema`
(which is never validated at runtime), and that is the real reason this is a
sibling endpoint rather than an annotation on `list-reports`: it needs a
different guard, not just a different schema.

**But the sibling must not reimplement `list-reports`.** That file is 309 lines,
and the five per-scope `$match` branches in its `_switch`
(`list-reports.yaml:56-124`) _are_ the authorization boundary — its own comment
says "a bug in it is a confidentiality bug rather than a display bug". Copying
them is the duplication this design condemns, at the largest scale available.

Lowdefy has the mechanism: a routine step of `type: CallApi` invokes another
endpoint. Verified mechanics — `handleEndpointCall.js` stores the target's return
value as the step's result (`addStepResult` with `result: response`) so the
caller can return it unchanged, propagates a `:reject` from the target up to the
caller, and `invokeEndpoint.js:26` runs `authorizeApiEndpoint` on the target, so
the delegation is not an authorization bypass. In-repo precedent:
`modules/contacts/api/update-contact.yaml:56-63`,
`modules/user-admin/api/invite-user.yaml`, `update-user.yaml`.

## Interfaces

- **Consumes:**
  - `_ref: { path: defaults/signed_in_guard.yaml, vars: { message } }` (task 1)
  - the existing `list-reports` endpoint, unchanged, via
    `_module.endpointId: list-reports`
- **Produces:** endpoint id `list-reports-tool`, type `Api`, exported from the
  manifest. Task 8 calls it; task 9 documents it.

## Task

1. Create `modules/ai-reporting/api/list-reports-tool.yaml`, `type: Api`. Header
   comment: what it is, that it delegates, and why it exists separately (the
   narrower scope set needs a guard).

2. `description` — reports the caller may see, for a given scope, one of `mine`,
   `shared`, `favourites`, `all`. Say that each result's `id` is what the
   report-detail and report-data tools take. Do not hardcode sibling tool names
   (they carry the module entry id, which the app chooses).

3. `payloadSchema` — object, `scope` required, `enum: [mine, shared, favourites,
all]`, plus the optional `search` and `sort` `list-reports` already accepts,
   each with a `description`.

4. Routine — three steps:
   - the signed-in guard `_ref`, message
     `You must be signed in to list reports.`
   - a scope guard rejecting anything outside
     `[mine, shared, favourites, all]`. Follow `list-reports.yaml:34-44`: reject
     rather than default, because choosing a scope for the caller means choosing
     which reports they may see, and `_payload` of an absent key resolves to
     `null` so an omitted scope lands here too. **`deleted` is rejected here** —
     with a message saying so specifically, since a caller passing it has made a
     comprehensible mistake and deserves better than "unrecognised scope".
   - `type: CallApi` delegating to `list-reports`, then return the step result:

     ```yaml
     - id: delegate_list
       type: CallApi
       properties:
         endpointId:
           _module.endpointId: list-reports
         payload:
           _payload: true
     - :return:
         _step: delegate_list
     ```

     `_payload: true` resolves to a copy of the whole payload
     (`getFromObject.js:17-18` — `params === true` means `all: true`).

5. **Re-run the guards rather than relying on the target's.** The signed-in and
   scope guards are duplicated with `list-reports` on purpose: a delegated call
   must never depend on the target's guards being the only ones, because the
   target's guard set can change. The _authorization boundary_ is not duplicated
   — that stays in `list-reports` alone.

6. Wire the manifest: `- _ref: api/list-reports-tool.yaml` in `api:` and an
   `exports.api` entry.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds and
  `apps/demo/.lowdefy/server/build/api/ai-reporting/list-reports-tool.json`
  carries a `description` and a `payloadSchema`.
- The file is under ~60 lines including comments and schema. If it is
  approaching `list-reports`' size, the aggregation has been copied and the task
  has been done wrong.
- No `$match`, `$facet` or `$project` stage appears in the file.
- Behavioural coverage lands in task 8: `deleted` rejected here while still
  working on `list-reports` itself.

## Files

- `modules/ai-reporting/api/list-reports-tool.yaml` — create
- `modules/ai-reporting/module.lowdefy.yaml` — modify — `api:` ref and
  `exports.api` entry

## Notes

- **Endpoint id naming.** `list-reports-tool` follows the in-repo precedent of
  `query-data-tool.yaml`, the agent-facing variant of `query-data`. Note that the
  design's **Goal** section still names the tool `ai-reporting__list-reports`,
  which is inconsistent with its own decision to build a sibling — the tool name
  will be `ai-reporting__list-reports-tool`. Raise that as a one-line design
  correction; do not resolve it by renaming this endpoint to collide with the
  existing one.
- The vocabulary collision is worth keeping straight while writing the schema
  descriptions: this `scope` payload parameter (which reports) is unrelated to the
  MCP `mcp:read` tool `scope` tag (which permission).
- `list-reports.yaml` itself is **not modified** by this task. It keeps serving
  the UI with all five scopes, `deleted` included.
