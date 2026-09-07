import { test, expect } from "../fixtures.js";
import {
  REPORTS,
  USER_A,
  USER_B,
  callEndpoint,
  changeStamp,
  reportDoc,
} from "./helpers.js";

// `set-report-visibility` gates its two directions differently: publishing
// needs owner AND a share_roles role, unpublishing needs owner OR such a role.
// A build check compiles the `_build.if` + `_user.hasSomeRoles` form but cannot
// evaluate a role match, so this matrix is the only thing that proves the gate.
//
// The demo entry sets `share_roles: [report-publisher]`, which USER_A holds and
// USER_B does not. Both cells that need an owner who is not a role holder seed
// the report to USER_B instead of inventing a third user.
//
// Two ways a call fails, and they are not interchangeable. The role half is a
// fact about the caller, so it rejects before the write and the response is an
// error. The owner half is a document match, so a non-owner's call is a
// successful update that matched nothing — `modifiedCount: 0`. That is the
// design's position that the caller is not told why their call did nothing, so
// these specs assert the count rather than a message.

async function visibilityOf(mdb, id) {
  const doc = await mdb.collection(REPORTS).findOne({ _id: id });
  return doc.visibility;
}

test("the owner, holding the share role, publishes their report", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-vis-publish", title: "To publish", owner: USER_A }),
  ]);

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-publish",
    visibility: "shared",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 1 });
  expect(await visibilityOf(mdb, "e2e-vis-publish")).toBe("shared");
});

test("the owner without the share role cannot publish", async ({
  ldf,
  page,
  mdb,
}) => {
  // Owned by USER_B, who holds no publishing role — so the rejection is about
  // the role and nothing else.
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-vis-no-role", title: "No role", owner: USER_B }),
  ]);

  await ldf.user(USER_B);
  const { rejected } = await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-no-role",
    visibility: "shared",
  });

  expect(rejected).toBe(true);
  expect(await visibilityOf(mdb, "e2e-vis-no-role")).toBe("private");
});

test("a non-owner holding the share role cannot publish", async ({
  ldf,
  page,
  mdb,
}) => {
  // The case that proves publish needs BOTH halves: USER_A's role clears the
  // gate, and the owner clause in the filter stops the write anyway. Publishing
  // someone else's private report would expose work they never chose to share.
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-vis-not-mine", title: "Not mine", owner: USER_B }),
  ]);

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-not-mine",
    visibility: "shared",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 0 });
  expect(await visibilityOf(mdb, "e2e-vis-not-mine")).toBe("private");
});

test("the owner unpublishes their shared report", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-vis-retract",
      title: "To retract",
      owner: USER_A,
      visibility: "shared",
    }),
  ]);

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-retract",
    visibility: "private",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 1 });
  expect(await visibilityOf(mdb, "e2e-vis-retract")).toBe("private");
});

test("a share role holder unpublishes someone else's shared report", async ({
  ldf,
  page,
  mdb,
}) => {
  // The moderation power, and the reason for the whole asymmetry: it is what
  // keeps a published report retractable after its author's role is revoked,
  // after the author leaves, or after share_roles is removed from the app.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-vis-moderate",
      title: "Someone else's",
      owner: USER_B,
      visibility: "shared",
    }),
  ]);

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-moderate",
    visibility: "private",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 1 });
  expect(await visibilityOf(mdb, "e2e-vis-moderate")).toBe("private");
});

test("a non-owner without the share role cannot unpublish", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-vis-stays-shared",
      title: "Stays shared",
      owner: USER_A,
      visibility: "shared",
    }),
  ]);

  await ldf.user(USER_B);
  const { response } = await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-stays-shared",
    visibility: "private",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 0 });
  expect(await visibilityOf(mdb, "e2e-vis-stays-shared")).toBe("shared");
});

test("a deleted report cannot be published", async ({ ldf, page, mdb }) => {
  // Publishing is readability, and a soft-deleted report is not readable at all
  // — so the not-deleted predicate in the filter has to hold here even though
  // the caller is the owner and holds the role.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-vis-deleted",
      title: "Deleted",
      owner: USER_A,
      deleted: changeStamp(USER_A),
    }),
  ]);

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-deleted",
    visibility: "shared",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 0 });
  expect(await visibilityOf(mdb, "e2e-vis-deleted")).toBe("private");
});

test("unpublishing changes visibility and nothing else", async ({
  ldf,
  page,
  mdb,
}) => {
  // "Publish is independent of everything else", concretely: unpublishing does
  // not archive, delete or unfavourite, and it does not stamp `updated` — the
  // reports list sorts on updated.timestamp, so stamping here would reorder the
  // list on an act that changes who may see a report, not what it is.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-vis-one-field",
      title: "One field",
      owner: USER_A,
      visibility: "shared",
      favouriteOf: [USER_A.id, USER_B.id],
    }),
  ]);
  const before = await mdb
    .collection(REPORTS)
    .findOne({ _id: "e2e-vis-one-field" });

  await ldf.user(USER_A);
  await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-one-field",
    visibility: "private",
  });

  const after = await mdb
    .collection(REPORTS)
    .findOne({ _id: "e2e-vis-one-field" });
  expect(after.visibility).toBe("private");
  expect(after.updated).toEqual(before.updated);
  expect(after.favourite_of).toEqual(before.favourite_of);
  expect(after.deleted).toEqual(before.deleted);
});

test("an unrecognised visibility value is rejected", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-vis-invalid", title: "Invalid", owner: USER_A }),
  ]);

  await ldf.user(USER_A);
  const { rejected } = await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-vis-invalid",
    visibility: "public",
  });

  expect(rejected).toBe(true);
  expect(await visibilityOf(mdb, "e2e-vis-invalid")).toBe("private");
});
