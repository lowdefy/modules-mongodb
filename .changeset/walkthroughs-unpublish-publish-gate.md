---
"@lowdefy/modules-mongodb-walkthroughs": minor
---

walkthroughs: Unpublish, and let the consuming app gate Publish

- An Unpublish button in the editor and an `unpublish-walkthrough` endpoint take a published walkthrough down. Its steps move back into the draft, so nothing is lost, and publishing again brings it back. A new `on_unpublished` var runs after it, like `on_published`. A walkthrough that was ever live carries an `unpublished` stamp and can't be deleted, since links to it may remain.
- New `publish_blocked` and `publish_blocked_reason` vars on the `editor` component. While `publish_blocked` is true, Publish stays disabled and its tooltip gives the reason, so an app can require something, such as a category, before a walkthrough goes live.
- New `publish_pending` var keeps Publish enabled when the walkthrough has no unpublished edits, for an app setting that goes live only when published.
