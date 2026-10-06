import { test, expect } from "../fixtures.js";

const USER = {
  id: "e2e-support-context",
  name: "Support Context",
  email: "support-context@example.com",
  roles: [],
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const snapshot = async (page, ldf) => {
  await page.getByRole("button", { name: "Take a snapshot" }).click();
  await expect
    .poll(async () => (await ldf.state("support_context").value())?.url)
    .toBeTruthy();
  return ldf.state("support_context").value();
};

test.describe("SupportContext", () => {
  test.beforeEach(async ({ ldf }) => {
    await ldf.user(USER);
  });

  test("keeps an error logged in the first page's onInit", async ({
    page,
    ldf,
  }) => {
    await page.goto("/user-components-demo?support_demo_error=1");
    const value = await snapshot(page, ldf);
    expect(value.errors).toEqual([
      expect.objectContaining({
        kind: "console",
        message: "SupportContext demo: logged from onInit",
        at: expect.stringMatching(ISO),
      }),
    ]);
  });

  test("snapshot carries the browser's details", async ({ page, ldf }) => {
    await page.goto("/user-components-demo");
    const value = await snapshot(page, ldf);
    const viewport = page.viewportSize();
    expect(value).toEqual({
      url: expect.stringMatching(/\/user-components-demo$/),
      user_agent: await page.evaluate(() => navigator.userAgent),
      viewport: { width: viewport.width, height: viewport.height },
      screen: {
        width: expect.any(Number),
        height: expect.any(Number),
        pixel_ratio: expect.any(Number),
      },
      locale: await page.evaluate(() => navigator.language),
      timezone: await page.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
      errors: [],
    });
  });

  test("records a failed request, an uncaught error and an unhandled rejection", async ({
    page,
    ldf,
  }) => {
    await page.goto("/user-components-demo");
    await page.getByRole("button", { name: "Run a failing request" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__lowdefySupportRecorder.entries().length),
      )
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("demo uncaught error");
      }, 0);
      Promise.reject(new Error("demo unhandled rejection"));
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.__lowdefySupportRecorder.entries().length),
      )
      .toBeGreaterThanOrEqual(3);

    const { errors } = await snapshot(page, ldf);
    // Lowdefy logs a failed request with its request id.
    const failed = errors.find(
      (e) =>
        e.kind === "console" && /Request ID: [0-9a-f-]{36}/.test(e.message),
    );
    expect(failed).toBeTruthy();
    expect(failed.at).toMatch(ISO);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "error",
          message: "demo uncaught error",
          at: expect.stringMatching(ISO),
          stack: expect.stringContaining("demo uncaught error"),
        }),
        expect.objectContaining({
          kind: "rejection",
          message: "demo unhandled rejection",
          at: expect.stringMatching(ISO),
        }),
      ]),
    );
  });

  test("keeps the last 20 entries", async ({ page, ldf }) => {
    await page.goto("/user-components-demo");
    await page.evaluate(() => {
      for (let i = 1; i <= 21; i += 1) console.error(`flood ${i}`);
    });
    const { errors } = await snapshot(page, ldf);
    expect(errors).toHaveLength(20);
    expect(errors[0].message).toBe("flood 2");
    expect(errors[19].message).toBe("flood 21");
  });
});
