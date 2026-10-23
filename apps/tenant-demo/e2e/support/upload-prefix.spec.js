import { test, expect } from "../fixtures.js";

// The support module's upload policy, called as the reply composer on the
// ticket page calls it. Uploads land under {organization_id}/support/{user id}/,
// or support/{user id}/ for a user with no organization. Signing a policy is
// computed locally, so the placeholder bucket secrets in playwright.config.js
// are enough.

const REQUEST =
  "/api/request/support/ticket/upload_policy_support_page_reply_files";

async function policyKey(page) {
  const raw = await page.request.post(REQUEST, {
    data: {
      payload: {
        file_name: "screen.png",
        file_type: "image/png",
        url: "http://localhost/support/ticket",
      },
    },
  });
  const body = await raw.json().catch(() => null);
  return body?.response?.fields?.key ?? JSON.stringify(body);
}

test("a member's uploads land under their organization", async ({
  ldf,
  page,
}) => {
  await ldf.user({
    id: "user-a",
    name: "A",
    email: "a@example.com",
    organization_id: "org-a",
    roles: ["admin"],
  });
  expect(await policyKey(page)).toMatch(
    /^org-a\/support\/user-a\/[0-9a-f-]{36}\/screen\.png$/,
  );
});

test("a user with no organization uploads under support/", async ({
  ldf,
  page,
}) => {
  await ldf.user({
    id: "user-none",
    name: "None",
    email: "none@example.com",
    organization_id: null,
    roles: ["admin"],
  });
  expect(await policyKey(page)).toMatch(
    /^support\/user-none\/[0-9a-f-]{36}\/screen\.png$/,
  );
});
