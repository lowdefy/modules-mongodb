---
"@lowdefy/modules-mongodb-support": minor
---

The `support` module has a help button: its `launcher`, `requests` and `on-init` components go in the layout's `global_blocks`, `global_requests` and `global_events.onInit`. The button shows to a signed-in user in an app built with `SUPPORT_PELICAN_KEY`, and opens a panel that leaves the page usable. Its New report form takes a type, a title, a description and up to five images or PDFs (a screenshot of the page behind the panel, or files dropped, chosen or pasted), and files the ticket with the page, the browser's details and the tab's recent errors. A refused or failed send keeps the draft and says why; nothing is resent on its own.
