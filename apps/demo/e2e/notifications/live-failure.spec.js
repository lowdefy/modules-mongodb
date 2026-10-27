import { test, expect } from "../fixtures.js";
import { USER } from "./fixtures.js";

// A live feed that cannot subscribe must not hold up the page: the layout's
// onMountAsync runs the page's own requests at once, the failure is reported
// to the console and the client-error endpoint, and the user sees no toast.

// The client waits this long for a subscribe ack before it gives up.
const SUBSCRIBE_TIMEOUT_MS = 10_000;

test("a page loads its own data at once when the live feed cannot subscribe", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("users", [
    {
      _id: "e2e-live-failure-member",
      name: "Feed Failure Member",
      email: "feed-failure@example.com",
      email_verified: true,
    },
  ]);
  await mdb.seed("user-members", [
    {
      _id: "e2e-live-failure-membership",
      user_id: "e2e-live-failure-member",
      organization_id: "demo",
      role: "member",
      app_roles: ["user"],
      created_at: new Date(),
    },
  ]);
  // Every connection opens and is closed by the server straight away, as a
  // host that refuses websocket upgrades leaves the client.
  await page.routeWebSocket(/\/api\/websocket/, (socket) =>
    socket.close({ code: 1011, reason: "unreachable" }),
  );
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const reported = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/client-error") &&
      (request.postData() ?? "").includes("notifications-live"),
    { timeout: SUBSCRIBE_TIMEOUT_MS + 10_000 },
  );

  await ldf.user({ ...USER, roles: ["admin", "user-admin"] });
  const opened = Date.now();
  const members = page.waitForResponse((response) =>
    response.url().includes("/get_all_members"),
  );
  await page.goto("/user-admin/all");
  expect((await members).ok()).toBe(true);
  await expect(page.getByText("Feed Failure Member")).toBeVisible();
  expect(Date.now() - opened).toBeLessThan(SUBSCRIBE_TIMEOUT_MS);
  await page.screenshot({ path: test.info().outputPath("loaded.png") });

  const report = await reported;
  expect(report.postData()).toContain("timed out");
  await expect
    .poll(() => consoleErrors.some((text) => text.includes("timed out")))
    .toBe(true);
  await expect(page.locator(".ant-message-error")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("after-timeout.png") });
});
