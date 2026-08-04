import { test, expect } from "../fixtures.js";
import {
  REPORTS,
  USER_A,
  USER_B,
  callEndpoint,
  changeStamp,
  reportDoc,
} from "./helpers.js";

// Two owner-only writes, paired because they differ on exactly one thing worth
// seeing side by side: `set-report-title` stamps `updated`, `restore-report`
// deliberately does not. The repo rule is a stamp on every write, so the restore
// assertion below is what stops someone "fixing" the sort position later without
// reading why.
//
// Failures present two ways here, as in report-visibility.spec.js. The owner
// match is in the update filter, so a non-owner's call is a SUCCESSFUL update
// that matched nothing — 200 with `modifiedCount: 0`. Payload validation
// rejects, so a bad title is an error status.

async function readReport(mdb, id) {
  return mdb.collection(REPORTS).findOne({ _id: id });
}

test("the owner renames their report and the change is stamped", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-rename", title: "Before", owner: USER_A }),
  ]);
  const before = await readReport(mdb, "e2e-rename");

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "set-report-title", {
    report_id: "e2e-rename",
    title: "After",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 1 });

  const after = await readReport(mdb, "e2e-rename");
  expect(after.title).toBe("After");
  expect(after.updated.timestamp.getTime()).toBeGreaterThan(
    before.updated.timestamp.getTime(),
  );
  expect(after.updated.user).toEqual({ name: USER_A.name, id: USER_A.id });
});

test("a rename does not touch the spec", async ({ ldf, page, mdb }) => {
  // title is a document field, so a rename writes one field. If this fails, the
  // endpoint is writing spec.title and the two titles can drift apart.
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-rename-spec", title: "Before", owner: USER_A }),
  ]);
  const before = await readReport(mdb, "e2e-rename-spec");

  await ldf.user(USER_A);
  await callEndpoint(page, "set-report-title", {
    report_id: "e2e-rename-spec",
    title: "After",
  });

  const after = await readReport(mdb, "e2e-rename-spec");
  expect(after.spec).toEqual(before.spec);
});

test("a non-owner cannot rename a report they can read", async ({
  ldf,
  page,
  mdb,
}) => {
  // Seeded shared, so USER_B can genuinely read it. That is the point: this
  // proves readability is not writability.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-rename-shared",
      title: "Not yours to rename",
      owner: USER_A,
      visibility: "shared",
    }),
  ]);

  await ldf.user(USER_B);
  const { response } = await callEndpoint(page, "set-report-title", {
    report_id: "e2e-rename-shared",
    title: "Renamed by a stranger",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 0 });
  expect((await readReport(mdb, "e2e-rename-shared")).title).toBe(
    "Not yours to rename",
  );
});

test("an empty or over-cap title is rejected", async ({ ldf, page, mdb }) => {
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-rename-invalid", title: "Keep me", owner: USER_A }),
  ]);
  await ldf.user(USER_A);

  for (const title of ["", "x".repeat(201), null, 7]) {
    const { body, response, rejected } = await callEndpoint(
      page,
      "set-report-title",
      {
        report_id: "e2e-rename-invalid",
        title,
      },
    );
    expect(rejected).toBe(true);
  }

  // The cap is MAX_LABEL_LENGTH, so exactly 200 is accepted — a rename that
  // rejected what the validator accepts would be a different bug.
  const { response } = await callEndpoint(page, "set-report-title", {
    report_id: "e2e-rename-invalid",
    title: "x".repeat(200),
  });
  expect(response).toMatchObject({ ok: true, modifiedCount: 1 });
});

test("the owner restores a deleted report, and it comes back private", async ({
  ldf,
  page,
  mdb,
}) => {
  // Seeded as shared when it was deleted, so this also asserts restore forces
  // private rather than handing it back to the whole app unread.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-restore",
      title: "Deleted and shared",
      owner: USER_A,
      visibility: "shared",
      deleted: changeStamp(USER_A),
    }),
  ]);

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "restore-report", {
    report_id: "e2e-restore",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 1 });

  const after = await readReport(mdb, "e2e-restore");
  expect(after.deleted).toBeNull();
  expect(after.visibility).toBe("private");
});

test("a restore does not stamp updated", async ({ ldf, page, mdb }) => {
  // Deliberate, and the reason is the report page's provenance line: it states
  // when the SPEC last changed, and a restore changes nothing about the spec.
  // Do not "fix" the sort position by stamping here.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-restore-stamp",
      title: "Deleted",
      owner: USER_A,
      deleted: changeStamp(USER_A),
    }),
  ]);
  const before = await readReport(mdb, "e2e-restore-stamp");

  await ldf.user(USER_A);
  await callEndpoint(page, "restore-report", {
    report_id: "e2e-restore-stamp",
  });

  const after = await readReport(mdb, "e2e-restore-stamp");
  expect(after.updated).toEqual(before.updated);
});

test("a non-owner cannot restore, and holding the share role does not help", async ({
  ldf,
  page,
  mdb,
}) => {
  // USER_A holds the publishing role. Restore is owner-only, so the role buys
  // nothing here — its only extra power is unpublish.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-restore-other",
      title: "Someone else's deleted report",
      owner: USER_B,
      deleted: changeStamp(USER_B),
    }),
  ]);

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "restore-report", {
    report_id: "e2e-restore-other",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 0 });
  expect((await readReport(mdb, "e2e-restore-other")).deleted).not.toBeNull();
});

test("restoring a live report is a no-op", async ({ ldf, page, mdb }) => {
  // The filter requires the stamp to be present, so a live report matches
  // nothing rather than being silently forced private.
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-restore-live",
      title: "Live and shared",
      owner: USER_A,
      visibility: "shared",
    }),
  ]);

  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "restore-report", {
    report_id: "e2e-restore-live",
  });

  expect(response).toMatchObject({ ok: true, modifiedCount: 0 });
  expect((await readReport(mdb, "e2e-restore-live")).visibility).toBe("shared");
});
