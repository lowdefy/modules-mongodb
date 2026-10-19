import { test, expect } from "../fixtures.js";

// The accept page sends a new invitee to signup with `?callbackUrl=` set to
// itself, and every verification email carries it back to verify-email. The
// sends themselves are auth actions, which the e2e server does not run, so
// these specs start from the verified landing and check that "Continue to sign
// in" hands the value on to login.

const ACCEPT = "/user-account/accept?invitationId=e2e-invite";
const EMAIL = "invitee@example.com";

test.describe("verify-email continue", () => {
  test.beforeEach(async ({ ldf }) => {
    await ldf.user(null);
  });

  test("passes callbackUrl on to login", async ({ ldf }) => {
    const query = new URLSearchParams({
      verified: "1",
      email: EMAIL,
      callbackUrl: ACCEPT,
    });
    await ldf.goto(`/user-account/verify-email?${query}`);
    await ldf.block("verify_continue").do.click();
    await ldf.page.waitForURL(/\/user-account\/login/);
    const landed = new URL(ldf.page.url());
    expect([...landed.searchParams.keys()]).toEqual(["callbackUrl"]);
    expect(landed.searchParams.get("callbackUrl")).toBe(ACCEPT);
  });

  test("opens plain login when there is no callbackUrl", async ({ ldf }) => {
    const query = new URLSearchParams({ verified: "1", email: EMAIL });
    await ldf.goto(`/user-account/verify-email?${query}`);
    await ldf.block("verify_continue").do.click();
    await ldf.page.waitForURL(/\/user-account\/login/);
    expect(new URL(ldf.page.url()).search).toBe("");
  });
});
