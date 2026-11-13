---
type: shared
module: shared
title: Personal information in AI chats
concepts:
  - pii_guard
  - pii_patterns
  - personal information
  - POPIA
---

# Personal information in AI chats

The two AI chat modules, [`ai-assistant`](../ai-assistant/index.md) and [`ai-reporting`](../ai-reporting/index.md), refuse a typed message that looks like personal information before it leaves the browser. Both use one list of patterns, so an app gets the same check in either chat, and the server-side masking uses the same list.

## The guard

While `pii_guard` is true (the default), the chat's `onBeforeSend` starts with one `Throw`. It tests the typed text against the module's `pii_patterns`, joined with `|` into one regex. On a match the send is cancelled: the chat shows `pii_guard_message` (default "This looks like personal information. Please remove it and describe the task instead."), the text stays in the composer for the user to edit, and nothing is posted to the agent. An app's own `on_before_send` actions run after the guard, so they never see a message it refused.

| Var                 | Default                 | What it does                                                           |
| ------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `pii_guard`         | `true`                  | `false` leaves the guard out of the build: every message is sent.      |
| `pii_patterns`      | the four patterns below | Regex sources (JavaScript syntax). Setting it replaces the whole list. |
| `pii_guard_message` | the sentence above      | What the user sees when a send is refused.                             |

The guard runs in the browser, so it stops an honest user, not a determined one. Some sends skip it:

- **Message editing.** An edited message is resent without `onBeforeSend`. Keep editing off while `pii_guard` is on: in `ai-assistant`, leave `edit` out of `message_display.actions` (it is off by default); `ai-reporting` has no edit control.
- **The chat block's `sendMessage` method**, and anything that calls it, such as `ai-assistant`'s `open-with-prompt`. The prompt there is the app's own text, not the user's.
- **Welcome prompts and suggestion chips** that send their label. Their text is the app's.

The `ai-reporting` agent is also told how to answer a message with personal information in it that got through: one short, friendly sentence asking the user not to include personal details and saying they aren't needed, then the answer, without repeating the information or saying it was deleted or not stored.

## The patterns

The default list, in order:

| #   | Catches                                                          | Pattern                                                                    |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Email addresses                                                  | `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`                           |
| 2   | Nine or more digits with only single spaces between them         | `\d(?: ?\d){8,}`                                                           |
| 3   | South African phone numbers, local or `+27`, with any separators | `(?:\+27[ .-]?(?:\(0\)[ .-]?)?\|\(?0)\d{2}\)?[ .-]?\d{3}[ .-]?\d{4}(?!\d)` |
| 4   | South African passport numbers: a letter and eight digits        | `\b[A-Za-z]\d{8}\b`                                                        |

The list lives in `modules/shared/pii_patterns.yaml`. When you set your own `pii_patterns`, single-quote each entry in YAML so `\b` and `\d` survive.

**Why nine digits, spaces only.** A rule for 13-digit ID numbers misses a partial ID (11 digits is enough to identify someone), and bank and account numbers matter as much. Nine or more digits catches all of them. Allowing only spaces inside the run lets dates and times through (`2026-10-20 08:00`), and amounts under R100 million (`R1 500 000.50`) stay under nine digits.

**Why the order matters.** Where two alternatives match at the same place, the joined regex takes the first. The guard only asks whether anything matches, but the server masks each match, so the long-number rule comes before the phone rule: `082 123 4567 890` then masks whole instead of leaving ` 890` behind. Keep that order in your own list.

## Tested strings

Each of these is blocked, and masks whole:

- `8001015009087`, `80010150090`, `800101 5009 087` (ID numbers, whole and partial)
- `(082) 123 4567`, `082-123-4567`, `+27 82 123 4567`, `+27-82-123-4567`, `+27 82-123-4567`, `+27 (0)82 123 4567`
- `082 123 4567 890`
- `A12345678`
- `jane@example.com`
- `62 1234 5678`

Each of these is sent:

- `payroll for 2026-10-20 08:00`
- `2026-01-01 2026-03-31`
- `R1 500 000.50`
- `employee 12345`

`modules/shared/pii_patterns.test.js` runs both lists against the default patterns.

## Known limits

- An ID number typed with dashes (`800101-5009-087`) passes, and so do short employee numbers.
- Long business numbers are blocked: an SAP purchase order `PO 4500012345` is ten digits. An app whose users ask about those overrides `pii_patterns`, after its information officer agrees.
- Names are not detected. No pattern finds a name reliably, and blocking capitalised words would ruin the chat. The notice under the composer and the agent's reply cover names.
- Attached files and screenshots are not checked: the guard reads the typed text only.
