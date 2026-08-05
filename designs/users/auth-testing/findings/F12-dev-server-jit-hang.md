# F12 — Dev-server JIT build hangs on the post-login navigation

**Status:** `investigate` · **Area:** dev-server / tooling

Immediately after a successful login redirect, the destination page can stick on the
"building page" JIT screen and never resolve. **Opening the same URL in a new tab clears it
every time.** Observed twice during a single run.

Presents as a dev-server build/HMR stall on the navigation that follows sign-in, not a
module-config fault — builds are green throughout. Same class as the transient JIT hang seen
while diagnosing the demo router fix.

## The open question

Not yet root-caused — needs a deliberate repro. Then decide whether it is:

- a **tooling / dev-server issue** to escalate upstream, or
- a **symptom of how the auth flow triggers navigation** — in which case it likely collapses
  into the already-fixed post-login navigation work (`callback-url-default` /
  `update-session-store-refresh`) rather than being its own finding.

Only promote to a real design if the repro shows a module-side cause; otherwise it closes as
an upstream tooling report.
