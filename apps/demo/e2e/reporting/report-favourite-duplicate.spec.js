import { test, expect } from "../fixtures.js";
import {
  REPORTS,
  SPEC,
  USER_A,
  USER_B,
  callEndpoint,
  changeStamp,
  reportDoc,
} from "./helpers.js";

// The two write-side acts a non-owner is allowed: star a readable report, and
// copy one. Both use the readable-report predicate rather than an owner match —
// not deleted, and yours or shared — because both are read-side acts on
// something the caller is already entitled to see.
//
// As elsewhere, the predicate lives in the filter, so an unauthorized call is a
// successful update that matched nothing: 200 with `modifiedCount: 0`.

async function readReport(mdb, id) {
  return mdb.collection(REPORTS).findOne({ _id: id });
}

test("the owner stars and unstars their own report", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-fav-own", title: "Mine", owner: USER_A }),
  ]);
  await ldf.user(USER_A);

  await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-own",
    favourite: true,
  });
  expect((await readReport(mdb, "e2e-fav-own")).favourite_of).toEqual([
    USER_A.id,
  ]);

  await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-own",
    favourite: false,
  });
  expect((await readReport(mdb, "e2e-fav-own")).favourite_of).toEqual([]);
});

test("a non-owner stars a shared report, and only their own marker lands", async ({
  ldf,
  page,
  mdb,
}) => {
  // The per-user half: a ★ on a shared report must not be everyone's ★.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-fav-shared",
      title: "Shared",
      owner: USER_A,
      visibility: "shared",
      favouriteOf: [USER_A.id],
    }),
  ]);

  await ldf.user(USER_B);
  await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-shared",
    favourite: true,
  });

  const after = await readReport(mdb, "e2e-fav-shared");
  expect(after.favourite_of.sort()).toEqual([USER_A.id, USER_B.id].sort());
});

test("a repeat star is idempotent", async ({ ldf, page, mdb }) => {
  // $addToSet rather than $push, so a double-click cannot list the same user
  // twice — which would also double-count them in any future favourite count.
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-fav-twice", title: "Mine", owner: USER_A }),
  ]);
  await ldf.user(USER_A);

  await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-twice",
    favourite: true,
  });
  await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-twice",
    favourite: true,
  });

  expect((await readReport(mdb, "e2e-fav-twice")).favourite_of).toEqual([
    USER_A.id,
  ]);
});

test("a non-owner cannot star a private report", async ({ ldf, page, mdb }) => {
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-fav-private", title: "Private", owner: USER_A }),
  ]);

  await ldf.user(USER_B);
  const { body } = await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-private",
    favourite: true,
  });

  expect(body).toMatchObject({ ok: true, modifiedCount: 0 });
  expect((await readReport(mdb, "e2e-fav-private")).favourite_of).toEqual([]);
});

test("nobody can star a deleted report", async ({ ldf, page, mdb }) => {
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-fav-deleted",
      title: "Deleted",
      owner: USER_A,
      visibility: "shared",
      deleted: changeStamp(USER_A),
    }),
  ]);

  await ldf.user(USER_A);
  const { body } = await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-deleted",
    favourite: true,
  });

  expect(body).toMatchObject({ ok: true, modifiedCount: 0 });
});

test("favouriting does not stamp updated", async ({ ldf, page, mdb }) => {
  // Deliberate: a stamp here would jump the report to the top of EVERY user's
  // list each time anyone starred it, because the list sorts on
  // updated.timestamp.
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-fav-stamp", title: "Mine", owner: USER_A }),
  ]);
  const before = await readReport(mdb, "e2e-fav-stamp");

  await ldf.user(USER_A);
  await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-stamp",
    favourite: true,
  });

  expect((await readReport(mdb, "e2e-fav-stamp")).updated).toEqual(
    before.updated,
  );
});

test("a non-boolean favourite is rejected rather than coerced", async ({
  ldf,
  page,
  mdb,
}) => {
  // A truthy string would silently star a report the caller meant to unstar.
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-fav-bad", title: "Mine", owner: USER_A }),
  ]);
  await ldf.user(USER_A);

  for (const favourite of ["false", "yes", 1, null]) {
    const { body } = await callEndpoint(page, "set-report-favourite", {
      report_id: "e2e-fav-bad",
      favourite,
    });
    expect(body).toMatchObject({ success: false, status: "reject" });
  }
  expect((await readReport(mdb, "e2e-fav-bad")).favourite_of).toEqual([]);
});

test("unpublishing leaves the marker in place, dormant", async ({
  ldf,
  page,
  mdb,
}) => {
  // A favourite is not a grant. Nothing $pulls on unpublish — the read filters
  // instead, so the marker survives and works again if the report is
  // republished. The list scope asserts the read half of this; here it is the
  // document half.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-fav-withdrawn",
      title: "Was shared",
      owner: USER_A,
      visibility: "shared",
    }),
  ]);

  await ldf.user(USER_B);
  await callEndpoint(page, "set-report-favourite", {
    report_id: "e2e-fav-withdrawn",
    favourite: true,
  });

  await ldf.user(USER_A);
  await callEndpoint(page, "set-report-visibility", {
    report_id: "e2e-fav-withdrawn",
    visibility: "private",
  });

  const after = await readReport(mdb, "e2e-fav-withdrawn");
  expect(after.visibility).toBe("private");
  expect(after.favourite_of).toContain(USER_B.id);
});

test("a non-owner duplicates a shared report into one they own", async ({
  ldf,
  page,
  mdb,
}) => {
  // spec_version is seeded as 2 so "copied" and "re-stamped as 1" are
  // distinguishable — a source at version 1 would pass either implementation.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-dup-source",
      title: "Original",
      description: "The original description",
      owner: USER_A,
      visibility: "shared",
      favouriteOf: [USER_A.id],
      specVersion: 2,
      conversationId: "conv-of-the-original-author",
    }),
  ]);
  const before = await readReport(mdb, "e2e-dup-source");

  await ldf.user(USER_B);
  const { status, body } = await callEndpoint(page, "duplicate-report", {
    report_id: "e2e-dup-source",
  });

  expect(status).toBe(200);
  expect(body).toMatchObject({ ok: true });
  expect(body.report_id).toBeTruthy();
  expect(body.url).toContain(body.report_id);

  const copy = await readReport(mdb, body.report_id);
  expect(copy.owner).toEqual({ user_id: USER_B.id, name: USER_B.name });
  expect(copy.visibility).toBe("private");
  expect(copy.favourite_of).toEqual([]);
  // Confidentiality, not tidiness: inheriting it would render the owner-only
  // "Continue in chat" on the copy, pointing at the original author's transcript.
  expect(copy.conversation_id).toBeNull();
  expect(copy.spec).toEqual(before.spec);
  // COPIED, not re-stamped — labelling an older spec as the current grammar is
  // the problem spec_version exists to prevent.
  expect(copy.spec_version).toBe(2);
  expect(copy.created.user).toEqual({ name: USER_B.name, id: USER_B.id });
  expect(copy.deleted).toBeNull();

  // The original is untouched.
  expect(await readReport(mdb, "e2e-dup-source")).toEqual(before);
});

test("a non-owner cannot duplicate a private report, and nobody a deleted one", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-dup-private", title: "Private", owner: USER_A }),
    reportDoc({
      id: "e2e-dup-deleted",
      title: "Deleted",
      owner: USER_A,
      visibility: "shared",
      deleted: changeStamp(USER_A),
    }),
  ]);

  await ldf.user(USER_B);
  const priv = await callEndpoint(page, "duplicate-report", {
    report_id: "e2e-dup-private",
  });
  expect(priv.body).toMatchObject({ success: false, status: "reject" });

  await ldf.user(USER_A);
  const del = await callEndpoint(page, "duplicate-report", {
    report_id: "e2e-dup-deleted",
  });
  expect(del.body).toMatchObject({ success: false, status: "reject" });

  expect(await mdb.collection(REPORTS).countDocuments({})).toBe(2);
});

test("the copy resolves, which is what proves the copied spec is valid input", async ({
  ldf,
  page,
  mdb,
}) => {
  // The copy path deliberately does not re-run validateReportSpec. This is the
  // assertion that the copied spec is still valid input to it — the validator's
  // idempotency exercised through the write path.
  await mdb.seed("demo_orders", [
    { _id: "o1", region: "EU", status: "paid", total: 10, quantity: 1 },
  ]);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-dup-resolves",
      title: "Resolvable",
      owner: USER_A,
      visibility: "shared",
      spec: SPEC,
    }),
  ]);

  await ldf.user(USER_B);
  const { body } = await callEndpoint(page, "duplicate-report", {
    report_id: "e2e-dup-resolves",
  });

  const copy = await readReport(mdb, body.report_id);
  expect(copy.spec.sections.map((s) => s.id)).toEqual(
    SPEC.sections.map((s) => s.id),
  );

  // Opening the copy is the real proof. Blocked by the same urlQuery harness gap
  // documented in formatted-report.spec.js — @lowdefy/server-e2e omits urlQuery
  // where @lowdefy/server threads it, so the report page always renders its
  // fallback here regardless of the spec. Assert the document instead, and see
  // report-resolve-shared.spec.js for the fixme'd page assertions.
});
