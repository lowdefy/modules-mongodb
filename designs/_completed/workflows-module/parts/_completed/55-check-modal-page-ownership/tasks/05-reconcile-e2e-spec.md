# Task 5: Reconcile the onboarding e2e spec to drive the modal in place

## Context

`apps/demo/e2e/workflows/onboarding-happy-path.spec.js` clicks four `check`-kind action rows and today asserts **full-page navigation** to `workflow-action-edit`:

- `site-visit` on `lead-view` (≈ line 213)
- `schedule-followup` on `lead-view` (≈ line 246)
- `assign-account-manager` on `companies/view` (≈ line 595)
- `kickoff-call` on `companies/view` (≈ line 643)

After this design, both pages keep the modal (Task 3) and a check-row click opens the modal **in place** — no navigation. So all four `waitForURL(workflow-action-edit)` assertions would now fail. The spec must be reconciled to drive the modal in place on these steps.

Each of the four steps currently follows this pattern:

```js
const link = page.locator("a", { hasText: "<row text>" }).first();
await link.waitFor({ state: "visible", timeout: 10_000 });
await link.click();
await page.waitForURL((url) => url.href.includes("workflow-action-edit"), {
  timeout: 15_000,
});

await ldf.block("status").do.select("done");

await Promise.all([
  page.waitForURL((url) => !url.href.includes("workflow-action-edit"), {
    timeout: 30_000,
  }),
  ldf.block("button_submit_edit").do.click(),
]);

await expect
  .poll(
    async () => {
      /* find actions doc */
    },
    { timeout: 10_000 },
  )
  .toBe("done");
```

The modal wraps the **same** `check-action-surface` body the full-page `workflow-action-edit` renders, so the in-modal status selector and submit button keep the same block ids: `ldf.block('status')` and `ldf.block('button_submit_edit')`. The difference is no URL change — the modal opens over the entity page and closes on submit.

## Task

For each of the four `check`-row steps, rewrite the interaction to:

1. Click the action row link as today.
2. **Assert no navigation** — the URL stays on the entity page (`lead-view` / `companies/view`) and does **not** include `workflow-action-edit`. Wait for the modal to be visible instead (e.g. wait for the in-context `status` block / modal surface to appear).
3. Select status `done` in the modal: `await ldf.block('status').do.select('done');`.
4. Submit in the modal: `await ldf.block('button_submit_edit').do.click();` — and assert the modal closes (rather than waiting for a URL change away from `workflow-action-edit`).
5. Keep the existing `expect.poll` that asserts the actions doc reaches `done`.
6. Where the design calls for it, assert the co-present surface refreshes after submit (on `lead-view`, the activity timeline; on both pages, the action steps) — without re-navigating to the page. (The `kickoff-call` step's existing post-submit poll that `assign-account-manager`→`done` unblocks `kickoff-call`→`action-required` stays.)

Remove the `waitForURL(...workflow-action-edit)` waits (both the navigate-in and the navigate-out halves of the `Promise.all`) for these four steps, replacing them with modal-open / modal-close assertions.

Leave untouched: the `send-quote` (kind: `form`) step and any other non-`check` steps that legitimately navigate, and all DB-state polls.

This spec is already marked unverified against a live run. **Confirm the rewrite with `/r:dev-test`** — run the onboarding happy-path spec against a live app + MongoDB and fix any failures until green. A build check (`pnpm ldf:b`) is necessary but **not sufficient** here; the modal-in-place behaviour must be exercised in the browser.

## Acceptance Criteria

- None of the four `check`-row steps asserts navigation to `workflow-action-edit`; each asserts the modal opens in place and the URL stays on the entity page.
- Each of the four steps selects `done` and submits via the in-modal `status` / `button_submit_edit` blocks, and asserts the modal closes.
- The actions-doc `done` polls (and the `kickoff-call` unblock poll) are preserved.
- On `lead-view`, the spec asserts the activity timeline refreshes after a check submit (the bug this design fixes).
- `/r:dev-test` runs `onboarding-happy-path.spec.js` green against a live app + MongoDB.

## Files

- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — modify — reconcile the four `check`-row steps (`site-visit`, `schedule-followup`, `assign-account-manager`, `kickoff-call`) to drive the modal in place; add co-present-surface refresh assertions; remove the `workflow-action-edit` navigation waits for these steps.

## Notes

- Confirm the in-modal block ids against the live surface (`status`, `button_submit_edit`) — they are shared between the modal and the full-page surface, but verify during `/r:dev-test`. If the modal scopes block ids differently in practice, adjust the locators accordingly.
- Do not weaken the DB-state assertions — they are the ground truth that the signal actually landed.
