import { test, expect } from "../fixtures.js";
import { REPORTS, USER_A, USER_B, reportDoc } from "./helpers.js";

// The report page's "Continue in chat" / "Fix in chat" buttons link to the chat
// page with the source conversation in `conversation_id`. That link is only a
// link — restoring the conversation is the chat page's mount, so this is the
// layer that proves it: a build can confirm the actions compile, but only a real
// mount shows whether the page opened the linked conversation or minted a fresh
// one and left the reader staring at an empty transcript.
//
// The observable is the panel's "Reports from this chat" band rather than the
// transcript. Both come from the same get-conversation-results read, so either
// proves the load ran — but the band is rendered by this repo's own config
// against a seeded report document, where the transcript is rendered by the
// AgentChat block from a message schema the agent framework owns. Asserting on
// our own config keeps the spec about the deep link.
const CONVERSATIONS = "conversations";

function conversationDoc({ id, owner = USER_A }) {
  return {
    _id: id,
    owner: { user_id: owner.id, name: owner.name },
    title: "Seeded by the chat deep-link spec",
    messages: [],
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

test("a conversation_id in the URL opens that conversation", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(CONVERSATIONS, [conversationDoc({ id: "e2e-chat-deep" })]);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-chat-deep-report",
      title: "Saved from the linked chat",
      owner: USER_A,
      conversationId: "e2e-chat-deep",
    }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/reporting/chat?conversation_id=e2e-chat-deep");

  // Present only when saved_reports is non-empty — i.e. the mount read results
  // for THIS conversation. A page that minted a fresh uuid instead has no
  // reports against it and hides the whole band.
  await expect(page.getByText("Reports from this chat (1)")).toBeVisible();
  await expect(page.getByText("Saved from the linked chat")).toBeVisible();
});

test("New chat clears the reports of the conversation you came from", async ({
  ldf,
  page,
  mdb,
}) => {
  // The band is state, not a rendering of the current conversation id, so it
  // only empties where something empties it. Both New chat buttons share one
  // action, and it blanks the transcript and the three result kinds — a key it
  // misses leaves the previous conversation's output above a fresh, empty chat,
  // which is what happened to `saved_reports`. The deep link is the shortest way
  // to reach a conversation that has a report to leave behind.
  await mdb.seed(CONVERSATIONS, [conversationDoc({ id: "e2e-chat-switch" })]);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-chat-switch-report",
      title: "Saved before the switch",
      owner: USER_A,
      conversationId: "e2e-chat-switch",
    }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/reporting/chat?conversation_id=e2e-chat-switch");
  await expect(page.getByText("Saved before the switch")).toBeVisible();

  await page.getByRole("button", { name: "New chat" }).click();

  // The whole band unmounts on an empty list, so the heading goes with the row.
  await expect(page.getByText("Saved before the switch")).toBeHidden();
  await expect(page.getByText("Reports from this chat")).toBeHidden();
});

test("the chat opens a new conversation when the URL names none", async ({
  ldf,
  page,
  mdb,
}) => {
  // The ordinary entry — from the menu, with no query. The seeded report exists
  // and belongs to the viewer, so if the band showed here it would mean the
  // mount load ran against something other than the URL's (absent) id.
  await mdb.seed(CONVERSATIONS, [conversationDoc({ id: "e2e-chat-plain" })]);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-chat-plain-report",
      title: "Saved from an unlinked chat",
      owner: USER_A,
      conversationId: "e2e-chat-plain",
    }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/reporting/chat");

  await expect(page.getByText("Saved from an unlinked chat")).toBeHidden();
});

test("a deep link to someone else's conversation restores nothing", async ({
  ldf,
  page,
  mdb,
}) => {
  // get-conversation-results is owner-scoped, so the link is not a way into
  // another user's transcript. The page still opens — on an empty conversation
  // — rather than erroring.
  await mdb.seed(CONVERSATIONS, [
    conversationDoc({ id: "e2e-chat-foreign", owner: USER_A }),
  ]);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-chat-foreign-report",
      title: "Not for the other user",
      owner: USER_A,
      conversationId: "e2e-chat-foreign",
    }),
  ]);

  await ldf.user(USER_B);
  await ldf.goto("/reporting/chat?conversation_id=e2e-chat-foreign");

  await expect(page.getByText("Not for the other user")).toBeHidden();
});
