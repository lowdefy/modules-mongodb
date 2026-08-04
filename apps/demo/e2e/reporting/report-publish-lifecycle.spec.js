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
// not the report page. That is deliberate rather than a shortcut: the page cannot
// be asserted positively under this harness — @lowdefy/server-e2e omits urlQuery
// where @lowdefy/server threads it, so the report page renders its fallback
// regardless of what is stored (documented at length in formatted-report.spec.js,
// and the fixme'd page assertions live in report-resolve-shared.spec.js). A
// "B cannot open it" assertion here would pass whether the model worked or not,
// so it is not made. The scopes are endpoint-driven and mean what they say.

async function scopeTitles(page, scope) {
  const { body } = await callEndpoint(page, "list-reports", { scope });
  return (body?.response?.reports ?? []).map((r) => r.title).sort();
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
  expect(await scopeTitles(page, "shared")).not.toContain(TITLE);
  expect(await scopeTitles(page, "all")).not.toContain(TITLE);

  await ldf.user(USER_A);
  expect(await scopeTitles(page, "mine")).toContain(TITLE);

  // ── Act 2: published ───────────────────────────────────────────────────────
  // A holds a share_roles role, so A may publish A's own report.
  const published = await callEndpoint(page, "set-report-visibility", {
    report_id: "lifecycle",
    visibility: "shared",
  });
  expect(published.body).toMatchObject({ ok: true, modifiedCount: 1 });

  // Publishing does not remove a report from Mine — it is in both.
  expect(await scopeTitles(page, "mine")).toContain(TITLE);
  expect(await scopeTitles(page, "shared")).toContain(TITLE);

  // ── Act 3: visible to B, and actionable within limits ──────────────────────
  await ldf.user(USER_B);
  expect(await scopeTitles(page, "shared")).toContain(TITLE);
  expect(await scopeTitles(page, "all")).toContain(TITLE);

  // B is not the owner, and the list says so — that flag is what makes the page
  // hide the edit actions.
  const { body: listed } = await callEndpoint(page, "list-reports", {
    scope: "shared",
  });
  const row = listed.response.reports.find((r) => r.title === TITLE);
  expect(row.is_owner).toBe(false);
  expect(row.visibility).toBe("shared");
  // Never leaked, whatever the scope: who else favourited a report.
  expect(row).not.toHaveProperty("favourite_of");

  // What B MAY do: star it, and copy it.
  await callEndpoint(page, "set-report-favourite", {
    report_id: "lifecycle",
    favourite: true,
  });
  expect((await readReport(mdb, "lifecycle")).favourite_of).toContain(USER_B.id);

  const { body: copy } = await callEndpoint(page, "duplicate-report", {
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
  expect(rename.body).toMatchObject({ modifiedCount: 0 });

  const remove = await callEndpoint(page, "delete-report", {
    report_id: "lifecycle",
  });
  expect(remove.body).toMatchObject({ deletedCount: 0 });

  const restore = await callEndpoint(page, "restore-report", {
    report_id: "lifecycle",
  });
  expect(restore.body).toMatchObject({ modifiedCount: 0 });

  const dropSection = await callEndpoint(page, "remove-report-section", {
    report_id: "lifecycle",
    section_id: "s4",
  });
  expect(dropSection.body).toMatchObject({ success: false, status: "reject" });

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
  expect(retracted.body).toMatchObject({ ok: true, modifiedCount: 1 });

  await ldf.user(USER_B);
  expect(await scopeTitles(page, "shared")).not.toContain(TITLE);
  expect(await scopeTitles(page, "all")).not.toContain(TITLE);

  // B's star SURVIVES in the document but goes dormant, because the favourites
  // scope carries the readable predicate as well as the marker. A favourite is
  // not a grant, and nothing $pulls on unpublish.
  expect((await readReport(mdb, "lifecycle")).favourite_of).toContain(
    USER_B.id,
  );
  expect(await scopeTitles(page, "favourites")).not.toContain(TITLE);

  // ── Act 5: B's copy is unaffected by any of it ─────────────────────────────
  // This is what "duplicate is the escape hatch" means once the original is
  // withdrawn: B keeps a report B controls.
  const kept = await readReport(mdb, copyId);
  expect(kept.owner).toEqual({ user_id: USER_B.id, name: USER_B.name });
  expect(kept.visibility).toBe("private");
  expect(kept.deleted).toBeNull();
  expect(await scopeTitles(page, "mine")).toContain(kept.title);
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
  expect(await scopeTitles(page, "shared")).toContain("Published then deleted");

  await ldf.user(USER_A);
  const { body } = await callEndpoint(page, "delete-report", {
    report_id: "lifecycle-delete",
  });
  expect(body).toMatchObject({ ok: true, deletedCount: 1 });

  // Gone for the audience it was published to...
  await ldf.user(USER_B);
  expect(await scopeTitles(page, "shared")).not.toContain(
    "Published then deleted",
  );
  expect(await scopeTitles(page, "all")).not.toContain(
    "Published then deleted",
  );

  // ...and gone from the owner's live list, but recoverable — the stamp is a
  // filter, not an erasure. Nothing in this module hard-deletes.
  await ldf.user(USER_A);
  expect(await scopeTitles(page, "mine")).not.toContain(
    "Published then deleted",
  );
  expect(await scopeTitles(page, "deleted")).toContain(
    "Published then deleted",
  );

  const restored = await callEndpoint(page, "restore-report", {
    report_id: "lifecycle-delete",
  });
  expect(restored.body).toMatchObject({ ok: true, modifiedCount: 1 });

  // Restore returns it to private, so it does NOT go back in front of the app.
  expect(await scopeTitles(page, "mine")).toContain("Published then deleted");
  await ldf.user(USER_B);
  expect(await scopeTitles(page, "shared")).not.toContain(
    "Published then deleted",
  );
});
