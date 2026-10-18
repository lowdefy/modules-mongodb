---
"@lowdefy/modules-mongodb-release-notes": minor
---

**release-notes:** an announced release note now reaches the app's members. `release.announced` stores the note and a recipient row per person the audience reaches, and answers `{ notified, emailed, opted_out }`. A detached `deliver` chain copies the note's images and videos into the public files bucket and sends each person one `release-note` notification per version, in the bell and by email. The new exported `sweep` endpoint restarts a chain that stalled. The module now depends on `events`, for change stamps.

Migration:

- Set `CRON_SECRET` in the app's environment, which detached endpoint calls need.
- Add an app endpoint that calls `release-notes/sweep` every 10 minutes with a `schedules:` cron, as the module docs show.
- Install the `events` module if the app does not have it.
