// Shared fixtures and helpers for the reporting ownership specs.
//
// Ownership ships no page, so these specs assert authorization by driving the
// API routines directly rather than by clicking. That is deliberate: a hidden
// menu item is a UX affordance, and the match inside the endpoint is the
// authorization — so the test has to reach the endpoint.

// Two users: A owns things and holds the publishing role, B is everyone else.
// `sub` is set to a deliberately different value on both and is never seeded
// against, so these specs double as a guard on the identity key — if a read or
// write goes back to preferring `sub`, the seeded owners stop matching.
//
// `profile.name` is NOT decoration. Every change stamp and owner reference in
// this repo reads `_user: profile.name`, not the top-level `name` — so a fixture
// user without a `profile` writes `name: null` into every stamp it produces, and
// a spec asserting on a stored name fails for a reason that has nothing to do
// with the endpoint under test. `ldf.user()` serializes this object verbatim into
// the session cookie, so what is here is exactly what `_user` resolves against.
export const USER_A = {
  id: "e2e-owner-id",
  sub: "e2e-owner-sub",
  name: "Report Owner",
  email: "owner@example.com",
  roles: ["admin", "report-publisher"],
  profile: { name: "Report Owner" },
};

export const USER_B = {
  id: "e2e-other-id",
  sub: "e2e-other-sub",
  name: "Other User",
  email: "other@example.com",
  roles: ["admin"],
  profile: { name: "Other User" },
};

export const ORDERS = [
  { _id: "o1", region: "EU", status: "paid", total: 1234.5, quantity: 2 },
  { _id: "o2", region: "EU", status: "pending", total: 250.25, quantity: 1 },
  { _id: "o3", region: "US", status: "paid", total: 4000, quantity: 5 },
];

const ordersByStatus = {
  collection: "demo_orders",
  pipeline: [
    { $group: { _id: "$status", revenue: { $sum: "$total" } } },
    { $project: { _id: 0, status: "$_id", revenue: 1 } },
  ],
};

// One section of each type, with a filter bound by two sections — so a spec
// write has something real to cascade over. `s3` is the filter; dropping it must
// strip `status` from both `filterBy` lists, and dropping BOTH bound sections
// must take the filter with them.
//
// Section ids are written out rather than left to derive, because these fixtures
// stand in for stored documents: the store holds validateReportSpec's output,
// and that output always carries ids.
export const SPEC = {
  sections: [
    {
      id: "s0",
      type: "kpi",
      label: "Total revenue",
      query: {
        collection: "demo_orders",
        pipeline: [{ $group: { _id: null, total: { $sum: "$total" } } }],
      },
      valueKey: "total",
      format: { style: "currency", currency: "USD", locale: "en-US" },
      filterBy: [],
    },
    {
      id: "s1",
      type: "table",
      label: "Revenue by status",
      query: ordersByStatus,
      columns: [
        { key: "status", label: "Status" },
        { key: "revenue", label: "Revenue" },
      ],
      filterBy: ["status"],
    },
    {
      id: "s2",
      type: "chart",
      chart: "bar",
      label: "Revenue by status",
      query: ordersByStatus,
      x: "status",
      y: ["revenue"],
      filterBy: ["status"],
    },
    {
      id: "s3",
      type: "filter",
      control: "select",
      field: "status",
      label: "Status",
      options: ["paid", "pending"],
    },
    { id: "s4", type: "markdown", content: "## Notes" },
    {
      id: "s5",
      type: "download",
      label: "Download CSV",
      query: ordersByStatus,
    },
  ],
};

// A report document in the current shape. Every field the model defines is set,
// so a fixture is never distinguishable from something generate-report wrote —
// a seed missing `favourite_of` or `visibility` would pass tests that a real
// document would fail.
export function reportDoc({
  id,
  title,
  description = "Seeded by an ownership e2e spec.",
  owner = USER_A,
  visibility = "private",
  favouriteOf = [],
  deleted = null,
  spec = SPEC,
  specVersion = 1,
  conversationId = null,
}) {
  const stamp = {
    timestamp: new Date(),
    user: { name: owner.name, id: owner.id },
  };
  return {
    _id: id,
    owner: { user_id: owner.id, name: owner.name },
    title,
    description,
    spec,
    spec_version: specVersion,
    visibility,
    favourite_of: favouriteOf,
    conversation_id: conversationId,
    deleted,
    created: stamp,
    updated: stamp,
  };
}

export function changeStamp(user) {
  return { timestamp: new Date(), user: { name: user.name, id: user.id } };
}

// Reaches a `type: Api` routine the way the client does: POST to
// /api/endpoints/{entryId}/{endpointId} with a { payload } body. The generated
// server mounts `app.all('/api/endpoints/*')` and joins the path segments into
// the endpoint id, which is why the module entry id is part of the path.
//
// The session cookie `ldf.user()` sets lives on the browser context and
// `page.request` shares that cookie jar, so the call runs as whoever the test
// last became — which is what makes the non-owner half of every matrix testable.
// Note the two layers in the return value. A routine's `:return:` value arrives
// nested under `body.response`, alongside `success` and `status` — and a
// `:reject:` is HTTP **200** with `success: false, status: "reject"`, not a 4xx.
// So assert on `response` for the happy path and `rejected` for a refusal;
// asserting a status code would pass or fail for the wrong reason.
export async function callAppEndpoint(page, endpointId, payload) {
  const raw = await page.request.post(`/api/endpoints/${endpointId}`, {
    data: { payload },
  });
  const body = await raw.json().catch(() => null);
  return {
    status: raw.status(),
    body,
    response: body?.response ?? null,
    rejected: body?.success === false && body?.status === "reject",
    errored: body?.success === false && body?.status === "error",
  };
}

// A module endpoint is an app endpoint under the module entry's path segment, so
// the two share one implementation rather than one knowing the response shape and
// the other re-deriving it.
export async function callEndpoint(page, endpointId, payload) {
  return callAppEndpoint(page, `ai-reporting/${endpointId}`, payload);
}

// Reports collection name — the module's `reports_collection` var defaults to
// `report_layouts`, a name left over from an earlier concept and deliberately
// not renamed (renaming the default would point existing apps at an empty
// collection).
export const REPORTS = "report_layouts";
