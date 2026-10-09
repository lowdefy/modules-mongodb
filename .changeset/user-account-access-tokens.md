---
"@lowdefy/modules-mongodb-user-account": minor
---

The account page can show an Access tokens tile, where a signed-in member lists, creates and switches off their own MCP member tokens for their active organization. Set the new `mcp_tokens` var to `true` to turn it on; the app needs its MCP authorization server (`auth.oauthProvider`). A new token is shown once, with a copy button, and is gone once the dialog closes. Each create and switch-off is logged in the organization's audit log as `org-mcp-token-created` / `org-mcp-token-revoked`, with titles you can override through `event_display`. With `mcp_tokens` off (the default) nothing changes.
