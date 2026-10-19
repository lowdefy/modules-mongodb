import { test, expect } from "../fixtures.js";

// A stored file part holds the link signed at upload, which stops working within days. With
// `file_links_endpoint` set, opening a thread signs a new link for each part that carries a
// storage key, through the demo's assistant-file-links endpoint. That endpoint signs only keys
// under the caller's own upload prefix and answers url null for the rest, which the module
// leaves on the link it stored. Signing is local, so placeholder bucket secrets are enough
// (playwright.config.js).

const THREADS = "conversations";

const USER = {
  id: "e2e-chat-user-id",
  sub: "e2e-chat-user-sub",
  name: "Chat User",
  email: "chat@example.com",
  roles: ["admin"],
  profile: { name: "Chat User" },
};

const OWN_KEY = `ai-assistant/${USER.id}/f1/shot.png`;
const OTHER_KEY = "ai-assistant/someone-else/f2/notes.pdf";

const filePart = ({ key, url, filename, mediaType }) => ({
  type: "file",
  url,
  mediaType,
  filename,
  ...(key ? { providerMetadata: { lowdefy: { key } } } : {}),
});

const messages = [
  {
    id: "m1",
    role: "user",
    parts: [
      { type: "text", text: "What is wrong on this page?" },
      filePart({
        key: OWN_KEY,
        url: "https://expired.example/shot.png",
        filename: "shot.png",
        mediaType: "image/png",
      }),
      filePart({
        key: OTHER_KEY,
        url: "https://expired.example/notes.pdf",
        filename: "notes.pdf",
        mediaType: "application/pdf",
      }),
      filePart({
        url: "data:image/png;base64,AAAA",
        filename: "inline.png",
        mediaType: "image/png",
      }),
    ],
  },
  {
    id: "m2",
    role: "assistant",
    parts: [{ type: "text", text: "The header overlaps the form." }],
  },
];

const threadDoc = (id) => ({
  _id: id,
  conversationId: id,
  user_id: USER.id,
  scope: "demo",
  title: "Screenshot",
  messages,
  deleted: null,
  last_opened: new Date(),
});

async function post(page, endpoint, payload) {
  const raw = await page.request.post(
    `/api/endpoints/ai-assistant/${endpoint}`,
    {
      data: { payload },
    },
  );
  const body = await raw.json().catch(() => null);
  return body?.response?.messages ?? null;
}

function expectRelinked(loaded) {
  const [, own, other, inline] = loaded[0].parts;
  expect(own.url).not.toBe("https://expired.example/shot.png");
  expect(own.url).toContain(OWN_KEY);
  expect(own.url).toContain("X-Amz-Signature=");
  expect(own.providerMetadata).toEqual({ lowdefy: { key: OWN_KEY } });
  expect(own.filename).toBe("shot.png");
  // Answered url null by the endpoint: the stored link stays.
  expect(other.url).toBe("https://expired.example/notes.pdf");
  // No key, never sent to the endpoint.
  expect(inline.url).toBe("data:image/png;base64,AAAA");
  expect(loaded[1]).toEqual(messages[1]);
}

test("opening a thread signs a new link for each of the caller's stored files", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(THREADS, [threadDoc("e2e-thread-files")]);
  await ldf.user(USER);
  expectRelinked(
    await post(page, "get-thread", { conversationId: "e2e-thread-files" }),
  );
});

test("the resumed thread gets new links too", async ({ ldf, page, mdb }) => {
  await mdb.seed(THREADS, [threadDoc("e2e-thread-files-active")]);
  await ldf.user(USER);
  expectRelinked(await post(page, "get-active-thread", { scope: "demo" }));
});

test("a thread with no keyed files is returned as stored", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(THREADS, [
    {
      ...threadDoc("e2e-thread-no-files"),
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
      ],
    },
  ]);
  await ldf.user(USER);
  const loaded = await post(page, "get-thread", {
    conversationId: "e2e-thread-no-files",
  });
  expect(loaded).toEqual([
    { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
  ]);
});

async function downloadLink(page, key) {
  const raw = await page.request.post(
    "/api/request/assistant-demo/ai_assistant_download_policy",
    { data: { payload: { key, content_type: "image/png" } } },
  );
  return { status: raw.status(), body: await raw.json().catch(() => null) };
}

test("the composer's download request signs only the caller's own uploads", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  const own = await downloadLink(page, OWN_KEY);
  expect(own.status).toBe(200);
  expect(own.body?.response).toContain(OWN_KEY);
  expect(own.body?.response).toContain("X-Amz-Signature=");
  const other = await downloadLink(page, OTHER_KEY);
  expect(JSON.stringify(other.body ?? "")).not.toContain("X-Amz-Signature=");
});
