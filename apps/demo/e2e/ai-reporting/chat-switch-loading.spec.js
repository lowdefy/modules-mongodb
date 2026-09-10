import { test, expect } from "../fixtures.js";
import { REPORTS, USER_A, reportDoc } from "./helpers.js";

// Switching conversations in the rail. load_conversation blanks the transcript
// and the results panel before it reads the selected conversation, so between
// the click and the response the user used to see an empty chat with nothing to
// say a read was in flight — "something weird", when the read was slow or the
// conversation being left was mid-stream. Now the switch raises
// `loading_conversation`, a skeleton stands in for both surfaces, and the
// matching response lowers it.
//
// A build shows the skeleton compiles; only a real mount shows it comes up on the
// click and goes down on the RIGHT response. The read is slowed with a route
// delay so the loading state is on screen long enough to assert on, and the
// rapid A → B → A case is driven through the same delay so every response is
// still out when the last click lands.
const CONVERSATIONS = "conversations";
const RESULTS_ENDPOINT =
  /\/api\/endpoints\/ai-reporting\/get-conversation-results/;

function message({ id, role, text }) {
  return { id, role, parts: [{ type: "text", text }] };
}

function conversationDoc({ id, title, text, owner = USER_A }) {
  return {
    _id: id,
    owner: { user_id: owner.id, name: owner.name },
    title,
    messages: [
      message({ id: `${id}-user`, role: "user", text: `Question in ${title}` }),
      message({ id: "", role: "assistant", text }),
    ],
    data_parts: [],
    deleted: null,
    created: {
      timestamp: new Date(),
      user: { name: owner.name, id: owner.id },
    },
    updated: {
      timestamp: new Date(),
      user: { name: owner.name, id: owner.id },
    },
  };
}

async function delayResults(page, ms) {
  await page.route(RESULTS_ENDPOINT, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test("selecting a conversation shows a skeleton until its transcript lands", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(CONVERSATIONS, [
    conversationDoc({
      id: "e2e-switch-a",
      title: "Alpha chat",
      text: "Alpha's answer.",
    }),
    conversationDoc({
      id: "e2e-switch-b",
      title: "Beta chat",
      text: "Beta's answer.",
    }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/ai-reporting/chat");
  await expect(page.getByText("Beta chat")).toBeVisible();

  await delayResults(page, 1500);
  await page.getByText("Beta chat").click();

  // Both surfaces show their skeleton, the chat (composer included) is hidden
  // with it, and the panel does not claim there is nothing here.
  await expect(page.locator("#chat_loading")).toBeVisible();
  await expect(page.locator("#results_loading")).toBeVisible();
  await expect(page.locator("#chat")).toBeHidden();
  await expect(page.getByText("Nothing here yet")).toBeHidden();

  // The response lands: the skeletons go, the transcript is Beta's.
  await expect(page.getByText("Beta's answer.")).toBeVisible();
  await expect(page.locator("#chat_loading")).toBeHidden();
  await expect(page.locator("#results_loading")).toBeHidden();
});

test("switching A → B → A quickly ends on A with no flash of B", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(CONVERSATIONS, [
    conversationDoc({
      id: "e2e-switch-fast-a",
      title: "Fast alpha",
      text: "Fast alpha's answer.",
    }),
    conversationDoc({
      id: "e2e-switch-fast-b",
      title: "Fast beta",
      text: "Fast beta's answer.",
    }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/ai-reporting/chat");
  await expect(page.getByText("Fast beta")).toBeVisible();

  await delayResults(page, 1200);
  await page.getByText("Fast alpha").click();
  await page.getByText("Fast beta").click();
  await page.getByText("Fast alpha").click();

  // A's two responses and B's one are all still out. B's is dropped as stale
  // and must not lower the loading flag for A — so the skeleton holds until A's
  // own response, then A's transcript shows and B's never does.
  await expect(page.locator("#chat_loading")).toBeVisible();
  await expect(page.getByText("Fast alpha's answer.")).toBeVisible();
  await expect(page.locator("#chat_loading")).toBeHidden();
  await expect(page.getByText("Fast beta's answer.")).toBeHidden();
});

test("the report chip goes once the conversation has a saved report", async ({
  ldf,
  page,
  mdb,
}) => {
  // The suggestion below the transcript offers to turn the conversation into a
  // report. Under a conversation that already has one it read as an invitation to
  // save a duplicate, so it is keyed to the same `saved_reports` the "Reports
  // from this chat" band renders from: shown while that is empty, gone once it
  // is not. Two conversations, one with a report against it, so the same page
  // shows both states without a reload.
  await mdb.seed(CONVERSATIONS, [
    conversationDoc({
      id: "e2e-chip-bare",
      title: "Chip bare",
      text: "No report here.",
    }),
    conversationDoc({
      id: "e2e-chip-saved",
      title: "Chip saved",
      text: "A report was saved here.",
    }),
  ]);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-chip-report",
      title: "Saved from chip saved",
      owner: USER_A,
      conversationId: "e2e-chip-saved",
    }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/ai-reporting/chat?conversation_id=e2e-chip-bare");
  await expect(page.getByText("No report here.")).toBeVisible();
  await expect(
    page.getByText("Turn this conversation into a report"),
  ).toBeVisible();

  await page.getByText("Chip saved").click();
  await expect(page.getByText("Reports from this chat (1)")).toBeVisible();
  await expect(page.getByText("A report was saved here.")).toBeVisible();
  await expect(
    page.getByText("Turn this conversation into a report"),
  ).toBeHidden();

  // And back: the chip returns with a conversation that has no report.
  await page.getByText("Chip bare").click();
  await expect(page.getByText("No report here.")).toBeVisible();
  await expect(
    page.getByText("Turn this conversation into a report"),
  ).toBeVisible();
});
