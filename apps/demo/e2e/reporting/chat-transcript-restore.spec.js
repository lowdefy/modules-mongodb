import { test, expect } from "../fixtures.js";
import { USER_A } from "./helpers.js";

// Restoring a multi-turn transcript. The AgentChat block keys its bubbles by
// message id and looks each bubble's parts up in an id -> parts map, so two
// messages sharing an id collapse: the earlier bubble renders the later
// message's content. The saved transcript is exactly where that happens — the
// AI SDK ids the assistant reply it hands the onFinish hook with "" unless the
// caller passes generateMessageId, so every persisted assistant message shares
// the empty id and a reloaded conversation shows its last answer in every
// assistant bubble.
//
// Only a real mount can show this: the save and the read both round-trip the
// ids faithfully, and a live turn looks right because the CLIENT generates its
// own id while streaming. The damage is visible only after the reload.
const CONVERSATIONS = "conversations";

function message({ id, role, text }) {
  return { id, role, parts: [{ type: "text", text }] };
}

function conversationDoc({ id, owner = USER_A, messages = [] }) {
  return {
    _id: id,
    owner: { user_id: owner.id, name: owner.name },
    title: "Seeded by the transcript-restore spec",
    messages,
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

test("a restored two-turn transcript keeps each answer in its own bubble", async ({
  ldf,
  page,
  mdb,
}) => {
  // The ids are what save-conversation actually persists: real client-generated
  // ids on the user messages, "" on every assistant message.
  await mdb.seed(CONVERSATIONS, [
    conversationDoc({
      id: "e2e-chat-restore",
      messages: [
        message({
          id: "user-1",
          role: "user",
          text: "Which region sold most?",
        }),
        message({
          id: "",
          role: "assistant",
          text: "The North region led on revenue.",
        }),
        message({ id: "user-2", role: "user", text: "And which category?" }),
        message({
          id: "",
          role: "assistant",
          text: "Electronics was the top category.",
        }),
      ],
    }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/reporting/chat?conversation_id=e2e-chat-restore");

  // Both questions restore — user bubbles render from the item's own content, so
  // these hold even while the answers collapse.
  await expect(page.getByText("Which region sold most?")).toBeVisible();
  await expect(page.getByText("And which category?")).toBeVisible();

  // Each answer appears once, in its own bubble. Under the id collision the
  // first answer is missing entirely and the second renders twice.
  await expect(
    page.getByText("The North region led on revenue."),
  ).toBeVisible();
  await expect(page.getByText("Electronics was the top category.")).toHaveCount(
    1,
  );
});
