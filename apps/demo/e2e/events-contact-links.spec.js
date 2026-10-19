import { test, expect } from "./fixtures.js";

// The events timeline on a contact's page links the actor's avatar and
// timestamp, and each @mention in a note, to the contact page by page id.

const USER = {
  id: "e2e-events-viewer",
  name: "Events Viewer",
  email: "events-viewer@example.com",
  roles: [],
};

const CONTACT_ID = "e2e-events-contact";
const ACTOR_ID = "e2e-events-actor";
const MENTIONED_ID = "e2e-events-mentioned";

test.describe("events timeline contact links", () => {
  test.beforeEach(async ({ ldf, mdb }) => {
    await ldf.user(USER);
    await mdb.seed("user-contacts", [
      {
        _id: CONTACT_ID,
        email: "events-contact@example.com",
        lowercase_email: "events-contact@example.com",
        profile: {
          given_name: "Events",
          family_name: "Contact",
          name: "Events Contact",
        },
      },
    ]);
    await mdb.seed("log-events", [
      {
        _id: "e2e-events-note",
        type: "deal-note",
        contact_ids: [CONTACT_ID],
        created: {
          timestamp: new Date(),
          user: { id: ACTOR_ID, name: "Ann Actor" },
        },
        demo: {
          title: "Ann Actor added a note.",
          description: `<p><a class="tiptap-mention" data-id="m" data-label="Mia" href="#contact-${MENTIONED_ID}">@Mia</a> please look</p>`,
        },
      },
    ]);
  });

  test("avatar, timestamp and mention open the contact page", async ({
    page,
  }) => {
    await page.goto(`/contacts/view?_id=${CONTACT_ID}`);
    const timeline = page.locator("#tile_events");
    await expect(timeline.getByText("Ann Actor added a note.")).toBeVisible();

    const links = timeline.locator(`a[href*="_id=${ACTOR_ID}"]`);
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveAttribute(
      "href",
      new RegExp(`/contacts/view\\?_id=${ACTOR_ID}$`),
    );

    const mention = timeline.getByRole("link", { name: "@Mia" });
    await expect(mention).toHaveAttribute(
      "href",
      new RegExp(`/contacts/view\\?_id=${MENTIONED_ID}$`),
    );
    await mention.click();
    await expect(page).toHaveURL(
      new RegExp(`/contacts/view\\?_id=${MENTIONED_ID}$`),
    );
  });
});
