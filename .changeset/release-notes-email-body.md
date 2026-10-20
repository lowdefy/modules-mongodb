---
"@lowdefy/modules-mongodb-release-notes": minor
"@lowdefy/modules-mongodb-notifications": minor
---

**release-notes:** the release note email now shows the note's body, with its headings, lists, links and images, and a footer link to turn release emails off on What's new. A video in the note becomes a link to the note on What's new. Pelican's new `release.test` event sends that email to one address, so the team can check it before announcing; it writes nothing and rings no bell.

**notifications:** a new exported `send-email` endpoint renders one notification and emails it to one address without storing it, for test sends.

Migration:

- An app that restyles the email with `email_template` adds the body to its copy of the template, as the module docs show. Without it, its email carries no body.
