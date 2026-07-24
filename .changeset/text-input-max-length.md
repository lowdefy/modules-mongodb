---
"@lowdefy/modules-mongodb-workflows": minor
---

Action-form text fields (`text_input`) support native max-length capping. A new `max_length` field option maps to the TextInput `maxLength` property, stopping input at the limit instead of erroring after over-long input; `show_count` maps to `showCount` for a live "n/max" counter and defaults to on whenever `max_length` is set.
