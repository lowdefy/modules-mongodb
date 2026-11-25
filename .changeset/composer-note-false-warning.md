---
"@lowdefy/modules-mongodb-ai-assistant": patch
"@lowdefy/modules-mongodb-ai-reporting": patch
---

**`composer_note: false` no longer warns on every page.** Hiding the note under the chat's composer passed `false` to a Paragraph as its text, so the dev server showed `Block "Paragraph" property "content" must be type "string"` on every page with the chat panel. The note's text is now an empty string when the var is `false`, and the note stays hidden as before. Nothing to change on upgrade.
