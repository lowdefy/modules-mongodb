---
"@lowdefy/modules-mongodb-release-notes": minor
---

**release-notes:** What's new is now a reading page. The heading, the uppercase "Version" kicker, the cards and the New tags are gone. Notes are one-line rows (headline and date) with a gold dot while unread. The shown note is open beside them: its date in grey, the headline and the body with its images and videos. With no notes the page says "Nothing new yet." The email switch is one row at the foot of the note. On a phone the one-line rows sit above the note, newest first.

- New exported component `get_unread_release_notes_count`: a request of the same name that counts the signed-in person's unread notes as `[{ total }]`. Add it to a page's `requests` or the layout's `global_requests`, fire it with a `Request` action, and read `_request: get_unread_release_notes_count.0.total` to show a "New" mark while it is above zero. Block ids `note_kicker`, `notes_title` and `notes_empty_text` are removed; the date is `note_date`.
- New var `about`: one sentence on what the page is for, handed to the layout page component as `about`. A layout that shows a page's `about` on its last crumb uses it in place of the heading; other layouts ignore it.

Migration: if your app styles or tests the removed block ids, update them. If your layout shows a heading from `hide_title`, nothing changes; the page has none.
