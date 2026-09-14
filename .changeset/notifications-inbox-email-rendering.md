---
"@lowdefy/modules-mongodb-notifications": patch
---

**The notifications inbox reads like part of the app.** Selecting a notification used to show the stored email exactly as the mail was built — a grey canvas, a second white card inside the page's card, the logo, the sign-off and the "you're receiving this email because…" footer, all in the email's own fonts and colours. That chrome belongs in a mailbox, not in the app. The inbox now shows only the message itself — text, details, quotes and the action button — in the app's own typography, under the title and date it already displays. Emails are unchanged.

The list has been restyled to match: each notification is a row with its type icon in a tinted circle, the title, a two-line preview that ends in an ellipsis instead of stopping mid-sentence, the time it arrived, and a dot on unread items. The selected row is highlighted in the app's primary colour. Everything takes its colours, radius and shadows from the app's theme, so the inbox follows each app's look, including dark mode.

Each notification type now gets its own colour and icon from the app's event types; types without an entry still get a distinct colour of their own, chosen consistently from the app's palette, so a glance at the list tells the kinds apart. The popup toasts use the same look.
