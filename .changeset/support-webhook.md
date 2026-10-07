---
"@lowdefy/modules-mongodb-support": minor
---

The `support` module takes Pelican's signed webhook at `support/webhook`. A delivery passes only with a valid `Pelican-Signature` made with the new `SUPPORT_WEBHOOK_SECRET` and a timestamp within five minutes, else it answers 401. Each ticket event writes the reporter view into the copy of the user it names, creating the row for a ticket the team logged, and never rolls a newer view back. Each new team message sends the user the module's `support-reply` notification (bell and email, to the address the app holds for them, keyed per message). The app lists `support/webhook` in `auth.api.public` and sets the webhook address in Pelican.
