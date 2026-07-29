import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { test, expect } from "../fixtures.js";

// Read the shipped enum rather than restating hexes, so a deliberate palette
// change moves the assertions with it.
const STATUSES = yaml.load(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../../modules/shared/enums/action_statuses.yaml",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);

// Covers the overview page's card + title chrome:
//   - the card head is tinted with the action's status colour
//   - the status badge carries the three-colour contract (pale fill,
//     borderColor outline, saturated titleColor text)
//   - a collapsed card has no body padding (no dead white strip)
//   - the title bar names the entity type and links to the entity record
//
// Also doubles as the manual preview: PREVIEW=1 seeds the same data, then holds
// the browser open on the page (Playwright disables the test timeout while
// paused) so the chrome can be eyeballed and clicked through. Ephemeral Mongo,
// so it touches no real database:
//
//   PREVIEW=1 pnpm e2e --headed workflows/overview-chrome.spec.js

function rgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

test("the overview card chrome reflects each action's status, and the title bar links the entity", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });
  await mdb.seed("things", [{ _id: "thing-chrome", title: "Acme Widget" }]);
  const { workflow_id } = await workflow.start({
    workflow_type: "form-lifecycle",
    entity_id: "thing-chrome",
    entity_collection: "things-collection",
  });

  // Save a draft through the real edit page so one card has data to render,
  // then spread the actions across statuses so several tints are on screen.
  const actions = await mdb
    .collection("actions")
    .find({ workflow_id: String(workflow_id) })
    .toArray();
  const reviewed = actions.find((a) => a.type === "reviewed-form");
  const optional = actions.find((a) => a.type === "optional-form");

  await ldf.goto(
    `/workflows/form-lifecycle-reviewed-form-edit?action_id=${reviewed._id}`,
  );
  await ldf.block("form.summary").do.fill("Installed and commissioned on site");
  await ldf
    .block("form.notes")
    .do.fill("Customer signed off. Spares left with the site manager.");
  await ldf.block("button_progress").do.click();
  await workflow.assertStatus(reviewed._id.toString(), "in-progress");

  await workflow.setStage(reviewed._id.toString(), "done");
  await workflow.setStage(optional._id.toString(), "changes-required");

  await ldf.goto(`/workflows/workflow-overview?workflow_id=${workflow_id}`);

  // Title bar: the eyebrow names the entity ("{type}: {name}" — the name comes
  // from the config's entity.data routine), and the subtitle beneath is the
  // entity id alone, linked to its record. The id carries no type prefix
  // precisely because the eyebrow already states it.
  await expect(page.getByText("Thing: Acme Widget")).toBeVisible();
  const entityLink = page.getByRole("link", { name: "thing-chrome" });
  await expect(entityLink).toBeVisible();
  await expect(entityLink).toHaveAttribute(
    "href",
    "/thing-view?_id=thing-chrome",
  );

  // Block ids interpolate the list INDEX (`groups_list.0.actions.0.card`), so
  // address each card by the badge it carries rather than by action type.
  const cardFor = (label) =>
    page
      .locator(".ant-card")
      .filter({ has: page.locator(".ant-tag", { hasText: label }) });

  // Card head tinted with the status `color`; badge on the three-colour contract.
  const doneCard = cardFor("Done");
  const head = doneCard.locator(".ant-card-head").first();
  await expect(head).toHaveCSS("background-color", rgb(STATUSES.done.color));

  const badge = doneCard.locator(".ant-tag").first();
  await expect(badge).toHaveCSS("background-color", rgb(STATUSES.done.color));
  await expect(badge).toHaveCSS("border-color", rgb(STATUSES.done.borderColor));
  await expect(badge).toHaveCSS("color", rgb(STATUSES.done.titleColor));

  const changesHead = cardFor("Changes Required")
    .locator(".ant-card-head")
    .first();
  await expect(changesHead).toHaveCSS(
    "background-color",
    rgb(STATUSES["changes-required"].color),
  );

  // Collapsed by default -> the body carries no padding, so the card is just
  // its header rather than a header plus an empty white strip.
  const body = doneCard.locator(".ant-card-body").first();
  await expect(body).toHaveCSS("padding", "0px");

  // Expanding restores the padding and renders the submitted values.
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(body).toHaveCSS("padding", "24px");
  await expect(
    page.getByText("Installed and commissioned on site"),
  ).toBeVisible();

  if (process.env.PREVIEW) {
    await page.pause();
  }
});
