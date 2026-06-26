import { test, expect } from "../fixtures.js";
import { getBlock } from "@lowdefy/e2e-utils";

// Cluster: field-gallery / render sweep (Part 22 task 8).
//
// Mode: Spine (UI-heavy). This is the suite's ONE named exception to the
// "no surface census" principle (design Principle 3): per-field renderability
// has no other coverage home — a field component no fixture uses has zero
// coverage — so this sweep exercises EVERY renderable component in
// modules/workflows/components/fields/. It is a roster, not a behavior matrix.
//
// Roster coverage is 28 of 29. The one exclusion is `location`: it renders the
// block types GoogleAPIProvider / PlacesAutocomplete, which NO published Lowdefy
// plugin provides (verified 2026-06-25) — the field is currently unrenderable
// and fails the build if included. See the documented exception in
// `workflow_config/field-gallery/gallery.yaml`. That exclusion is named in
// EXCLUDED below so the gap stays visible in review.
//
// FIELD_KEYS is a literal list of each component's primary block id (== its form
// key). The assertion loop labels each block by key, so a component that stops
// rendering names itself in the failure. We assert against the universal
// `#bl-{id}` wrapper (getBlock) rather than `ldf.block(key).expect.visible()`,
// because the roster mixes input blocks with display blocks (Divider, Html,
// Title, Alert) that have no per-type e2e helper — the wrapper assertion is the
// uniform "closest applicable assertion" the task calls for.

const WORKFLOW_TYPE = "field-gallery";

const FIELD_KEYS = [
  // ── display / structure ──────────────────────────────────────────────────
  "gallery_title", // title
  "gallery_divider", // section_title
  "gallery_html", // html
  "gallery_alert", // alert
  "gallery_label", // label
  "gallery_box", // box
  "gallery_section", // section
  "gallery_button", // button
  // ── text ───────────────────────────────────────────────────────────────────
  "form.text_input", // text_input
  "form.text_area", // text_area
  "form.rich_text", // tiptap_input
  // ── numeric ──────────────────────────────────────────────────────────────────
  "form.number", // number
  // ── date ─────────────────────────────────────────────────────────────────────
  "form.date_selector", // date_selector
  "form.date_range_selector", // date_range_selector
  // ── choice ───────────────────────────────────────────────────────────────────
  "form.selector", // selector
  "form.multiple_selector", // multiple_selector
  "form.radio_selector", // radio_selector
  "form.checkbox_selector", // checkbox_selector
  "form.button_selector", // button_selector
  "form.checkbox_switch", // checkbox_switch
  "form.yes_no_selector", // yes_no_selector
  "form.enum_selector", // enum_selector
  // ── files ─────────────────────────────────────────────────────────────────────
  "form.file_upload", // file_upload (inner S3UploadDragger carries the key)
  "form.file_download", // file_download (inner S3Download carries the key)
  // ── contact (wrap the contacts module's contact-selector) ──────────────────────
  "form.contact", // contact
  "form.stakeholders", // multiple_contact
  // ── value + dynamic list ─────────────────────────────────────────────────────
  "form.label_value", // label_value
  "form.devices", // controlled_list (inner ControlledList carries the key)
];

// EXCLUDED (unrenderable — no plugin provides its block types): location.
// Re-include `form.location` here the moment a plugin ships GoogleAPIProvider /
// PlacesAutocomplete (or the field is reworked onto available blocks).
const EXCLUDED = ["form.location"];

test("every renderable field component (28/29) renders on the gallery edit page", async ({
  ldf,
  mdb,
  workflow,
  page,
}) => {
  // Guard the census exception: the roster size is fixed and deliberate. Adding
  // a 29th renderable component must be a conscious edit to FIELD_KEYS, not a
  // silent drift — and EXCLUDED documents the one component left out and why.
  expect(FIELD_KEYS).toHaveLength(28);
  expect(EXCLUDED).toEqual(["form.location"]);

  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });
  await mdb.seed("things", [{ _id: "thing-gallery", title: "Gallery Thing" }]);
  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: "thing-gallery",
    entity_collection: "things-collection",
  });

  const gallery = await mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflow_id), type: "gallery" });
  expect(gallery?.status?.[0]?.stage).toBe("action-required");
  const actionId = gallery._id.toString();

  // Open the emitted per-action edit page once. makeActionPages renders the
  // form via the per-field substitution (makeActionsForm), so each component is
  // a real block on this page.
  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-gallery-edit?action_id=${actionId}`,
  );

  // Reachability sweep: every component's primary block renders. No interaction
  // beyond what rendering requires.
  for (const key of FIELD_KEYS) {
    await expect(
      getBlock(page, key),
      `field component block "${key}" should render on the gallery edit page`,
    ).toBeVisible();
  }
});
