// Playwright helpers for `ldf.block(id)` in an app's e2e specs. They import
// nothing, so the plugin needs no Playwright or e2e-utils dependency: the
// expect methods wait on the locator and throw when it does not settle.
const root = (page, blockId) => page.locator(`[id="${blockId}"]`);
const textarea = (page, blockId) =>
  page.locator(`[data-testid="${blockId}_textarea"]`);
const sendButton = (page, blockId) =>
  page.locator(`[data-testid="${blockId}_send"]`);

async function expectValue(page, blockId, val) {
  const box = textarea(page, blockId);
  await box.waitFor({ state: "visible" });
  const actual = await box.inputValue();
  if (actual !== val) {
    throw new Error(
      `MessageComposer "${blockId}" holds "${actual}", expected "${val}".`,
    );
  }
}

export default {
  locator: root,
  do: {
    fill: (page, blockId, val) => textarea(page, blockId).fill(val),
    clear: (page, blockId) => textarea(page, blockId).clear(),
    send: (page, blockId) => sendButton(page, blockId).click(),
  },
  get: {
    value: (page, blockId) => textarea(page, blockId).inputValue(),
  },
  expect: {
    visible: (page, blockId) =>
      root(page, blockId).waitFor({ state: "visible" }),
    hidden: (page, blockId) => root(page, blockId).waitFor({ state: "hidden" }),
    value: expectValue,
  },
};
