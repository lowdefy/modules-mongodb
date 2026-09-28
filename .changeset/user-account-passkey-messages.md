---
"@lowdefy/modules-mongodb-user-account": patch
---

**Clearer passkey failure messages.** A failed passkey sign-in on the login page (no passkey on this device, a cancelled prompt, an unsupported browser, a timeout) now shows one plain message — sign in another way, then add a passkey under your account's Security settings — instead of the raw authentication error. The message is the same whatever the cause, so it reveals nothing about whether an account or passkey exists. When adding a passkey fails on onboarding, the account Security tile or two-factor setup, the message now names the usual causes and points back at the Add passkey button.
