import { test, expect } from "../fixtures.js";
import {
  ORDERS,
  REPORTS,
  USER_A,
  USER_B,
  callEndpoint,
  reportDoc,
} from "./helpers.js";

// The one spec that crosses every endpoint. Each of the others asserts a single
// endpoint's authorization; this asserts they COMPOSE, which is what a consumer
// actually depends on: publish, be seen, be acted on by someone else, be
// retracted, and leave that person's copy alone.
//
// The observable throughout is `list-reports` scopes plus the stored document,
// not the report page. The scopes are endpoint-driven and mean what they say, and
// they are the layer publishing actually changes; whether a published report opens
// for a non-owner is asserted directly, on the page, in
// report-resolve-shared.spec.js.

// Membership is asserted by id, never by title. `duplicate-report` copies the
// title verbatim, so once B has a copy the original and the copy are
// indistinguishable by name — a title-based assertion then reads B's own copy as
// the original still being visible, and fails on a leak that isn't there.
async function scopeIds(page, scope) {
  const { response } = await callEndpoint(page, "list-reports", { scope });
  return (response?.reports ?? []).map((r) => r._id).sort();
}

async function readReport(mdb, id) {
  return mdb.collection(REPORTS).findOne({ _id: id });
}

const TITLE = "Quarterly revenue";

test("a report's whole publish life cycle, across two users", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed(REPORTS, [
    reportDoc({ id: "lifecycle", title: TITLE, owner: USER_A }),
  ]);

  // ── Act 1: private ─────────────────────────────────────────────────────────
  // A's report is A's alone. B cannot see it in any scope, including `all` —
  // which is the scope that would leak if the readable predicate were wrong.
  await ldf.user(USER_B);
  expect(await scopeIds(page, "shared")).not.toContain("lifecycle");
  expect(await scopeIds(page, "all")).not.toContain("lifecycle");

  await ldf.user(USER_A);
  expect(await scopeIds(page, "mine")).toContain("lifecycle");

  // ── Act 2: published ───────────────────────────────────────────────────────
  // A holds a share_roles role, so A may publish A's own report.
  const published = await callEndpoint(page, "set-report-visibility", {
    report_id: "lifecycle",
    visibility: "shared",
  });
  expect(published.response).toMatchObject({ ok: true, modifiedCount: 1 });

  // Publishing does not remove a report from Mine — it is in both.
  expect(await scopeIds(page, "mine")).toContain("lifecycle");
  expect(await scopeIds(page, "shared")).toContain("lifecycle");

  // ── Act 3: visible to B, and actionable within limits ──────────────────────
  await ldf.user(USER_B);
  expect(await scopeIds(page, "shared")).toContain("lifecycle");
  expect(await scopeIds(page, "all")).toContain("lifecycle");

  // B is not the owner, and the list says so — that flag is what makes the page
  // hide the edit actions.
  const { response: listed } = await callEndpoint(page, "list-reports", {
    scope: "shared",
  });
  const row = listed.reports.find((r) => r.title === TITLE);
  expect(row.is_owner).toBe(false);
  expect(row.visibility).toBe("shared");
  // Never leaked, whatever the scope: who else favourited a report.
  expect(row).not.toHaveProperty("favourite_of");

  // What B MAY do: star it, and copy it.
  await callEndpoint(page, "set-report-favourite", {
    report_id: "lifecycle",
    favourite: true,
  });
  expect((await readReport(mdb, "lifecycle")).favourite_of).toContain(
    USER_B.id,
  );

  const { response: copy } = await callEndpoint(page, "duplicate-report", {
    report_id: "lifecycle",
  });
  expect(copy).toMatchObject({ ok: true });
  const copyId = copy.report_id;

  // What B MAY NOT do. Rename, delete and remove-a-section are owner-only, and
  // the role B lacks would not help either — the four together are the
  // "read-plus-duplicate" boundary stated as one assertion block.
  const rename = await callEndpoint(page, "set-report-title", {
    report_id: "lifecycle",
    title: "Renamed by a stranger",
  });
  expect(rename.response).toMatchObject({ modifiedCount: 0 });

  const remove = await callEndpoint(page, "delete-report", {
    report_id: "lifecycle",
  });
  expect(remove.response).toMatchObject({ deletedCount: 0 });

  const restore = await callEndpoint(page, "restore-report", {
    report_id: "lifecycle",
  });
  expect(restore.response).toMatchObject({ modifiedCount: 0 });

  const dropSection = await callEndpoint(page, "remove-report-section", {
    report_id: "lifecycle",
    section_id: "s4",
  });
  expect(dropSection.rejected).toBe(true);

  const untouched = await readReport(mdb, "lifecycle");
  expect(untouched.title).toBe(TITLE);
  expect(untouched.deleted).toBeNull();
  expect(untouched.spec.sections).toHaveLength(6);

  // ── Act 4: unpublished ─────────────────────────────────────────────────────
  await ldf.user(USER_A);
  const retracted = await callEndpoint(page, "set-report-visibility", {
    report_id: "lifecycle",
    visibility: "private",
  });
  expect(retracted.response).toMatchObject({ ok: true, modifiedCount: 1 });

  await ldf.user(USER_B);
  expect(await scopeIds(page, "shared")).not.toContain("lifecycle");
  expect(await scopeIds(page, "all")).not.toContain("lifecycle");

  // B's star SURVIVES in the document but goes dormant, because the favourites
  // scope carries the readable predicate as well as the marker. A favourite is
  // not a grant, and nothing $pulls on unpublish.
  expect((await readReport(mdb, "lifecycle")).favourite_of).toContain(
    USER_B.id,
  );
  expect(await scopeIds(page, "favourites")).not.toContain("lifecycle");

  // ── Act 5: B's copy is unaffected by any of it ─────────────────────────────
  // This is what "duplicate is the escape hatch" means once the original is
  // withdrawn: B keeps a report B controls.
  const kept = await readReport(mdb, copyId);
  expect(kept.owner).toEqual({ user_id: USER_B.id, name: USER_B.name });
  expect(kept.visibility).toBe("private");
  expect(kept.deleted).toBeNull();
  expect(await scopeIds(page, "mine")).toContain(copyId);
});

test("deleting a published report drops it from everyone's Shared scope", async ({
  ldf,
  page,
  mdb,
}) => {
  // One soft delete buys this for free — every read filters the stamp, so there
  // is no separate unpublish step and no state where a deleted report is still
  // in front of the app.
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "lifecycle-delete",
      title: "Published then deleted",
      owner: USER_A,
      visibility: "shared",
    }),
  ]);

  await ldf.user(USER_B);
  expect(await scopeIds(page, "shared")).toContain("lifecycle-delete");

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "delete-report", {
    report_id: "lifecycle-delete",
  });
  expect(response).toMatchObject({ ok: true, deletedCount: 1 });

  // Gone for the audience it was published to...
  await ldf.user(USER_B);
  expect(await scopeIds(page, "shared")).not.toContain("lifecycle-delete");
  expect(await scopeIds(page, "all")).not.toContain("lifecycle-delete");

  // ...and gone from the owner's live list, but recoverable — the stamp is a
  // filter, not an erasure. Nothing in this module hard-deletes.
  await ldf.user(USER_A);
  expect(await scopeIds(page, "mine")).not.toContain("lifecycle-delete");
  expect(await scopeIds(page, "deleted")).toContain("lifecycle-delete");

  const restored = await callEndpoint(page, "restore-report", {
    report_id: "lifecycle-delete",
  });
  expect(restored.response).toMatchObject({ ok: true, modifiedCount: 1 });

  // Restore returns it to private, so it does NOT go back in front of the app.
  expect(await scopeIds(page, "mine")).toContain("lifecycle-delete");
  await ldf.user(USER_B);
  expect(await scopeIds(page, "shared")).not.toContain("lifecycle-delete");
});
