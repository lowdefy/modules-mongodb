---
"@lowdefy/modules-mongodb-organizations": minor
---

New `mcp_tokens` var (default false). When true, the `security` settings page gets an Access tokens section listing every MCP member token in the active organization (member, name, start, created, expires, last used), where owners and admins switch any of them off through the new `revoke-mcp-token` endpoint (`RevokeOrgMcpToken`). It needs the app's MCP authorization server (`auth.oauthProvider`), which holds the tokens in `user-mcp-tokens`; the module reads that collection through a walled, read-only `user-mcp-tokens` connection, without the token hash.

The audit log shows `org-mcp-token-created` and `org-mcp-token-revoked`, whether a member saved them for their own token or an admin switched one off, under a new MCP tokens kind. Organization events carry `metadata.token_name` and `metadata.token_start` (null on other events), and `event_display` templates receive `token`.
