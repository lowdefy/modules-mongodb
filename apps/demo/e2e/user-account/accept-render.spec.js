import { test } from "../fixtures.js";

// The accept page chooses its render once the invitation is read and, when no
// caller resolved on the server, once the browser's session has been asked
// for. The e2e server's mock caller stands in for a session, so these specs
// cover the choice for each caller shape; the pinned-invitee case (a session
// the server resolves to no caller) needs a real sign-in.

const INVITATION_ID = "e2e-accept-render";
const INVITED = "Invitee@Example.com ";

test.describe("accept page render", () => {
  test.beforeEach(async ({ mdb }) => {
    await mdb.seed("user-invitations", [
      {
        _id: INVITATION_ID,
        organization_id: "demo",
        email: "invitee@example.com",
        role: "member",
        status: "pending",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        created_at: new Date(),
      },
    ]);
  });

  test("offers sign-in with no caller", async ({ ldf }) => {
    await ldf.user(null);
    await ldf.goto(`/user-account/accept?invitationId=${INVITATION_ID}`);
    await ldf.block("accept_login").expect.visible();
    await ldf.block("accept_continue").expect.hidden();
  });

  test("offers accept to the invited address", async ({ ldf }) => {
    await ldf.user({
      id: "e2e-accept-invitee",
      name: "Invitee",
      email: INVITED,
      roles: [],
    });
    await ldf.goto(`/user-account/accept?invitationId=${INVITATION_ID}`);
    await ldf.block("accept_continue").expect.visible();
    await ldf.block("accept_login").expect.hidden();
  });

  test("refuses another address", async ({ ldf }) => {
    await ldf.user({
      id: "e2e-accept-other",
      name: "Other",
      email: "other@example.com",
      roles: [],
    });
    await ldf.goto(`/user-account/accept?invitationId=${INVITATION_ID}`);
    await ldf.block("accept_wrong_email").expect.visible();
    await ldf.block("accept_continue").expect.hidden();
  });

  test("names the missing invitation", async ({ ldf }) => {
    await ldf.user(null);
    await ldf.goto("/user-account/accept");
    await ldf.block("accept_no_invitation").expect.visible();
  });
});
