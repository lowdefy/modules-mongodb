# User Account — Vars

- **`app_name`** (required) — App name for event metadata.
- **`login_message`** — HTML message shown on the login page. Default: `<p>Welcome. Please provide your work email to sign in.</p>`
- **`verify_email_message`** — Message shown on the verify email request page. Default: `A sign in link has been sent to your email. Follow the link to sign in.`
- **`event_display`** — Per-app event display templates. Keys are app identifiers, values map event types to Nunjucks title templates. Default: built-in defaults.
- **`components`** — Overrides: `form_profile`, `view_profile`.
