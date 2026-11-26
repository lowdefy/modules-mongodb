---
"@lowdefy/modules-mongodb-release-notes": patch
"@lowdefy/modules-mongodb-files": patch
---

**An announced release note reaches everyone again.** Two faults stopped delivery before any bell rang:

- The files module's `files-bucket-public` connection now allows writes. Release-notes copies a note's images and videos into that bucket, and every copy failed while the connection was read-only.
- `deliver` now copies all of a note's media and notifies batch after batch in one call, starting new work only in the call's first 20 seconds, and calls itself again at most once. It used to do one file or one batch of 100 people per call and call itself without limit, and Vercel answers `508` to the third detached call in a chain, so a note with two or more media files, or more than about 200 recipients, never finished. The chain's second call sends notices only, so slow media copies can't hold them back. Work left at the end of the chain waits for the sweep.

Nothing to change to upgrade, as long as the app's functions may run for 5 minutes (`maxDuration: 300` on Vercel), since a media copy may take 4. Keep the `release-notes/sweep` cron every 10 minutes. Any `files-bucket-public` request in your app can now write to the public bucket. Upgrade every module and `@lowdefy/modules-mongodb-plugins` together, as always.
