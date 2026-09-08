---
"@lowdefy/modules-mongodb-user-admin": patch
---

Fix the invite page going blank after **Check**: the email check's outcome was read from the wrong place in the call result, so the page never reached the member / pending / form panel, and the checked email disappeared from the locked header (the hidden input's state field is dropped by the engine). The check now branches correctly and the checked address is kept in its own state key for the invite, resend and cancel steps.
