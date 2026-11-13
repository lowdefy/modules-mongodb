---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-ai-reporting": minor
---

**ai-assistant, ai-reporting:** The chat refuses a typed message that looks like personal information before it is sent. An email address, nine or more digits with only spaces between them (ID, bank and account numbers), a South African phone number or a South African passport number stops the send: the chat shows "This looks like personal information. Please remove it and describe the task instead." and keeps the text in the composer, and nothing reaches the agent.

- **On by default.** New vars on both modules: `pii_guard` (`true`; `false` turns the check off), `pii_patterns` (the regex list; setting it replaces the default) and `pii_guard_message`.
- **ai-reporting gains `on_before_send`**, the same seam ai-assistant has, run after the guard.
- **The reporting agent** answers a message with personal information in it with a short reminder that personal details aren't needed, then the answer, without repeating them.
- **Upgrade:** nothing to change. Check that your users don't ask about long numbers the guard now blocks, such as purchase orders (`PO 4500012345`); if they do, set `pii_patterns` with your information officer's agreement. Message editing skips the check, so keep it off while `pii_guard` is on. See `docs/shared/personal-information.md`.
