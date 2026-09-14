import { test, expect } from "../fixtures.js";
import {
  ORDERS,
  REPORTS,
  SPEC,
  USER_A,
  USER_B,
  callEndpoint,
  changeStamp,
  reportDoc,
} from "./helpers.js";

// The only spec write in the module, and the cascade is the whole point: a naive
// removal produces a document validateReportSpec rejects, which breaks the report
// on the NEXT resolve rather than at the moment of the edit. A test that only
// drops a standalone section proves nothing.
//
// SPEC's shape matters here: s3 is a select filter on `status`, and s1 (table) and
// s2 (chart) both bind it via filterBy. So dropping s3 must strip `status` from
// both, and dropping s1 AND s2 must take s3 with them.

async function sectionsOf(mdb, id) {
  const doc = await mdb.collection(REPORTS).findOne({ _id: id });
  return doc.spec.sections;
}

async function seedFull(mdb, id, extra = {}) {
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed(REPORTS, [
    reportDoc({ id, title: "Full report", owner: USER_A, ...extra }),
  ]);
}

test("dropping a filter strips its field from every section that named it", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedFull(mdb, "e2e-rm-filter");
  await ldf.user(USER_A);

  const { response } = await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-filter",
    section_id: "s3",
  });

  expect(response).toMatchObject({ ok: true });

  const sections = await sectionsOf(mdb, "e2e-rm-filter");
  expect(sections.map((s) => s.id)).toEqual(["s0", "s1", "s2", "s4", "s5"]);
  // The cascade: nothing may still name a filter field the report no longer has.
  for (const section of sections) {
    expect(section.filterBy ?? []).not.toContain("status");
  }
});

test("dropping the last section bound to a filter takes the filter too", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedFull(mdb, "e2e-rm-orphan");
  await ldf.user(USER_A);

  // s1 and s2 are the only two binding `status`. After both go, s3 is bound by
  // nothing, and validateReportSpec requires every filter to be bound.
  await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-orphan",
    section_id: "s1",
  });
  expect((await sectionsOf(mdb, "e2e-rm-orphan")).map((s) => s.id)).toContain(
    "s3",
  );

  await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-orphan",
    section_id: "s2",
  });

  const sections = await sectionsOf(mdb, "e2e-rm-orphan");
  expect(sections.map((s) => s.id)).toEqual(["s0", "s4", "s5"]);
  expect(sections.some((s) => s.type === "filter")).toBe(false);
});

test("dropping a standalone section leaves everything else untouched", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedFull(mdb, "e2e-rm-standalone");
  const before = await sectionsOf(mdb, "e2e-rm-standalone");
  await ldf.user(USER_A);

  // s4 is a markdown section, bound to nothing.
  await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-standalone",
    section_id: "s4",
  });

  const after = await sectionsOf(mdb, "e2e-rm-standalone");
  expect(after).toEqual(before.filter((s) => s.id !== "s4"));
});

test("surviving sections keep the ids they had", async ({ ldf, page, mdb }) => {
  // The durable-id property. If ids were re-derived from position, s4 and s5
  // would shift down to s3 and s4 here — and a second removal would then address
  // a different section than the caller meant.
  await seedFull(mdb, "e2e-rm-ids");
  await ldf.user(USER_A);

  await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-ids",
    section_id: "s0",
  });

  expect((await sectionsOf(mdb, "e2e-rm-ids")).map((s) => s.id)).toEqual([
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
  ]);
});

test("a removal that would empty the report is refused, naming the alternative", async ({
  ldf,
  page,
  mdb,
}) => {
  // One chart plus the filter driving it: dropping the chart orphans the filter,
  // the cascade takes it, and nothing is left. This is easy to reach rather than
  // obscure, which is why the refusal exists.
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-rm-empty",
      title: "One chart, one filter",
      owner: USER_A,
      spec: {
        sections: [
          {
            id: "c0",
            type: "chart",
            chart: "bar",
            label: "By status",
            query: SPEC.sections[2].query,
            x: "status",
            y: ["revenue"],
            filterBy: ["status"],
          },
          {
            id: "f0",
            type: "filter",
            control: "select",
            field: "status",
            label: "Status",
            options: ["paid", "pending"],
          },
        ],
      },
    }),
  ]);
  const before = await sectionsOf(mdb, "e2e-rm-empty");
  await ldf.user(USER_A);

  const { body, rejected } = await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-empty",
    section_id: "c0",
  });

  expect(rejected).toBe(true);
  expect(JSON.stringify(body)).toMatch(/delete the report/i);
  expect(await sectionsOf(mdb, "e2e-rm-empty")).toEqual(before);
});

test("a repeated removal is rejected, not applied to whatever took the slot", async ({
  ldf,
  page,
  mdb,
}) => {
  // Under positional ids the second call would remove whatever had slid into the
  // slot. Durable ids make it a plain not-found.
  await seedFull(mdb, "e2e-rm-twice");
  await ldf.user(USER_A);

  await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-twice",
    section_id: "s4",
  });
  const afterFirst = await sectionsOf(mdb, "e2e-rm-twice");

  const { rejected } = await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-twice",
    section_id: "s4",
  });

  expect(rejected).toBe(true);
  expect(await sectionsOf(mdb, "e2e-rm-twice")).toEqual(afterFirst);
});

test("a non-owner cannot remove a section from a report they can read", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedFull(mdb, "e2e-rm-shared", { visibility: "shared" });
  const before = await sectionsOf(mdb, "e2e-rm-shared");

  await ldf.user(USER_B);
  const { rejected } = await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-shared",
    section_id: "s4",
  });

  // Owner-matched in the load, so a non-owner gets not-found rather than a
  // silent no-op.
  expect(rejected).toBe(true);
  expect(await sectionsOf(mdb, "e2e-rm-shared")).toEqual(before);
});

test("nobody can remove a section from a deleted report", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedFull(mdb, "e2e-rm-deleted", { deleted: changeStamp(USER_A) });
  const before = await sectionsOf(mdb, "e2e-rm-deleted");

  await ldf.user(USER_A);
  const { rejected } = await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-deleted",
    section_id: "s4",
  });

  expect(rejected).toBe(true);
  expect(await sectionsOf(mdb, "e2e-rm-deleted")).toEqual(before);
});

test("a spec write stamps updated, unlike favourite, visibility and restore", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedFull(mdb, "e2e-rm-stamp");
  const before = await mdb.collection(REPORTS).findOne({ _id: "e2e-rm-stamp" });
  await ldf.user(USER_A);

  await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-stamp",
    section_id: "s4",
  });

  const after = await mdb.collection(REPORTS).findOne({ _id: "e2e-rm-stamp" });
  expect(after.updated.timestamp.getTime()).toBeGreaterThan(
    before.updated.timestamp.getTime(),
  );
});

test("the report still resolves after a cascading removal", async ({
  ldf,
  page,
  mdb,
}) => {
  // The property the cascade exists for: the surviving spec must be valid input
  // to the validator, or the report fails to open. Asserted on the document
  // because the report page is blocked by the urlQuery harness gap documented in
  // formatted-report.spec.js — the write itself revalidates, so a spec that
  // would not resolve is rejected before it is stored.
  await seedFull(mdb, "e2e-rm-resolves");
  await ldf.user(USER_A);

  const { response } = await callEndpoint(page, "remove-report-section", {
    report_id: "e2e-rm-resolves",
    section_id: "s3",
  });
  expect(response).toMatchObject({ ok: true });

  // Every section that survived carries an id, and no filterBy names a filter
  // the report no longer has — the two invariants validateReportSpec enforces.
  const sections = await sectionsOf(mdb, "e2e-rm-resolves");
  const filterFields = sections
    .filter((s) => s.type === "filter")
    .map((s) => s.field);
  for (const section of sections) {
    expect(section.id).toBeTruthy();
    for (const field of section.filterBy ?? []) {
      expect(filterFields).toContain(field);
    }
  }
});
