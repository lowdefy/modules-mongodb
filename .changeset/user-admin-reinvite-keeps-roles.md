---
"@lowdefy/modules-mongodb-user-admin": patch
---

**Re-inviting from an expired invitation keeps its roles.** The invite page's email check now also returns the organization's most recent expired invitation for the address, and the form prefills that invitation's app roles, organization tier and member attributes in place of blank roles, the `member` tier and empty attributes. A stored `owner` tier seeds `admin`, since the form does not offer `owner`. The admin can change any value before sending, and sending still cancels the expired row before inviting. The invite page also checks an `?email=` URL query on load, so the Invitations tab's Re-invite on an Expired row opens straight onto the prefilled form; before, the page ignored the query and the admin had to retype the address. An address with no expired invitation prefills from its contact profile as before, and a live pending invitation still opens the Resend panel.
