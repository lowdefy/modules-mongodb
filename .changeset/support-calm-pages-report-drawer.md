---
"@lowdefy/modules-mongodb-support": minor
---

**support:** a person can report a problem without the help button or an assistant, and the Support pages are calmer.

New for apps:

- **`report-drawer` component** (for the layout's `global_blocks`) and **`open-report` action** (for any button's `onClick`): the report form in a drawer, opened with a draft filled in from `type`, `title`, `body` and `context` (each a value or a runtime operator; `context` is an object sent under the ticket's `context.extra`). Nothing calls a model, so it works with `launcher.show: false` and while an assistant is paused. `report-drawer` takes an optional `secondary` var: blocks shown under the composer, such as a link to the app's own assistant. Wire the `requests` and `on-init` components as for the help button, since the drawer declares an upload policy and resets its draft there.
- **`get-awaiting-reply-count` component**: a request, `get_awaiting_reply_count`, counting the signed-in person's tickets in `needs_your_reply` in their organisation. Declare it on a page or among `global_requests`, fire it with a `Request` action and read `_request: get_awaiting_reply_count.0.total` for a menu item or badge.
- **Replying on a ticket marks its `support-reply` notifications read**, change-stamped, so the bell stops asking once the person has answered.

Changed:

- **Support page**: one `Support` crumb with a line on what the page is for, a Report a problem button, and Open N and Resolved N tabs in place of the search box, the status switch and the type selector. A search box shows only past ten tickets. Rows lead with the stage's icon and word, then the title and date; the key, type tag and unread dot are gone, and a bold title marks a ticket that waits for a reply. An empty list says "Tell us what went wrong"; nothing open says "Nothing open. Show resolved N."
- **Ticket page**: crumbs `Support / {title}`, one line of stage, type, date and key, the thread names the signed-in person "You", and the reply box says "Press ⌘ ↵ to send".
- **A failed check for replies** is one grey line, "Couldn't check for replies.", with a Try again button, on the page and in the thread, in place of the yellow banner.
- `enums/stages.yaml` gains an `icon` and a `color` for each stage.

Nothing to change in an app that only uses the help button. The report form's ids, state keys and upload policy are now set per surface; the help button's panel keeps its own (`support_report.*`, `upload_policy_support_report_files`).
