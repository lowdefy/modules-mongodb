import { test, expect } from "../fixtures.js";
import {
  REPORTS,
  USER_A,
  USER_B,
  callEndpoint,
  changeStamp,
  reportDoc,
} from "./helpers.js";

// `list-reports` is where the reporting module's authorization lives: the scope
// match IS the boundary, so a bug in it is a confidentiality bug rather than a
// display bug. Every spec below therefore asserts an EXACT id set — what the
// scope returns and, by omission, everything it withholds. A subset assertion
// would pass while the endpoint leaked.
//
// The caller is USER_A throughout. USER_B is the other person in the app: they
// own reports, publish some of them, and delete one that had been published.

// Titles are ordered A…I so the sort specs can assert a title order without a
// second fixture set, and each id says what the document is for.
const FIXTURES = [
  reportDoc({ id: "own-private", title: "A own private", owner: USER_A }),
  // In Mine AND in Shared — publishing does not remove a report from Mine.
  reportDoc({
    id: "own-shared",
    title: "B own shared",
    owner: USER_A,
    visibility: "shared",
  }),
  reportDoc({
    id: "own-deleted",
    title: "C own deleted",
    owner: USER_A,
    deleted: changeStamp(USER_A),
  }),
  // The negative `all` needs most: nobody else's private report is readable.
  reportDoc({ id: "other-private", title: "D other private", owner: USER_B }),
  reportDoc({
    id: "other-shared",
    title: "E other shared",
    owner: USER_B,
    visibility: "shared",
  }),
  // Favourites working on a report the caller does not own.
  reportDoc({
    id: "other-shared-fav",
    title: "F other shared favourited",
    owner: USER_B,
    visibility: "shared",
    favouriteOf: [USER_A.id],
  }),
  // Favourited while it was shared, since unpublished. A bare favourite_of
  // match would keep serving it — this is the one document that proves the
  // readable predicate is doing work inside the Favourites scope.
  reportDoc({
    id: "other-private-fav",
    title: "G other favourited, sharing withdrawn",
    owner: USER_B,
    favouriteOf: [USER_A.id],
  }),
  // Published to the caller, then deleted by its owner. The caller must not see
  // it in Shared (deleted) or in Deleted (not theirs).
  reportDoc({
    id: "other-shared-deleted",
    title: "H other shared deleted",
    owner: USER_B,
    visibility: "shared",
    deleted: changeStamp(USER_B),
  }),
  reportDoc({
    id: "own-deleted-fav",
    title: "I own deleted favourited",
    owner: USER_A,
    favouriteOf: [USER_A.id],
    deleted: changeStamp(USER_A),
  }),
];

async function list(page, payload) {
  const { status, body } = await callEndpoint(page, "list-reports", payload);
  expect(status).toBe(200);
  // A routine that rejected still answers 200 — success is in the body, so an
  // assertion that only checked the status would pass on a rejection.
  expect(body.success).toBe(true);
  return body.response;
}

function ids(response) {
  return response.reports.map((report) => report._id).sort();
}

test.describe("list-reports scopes", () => {
  test.beforeEach(async ({ ldf, mdb }) => {
    await mdb.seed(REPORTS, FIXTURES);
    await ldf.user(USER_A);
  });

  test("mine returns the caller's reports at any visibility, and nothing deleted", async ({
    page,
  }) => {
    const response = await list(page, { scope: "mine" });

    expect(ids(response)).toEqual(["own-private", "own-shared"]);
    expect(response.total).toBe(2);
  });

  test("shared returns every live shared report including the caller's own", async ({
    page,
  }) => {
    const response = await list(page, { scope: "shared" });

    // other-shared-deleted is shared but deleted; own-private and other-private
    // are live but not shared.
    expect(ids(response)).toEqual([
      "other-shared",
      "other-shared-fav",
      "own-shared",
    ]);
  });

  test("favourites excludes a favourited report whose sharing was withdrawn", async ({
    page,
  }) => {
    const response = await list(page, { scope: "favourites" });

    // All three fixtures carry the caller's id in favourite_of. Only the one
    // that is still readable — shared, not deleted — comes back.
    expect(ids(response)).toEqual(["other-shared-fav"]);
  });

  test("all is the readable predicate and never another user's private report", async ({
    page,
  }) => {
    const response = await list(page, { scope: "all" });

    expect(ids(response)).toEqual([
      "other-shared",
      "other-shared-fav",
      "own-private",
      "own-shared",
    ]);
  });

  test("deleted is owner-only, including for a report that had been published to the caller", async ({
    page,
  }) => {
    const response = await list(page, { scope: "deleted" });

    expect(ids(response)).toEqual(["own-deleted", "own-deleted-fav"]);
  });

  test("another user's deleted report is theirs alone to recover", async ({
    ldf,
    page,
  }) => {
    // The mirror of the spec above: the same fixture set read as USER_B returns
    // only USER_B's deleted report, so "owner-only" is not an artefact of
    // USER_A happening to own most of the set.
    await ldf.user(USER_B);
    const response = await list(page, { scope: "deleted" });

    expect(ids(response)).toEqual(["other-shared-deleted"]);
  });

  test("the total is the unpaged match count while the rows honour skip and page_size", async ({
    page,
  }) => {
    const firstPage = await list(page, {
      scope: "all",
      skip: 0,
      page_size: 2,
    });
    expect(firstPage.reports).toHaveLength(2);
    expect(firstPage.total).toBe(4);

    const secondPage = await list(page, {
      scope: "all",
      skip: 2,
      page_size: 2,
    });
    expect(secondPage.reports).toHaveLength(2);
    // The count branch is outside the paged branch, so it does not shrink as
    // the offset advances — this is the "of 8" in "Showing 6 of 8".
    expect(secondPage.total).toBe(4);

    // No row appears on both pages: the sort carries an _id tiebreaker, without
    // which an offset over a non-unique key can repeat a row and skip another.
    expect(ids(firstPage).concat(ids(secondPage)).sort()).toEqual([
      "other-shared",
      "other-shared-fav",
      "own-private",
      "own-shared",
    ]);

    const pastTheEnd = await list(page, {
      scope: "all",
      skip: 4,
      page_size: 2,
    });
    expect(pastTheEnd.reports).toEqual([]);
    expect(pastTheEnd.total).toBe(4);
  });

  test("a caller-supplied sort replaces the favourite-first default", async ({
    page,
  }) => {
    const byDefault = await list(page, { scope: "all" });
    // other-shared-fav is the only favourited report in the scope, so the
    // default sort leads with it whatever the titles say.
    expect(byDefault.reports[0]._id).toBe("other-shared-fav");

    const byTitle = await list(page, {
      scope: "all",
      sort: { by: "title", order: 1 },
    });
    // The favourite does not float: it takes its alphabetical place, which is
    // last here. A sort that nested under is_favourite would leave it first and
    // make the sort control look broken.
    expect(byTitle.reports.map((report) => report._id)).toEqual([
      "own-private",
      "own-shared",
      "other-shared",
      "other-shared-fav",
    ]);
  });

  test("rows carry the computed fields and never favourite_of", async ({
    page,
  }) => {
    const response = await list(page, { scope: "all" });

    for (const report of response.reports) {
      // Who else favourited a report is not the caller's business — the
      // per-viewer boolean is, and it replaces the array rather than joining it.
      expect(report.favourite_of).toBeUndefined();
      expect(typeof report.is_favourite).toBe("boolean");
      // owner.name is the publisher line; owner.user_id is not projected,
      // because is_owner is all the page needs from it.
      expect(report.owner).toEqual({ name: expect.any(String) });
    }

    const own = response.reports.find((report) => report._id === "own-private");
    expect(own.is_owner).toBe(true);
    expect(own.is_favourite).toBe(false);

    const favourited = response.reports.find(
      (report) => report._id === "other-shared-fav",
    );
    expect(favourited.is_owner).toBe(false);
    expect(favourited.is_favourite).toBe(true);
    expect(favourited.visibility).toBe("shared");

    // The contents pills, reduced from spec.sections. SPEC holds exactly one
    // section of each of the six types, and filters are counted apart from the
    // rest because the list draws them as their own pill.
    expect(own.section_counts).toEqual({
      kpi: 1,
      chart: 1,
      table: 1,
      markdown: 1,
      download: 1,
    });
    expect(own.filter_count).toBe(1);
  });

  test("an unauthenticated caller gets no reports", async ({ ldf, page }) => {
    await ldf.user();

    const { body } = await callEndpoint(page, "list-reports", {
      scope: "mine",
    });

    // Every scope's readable half is "an authenticated user", so an anonymous
    // caller has no scope to be in — and it never reaches the routine's own
    // signed-in guard to say so. Without a session the endpoint is not in the
    // caller's config at all, so the server answers `API Endpoint
    // "reporting/list-reports" does not exist` before any routine runs.
    //
    // Asserted as "did not succeed and returned no rows" rather than as a
    // specific error shape: which of the two mechanisms refuses an anonymous
    // caller is the framework's business, and pinning the message here would
    // make this spec fail on an unrelated auth-config change. What must hold is
    // that no reports come back.
    expect(body?.success).not.toBe(true);
    expect(body?.response?.reports ?? []).toEqual([]);
  });

  test("an unrecognised or absent scope is rejected, not defaulted", async ({
    page,
  }) => {
    for (const payload of [{}, { scope: "everything" }, { scope: null }]) {
      const { status, body } = await callEndpoint(
        page,
        "list-reports",
        payload,
      );

      expect(status).toBe(200);
      expect(body.success).toBe(false);
      // `reject` rather than `error`: the caller sent something the endpoint
      // refuses, which is not the same as the endpoint failing. A defaulted
      // scope would show up here as a success carrying rows.
      expect(body.status).toBe("reject");
      expect(body.response).toBeUndefined();
    }
  });
});

test.describe("list-reports search", () => {
  // `search-parens` and `search-bare` differ only by the parentheses, which is
  // what makes the escaping observable rather than merely present: an unescaped
  // "(EU)" is a capture group matching bare "EU", so it would return both.
  const SEARCHABLE = [
    reportDoc({
      id: "search-parens",
      title: "Revenue (EU) breakdown",
      description: "Nothing to see here.",
      owner: USER_A,
    }),
    reportDoc({
      id: "search-bare",
      title: "Revenue EU breakdown",
      description: "Nothing to see here.",
      owner: USER_A,
    }),
    reportDoc({
      id: "search-description",
      title: "Quarterly",
      description: "Margins by region",
      owner: USER_A,
    }),
    reportDoc({
      id: "search-neither",
      title: "Headcount",
      description: "People",
      owner: USER_A,
    }),
  ];

  test.beforeEach(async ({ ldf, mdb }) => {
    await mdb.seed(REPORTS, SEARCHABLE);
    await ldf.user(USER_A);
  });

  test("search matches title and description, case-insensitively", async ({
    page,
  }) => {
    const byTitle = await list(page, { scope: "mine", search: "revenue" });
    expect(ids(byTitle)).toEqual(["search-bare", "search-parens"]);

    const byDescription = await list(page, {
      scope: "mine",
      search: "MARGINS",
    });
    expect(ids(byDescription)).toEqual(["search-description"]);

    const noMatch = await list(page, { scope: "mine", search: "zzz" });
    expect(noMatch.reports).toEqual([]);
    expect(noMatch.total).toBe(0);
  });

  test("a search term containing regex metacharacters matches literally", async ({
    page,
  }) => {
    const grouped = await list(page, { scope: "mine", search: "(EU)" });
    expect(ids(grouped)).toEqual(["search-parens"]);

    // A lone "(" is an unterminated group: unescaped it makes Mongo throw on an
    // invalid pattern, which surfaces as a failed request rather than no rows.
    const unbalanced = await list(page, { scope: "mine", search: "(" });
    expect(ids(unbalanced)).toEqual(["search-parens"]);
  });

  test("an absent search term is not a filter", async ({ page }) => {
    const response = await list(page, { scope: "mine" });

    expect(response.total).toBe(4);
  });
});
