---
"@lowdefy/modules-mongodb-support": minor
---

The `support` module files tickets and posts messages. `create-ticket` and `post-message` check what the browser sent (the type, the lengths, at most five files, each under the user's own `support/{user id}/` upload prefix) and refuse it as a `fix` error before Pelican is called. Files go to the app's own files bucket through the module's upload policy, and Pelican is sent a 15-minute link per file to copy. The server adds the app, environment, version and organisation to every ticket's context. Neither endpoint retries on its own. `send-ticket` and `send-message` are their checked cores, for the agent tools.
