# 02 — QR-code block plugin

**Context**: TOTP enrolment (the account security tile's enrol-totp modal, task 18)
renders the `totpURI` returned by `TwoFactorEnable` as a scannable QR code. No
built-in Lowdefy block does this (design.md — Module surface, implementation note),
so `@lowdefy/modules-mongodb-plugins` gains a small QR block. (The `two-factor`
challenge page, task 14, is the sign-in code entry — no QR there.)

**Task**: Author a React block plugin that renders a QR code from a URI prop, with
the URI shown as copyable text as a fallback (for authenticator apps that accept
manual entry). Register it in the `@lowdefy/modules-mongodb-plugins` package so the
module's `plugins:` entry picks it up.

**Acceptance Criteria**:

- Block accepts a `value`/`uri` prop and renders a QR image for it.
- Copyable text fallback of the raw URI is shown.
- Block is exported from the plugins package and resolvable from module pages.
- `pnpm ldf:b` resolves the block type.

**Files**:

- `plugins/modules-mongodb-plugins/src/blocks/*` (new QR block)
- Plugin package index/registration
- `docs/plugins/*` reference stub (full docs in task 19)

**Notes**:

- Independent of the module scaffold — can run in parallel with 01.
- Use the `lowdefy-docs` MCP (`lowdefy_list_plugins` / `lowdefy_get_plugin_doc`, and the `plugins/plugins-dev` doc) for the block-plugin authoring pattern.
- Keep it minimal — one canonical QR block, copyable-text fallback, no speculative
  options (CLAUDE.md — build for concrete needs).
