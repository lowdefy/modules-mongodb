---
"@lowdefy/modules-mongodb-user-account": patch
---

Invitation and sign-in routing fixes: the accept page refreshes the session before routing (the router no longer bounces a just-accepted caller back to the awaiting page), a retry against an invitation the caller already consumed enters the app instead of failing "not found", the "already a member" branch refreshes the session too, and a brand-new user arriving at the magic-link step with a `?callbackUrl=` keeps it (they no longer land on the protected onboarding page's 404). The login page seeds `login_resend_email` so the resend affordance's state key always exists.
