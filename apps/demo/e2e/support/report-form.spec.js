import { test, expect } from "../fixtures.js";
import { createPelicanStub } from "./pelican-stub.js";

// The help launcher and the New report form against a stub Pelican: who sees
// the launcher, what one Send carries (the draft, the files, the page's
// context), and how each kind of refusal leaves the draft. Uploads go to a
// mocked policy and an intercepted S3 post.

const USER = {
  id: "e2e-report-user-id",
  sub: "e2e-report-user-sub",
  name: "Report User",
  email: "report@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Report User" },
};

const S3_URL = "https://s3.e2e.test/support-upload";
const KEY = `support/${USER.id}/e2e-upload/file`;

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const createdView = {
  id: "t-form",
  key: "ENC-21",
  title: "The export fails",
  type: "bug",
  version: 1,
  stage: "Received",
  created: "2026-10-07T09:00:00.000Z",
  updated: "2026-10-07T09:00:00.000Z",
  messages: [],
};

const pelican = createPelicanStub();

test.beforeAll(() => pelican.start());
test.afterAll(() => pelican.stop());

test.beforeEach(async ({ ldf, page }) => {
  pelican.reset();
  await ldf.mock.request("upload_policy_support_report_files", {
    response: { url: S3_URL, fields: { key: KEY, bucket: "e2e-bucket" } },
  });
  await page.route(`${S3_URL}**`, (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
});

const launcher = (page) => page.locator("#support_panel .fp-launcher");

async function openForm({ ldf, page }) {
  await ldf.goto("/home");
  await launcher(page).click();
  await expect(page.locator("#support_panel .fp-panel")).toHaveAttribute(
    "data-open",
    "true",
  );
}

async function fillDraft({ ldf }) {
  await ldf.block("support_report.type").do.select("Bug");
  await ldf.block("support_report.title").do.fill("The export fails");
  await ldf.block("support_report.message").do.fill("Export shows an error.");
}

const attach = (page, name) =>
  page
    .locator("#support_report_files input[type=file]")
    .setInputFiles({ name, mimeType: "image/png", buffer: PNG });

test("Help files a report with a screenshot, an attached image and the page's context", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  pelican.answer(() => ({ status: 200, body: createdView }));
  await openForm({ ldf, page });

  await page.evaluate(() => {
    console.error("e2e first recorded error");
    console.error("e2e second recorded error");
  });
  await fillDraft({ ldf });
  await page.getByTestId("support_report_screenshot").click();
  await page.getByTestId("support_report_screenshot_use").click();
  await attach(page, "pasted.png");
  await expect(page.locator("#support_report\\.files")).toContainText(
    "screenshot.png",
  );
  await expect(page.locator("#support_report\\.files")).toContainText(
    "pasted.png",
  );

  await ldf.block("support_report_send").do.click();
  await ldf.block("support_tickets_sent").expect.visible();

  expect(pelican.calls).toHaveLength(1);
  const [sent] = pelican.calls;
  expect(sent.endpoint).toBe("support-create-ticket");
  expect(sent.body.type).toBe("bug");
  expect(sent.body.title).toBe("The export fails");
  expect(sent.body.message).toBe("Export shows an error.");
  expect(sent.body.files.map((f) => f.name)).toEqual([
    "screenshot.png",
    "pasted.png",
  ]);
  const { context } = sent.body;
  expect(context.page).toBe("home");
  expect(context.environment).toBe("development");
  expect(context.organization.id).toBe("demo");
  expect(context.url).toContain("/home");
  expect(context.viewport.width).toBeGreaterThan(0);
  expect(context.extra).toEqual({});
  const messages = context.errors.map((e) => e.message);
  expect(messages).toContain("e2e first recorded error");
  expect(messages).toContain("e2e second recorded error");

  await ldf.state("support_view").expect.toBe("tickets");
  await ldf.state("support_ticket").expect.toBe("t-form");

  // Back on New report, the form is blank.
  await page
    .locator("#support_view")
    .getByText("New report", { exact: true })
    .click();
  await expect(page.locator("#support_report\\.title_input")).toHaveValue("");
  await expect(page.locator("#support_report\\.message_input")).toHaveValue("");
  await expect(page.locator("#support_report\\.files")).not.toContainText(
    "pasted.png",
  );
});

test("a retry or unavailable answer keeps the draft and sends nothing again", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  pelican.answer(() => ({
    status: 429,
    body: {
      error: {
        code: "rate_limited",
        message: "Too many tickets.",
        retry_after: 30,
      },
    },
  }));
  await openForm({ ldf, page });
  await fillDraft({ ldf });
  await attach(page, "kept.png");
  await expect(page.locator("#support_report\\.files")).toContainText(
    "kept.png",
  );

  await ldf.block("support_report_send").do.click();
  await expect(page.locator("#support_report_error")).toContainText(
    "Something went wrong, try again in 30 seconds.",
  );
  expect(pelican.calls).toHaveLength(1);
  await ldf.state("support_view").expect.toBe("report");
  await ldf.state("support_report.type").expect.toBe("bug");
  await ldf.state("support_report.title").expect.toBe("The export fails");
  await ldf
    .state("support_report.message")
    .expect.toBe("Export shows an error.");
  expect(
    (await ldf.state("support_report.files").value()).map((f) => f.name),
  ).toEqual(["kept.png"]);

  pelican.reset();
  pelican.answer(() => ({
    status: 401,
    body: { error: { code: "unauthorized", message: "Unknown key." } },
  }));
  await ldf.block("support_report_send").do.click();
  await expect(page.locator("#support_report_error")).toContainText(
    "Support is unavailable right now.",
  );
  await ldf.state("support_report.title").expect.toBe("The export fails");
});

test("a fix answer shows Pelican's message", async ({ ldf, page }) => {
  await ldf.user(USER);
  pelican.answer(() => ({
    status: 415,
    body: {
      error: { code: "file_type", message: "Send images or PDFs only." },
    },
  }));
  await openForm({ ldf, page });
  await fillDraft({ ldf });
  await ldf.block("support_report_send").do.click();
  await expect(page.locator("#support_report_error")).toContainText(
    "Send images or PDFs only.",
  );
  await ldf.state("support_report.title").expect.toBe("The export fails");
});

test("an incomplete draft is not sent", async ({ ldf, page }) => {
  await ldf.user(USER);
  await openForm({ ldf, page });
  await ldf.block("support_report.title").do.fill("No type or description");
  await ldf.block("support_report_send").do.click();
  await expect(
    page.getByText("Your input has 2 validation errors"),
  ).toBeVisible();
  expect(pelican.calls).toHaveLength(0);
  await ldf.state("support_report_error").expect.toBe(null);
});

test("five files fill the report: the dropper goes and the screenshot button is disabled", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  await openForm({ ldf, page });
  for (const n of [1, 2, 3, 4, 5]) {
    await attach(page, `file-${n}.png`);
    await expect(page.locator("#support_report\\.files")).toContainText(
      `file-${n}.png`,
    );
  }
  await expect(page.locator("#support_report_files")).toHaveCount(0);
  await expect(page.getByTestId("support_report_screenshot")).toBeDisabled();

  await page.locator("#support_report\\.files button").first().click();
  await expect(page.locator("#support_report_files")).toBeVisible();
  await expect(page.getByTestId("support_report_screenshot")).toBeEnabled();
});

test("a user with no organisation sees Help and files with organization null", async ({
  ldf,
  page,
}) => {
  await ldf.user({ ...USER, organization_id: null });
  pelican.answer(() => ({ status: 200, body: createdView }));
  await openForm({ ldf, page });
  await fillDraft({ ldf });
  await ldf.block("support_report_send").do.click();
  await ldf.block("support_tickets_sent").expect.visible();
  expect(pelican.calls[0].body.context.organization).toBeNull();
});

test("signed out, the launcher is not on the page", async ({ ldf, page }) => {
  await ldf.user(null);
  await ldf.goto("/user-account/login");
  await expect(page.locator("#support_panel")).toHaveCount(0);
});
