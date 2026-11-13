// The strings docs/shared/personal-information.md lists for the AI chat modules'
// personal-information guard: each must-block string is refused before it is
// sent, and each must-pass string is sent. modules/shared/pii_patterns.test.js
// runs the same lists against the patterns themselves.

export const PII_MESSAGE =
  "This looks like personal information. Please remove it and describe the task instead.";

export const MUST_BLOCK = [
  "8001015009087",
  "80010150090",
  "800101 5009 087",
  "(082) 123 4567",
  "082-123-4567",
  "+27 82 123 4567",
  "+27-82-123-4567",
  "+27 82-123-4567",
  "+27 (0)82 123 4567",
  "082 123 4567 890",
  "A12345678",
  "jane@example.com",
  "62 1234 5678",
];

export const MUST_PASS = [
  "payroll for 2026-10-20 08:00",
  "2026-01-01 2026-03-31",
  "R1 500 000.50",
  "employee 12345",
];

// A minimal AI SDK UI message stream: one text part, then finish.
export function replyStream(reply) {
  const events = [
    { type: "start" },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: reply },
    { type: "text-end", id: "t1" },
    { type: "finish" },
  ];
  return (
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

// Answers every agent call with `reply` and records what was posted, so a spec
// can tell a refused send (nothing posted) from a sent one.
export async function interceptAgent(page, reply) {
  const posted = [];
  await page.route("**/api/agent/**", async (route) => {
    posted.push(route.request().postData() ?? "");
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: replyStream(reply),
    });
  });
  return posted;
}
