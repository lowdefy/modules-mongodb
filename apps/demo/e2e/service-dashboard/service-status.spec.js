import { test, expect } from "../fixtures.js";
import { createPelicanStub } from "../support/pelican-stub.js";

// The service-dashboard module against a stub Pelican: who may read the report,
// what the endpoint sends Pelican and shows when Pelican fails, and the page
// with two apps (one set up mid-period and stale), at desktop and phone width.

const ADMIN = {
  id: "e2e-service-admin",
  sub: "e2e-service-admin-sub",
  name: "Service Admin",
  email: "service-admin@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Service Admin" },
};

const MEMBER = {
  ...ADMIN,
  id: "e2e-service-member",
  sub: "e2e-service-member-sub",
  email: "service-member@example.com",
  roles: ["user"],
};

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const daysBetween = (from, to) => {
  const days = [];
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += DAY
  ) {
    days.push(iso(t));
  }
  return days;
};

// A day the way Pelican's report carries it (lib/serviceTotals.js dayEntry),
// busier on weekdays.
function day(date, overrides = {}) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const busy = weekday > 0 && weekday < 6;
  const total = busy ? 14200 + (date.charCodeAt(9) % 7) * 310 : 4300;
  return {
    day: date,
    counted: true,
    state: "ok",
    availability: 1,
    windows: { up: 288, degraded: 0, down: 0, no_data: 0 },
    requests: {
      total,
      server_errors: busy ? 9 : 2,
      p50_ms: 280 + (date.charCodeAt(9) % 5) * 12,
      p95_ms: 1300 + (date.charCodeAt(9) % 4) * 60,
    },
    active_users: busy ? 92 + (date.charCodeAt(9) % 6) : 18,
    page_loads: busy ? 2100 : 400,
    tickets: {
      opened: busy ? 2 : 0,
      resolved: busy ? 2 : 1,
      open_at_end: 12,
      first_reply_ms: [],
      resolve_ms: [],
    },
    ...overrides,
  };
}

// Orders: every day of the period, one degraded and one down day, top users on.
// Help: set up 10 days into the period, its last two nights not rolled up.
function report({ from, to, top_users }) {
  const days = daysBetween(from, to);
  const degradedDay = days[Math.max(0, days.length - 12)];
  const downDay = days[Math.max(0, days.length - 4)];
  const yesterday = days[days.length - 1];
  const ordersDays = days.map((date) => {
    if (date === degradedDay) {
      return day(date, {
        windows: { up: 279, degraded: 9, down: 0, no_data: 0 },
        requests: {
          total: 13900,
          server_errors: 40,
          p50_ms: 900,
          p95_ms: 6900,
        },
      });
    }
    if (date === downDay) {
      return day(date, {
        availability: 0.979,
        windows: { up: 282, degraded: 0, down: 6, no_data: 0 },
        requests: {
          total: 12800,
          server_errors: 210,
          p50_ms: 340,
          p95_ms: 2100,
        },
      });
    }
    return day(date);
  });
  const since = days[Math.min(days.length - 1, 9)];
  const helpAsOf = days[Math.max(0, days.length - 3)];
  // Pelican lists every day of the range; one before since or with no row
  // carries only its day.
  const blank = (date) => ({
    day: date,
    counted: date >= since,
    state: null,
    availability: null,
    windows: null,
    requests: null,
    active_users: null,
    page_loads: null,
    tickets: null,
  });
  const helpDays = days.map((date) =>
    date >= since && date <= helpAsOf
      ? day(date, {
          requests: { total: 3100, server_errors: 1, p50_ms: 240, p95_ms: 880 },
          active_users: 40,
        })
      : blank(date),
  );
  const helpCounted = helpDays.filter((d) => d.requests);
  const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);
  const orders = {
    id: "app-orders",
    name: "Orders",
    url: "https://orders.example.com",
    target: 99.5,
    since: null,
    as_of: yesterday,
    stale: false,
    totals: {
      availability: 0.99931,
      windows: { up: 8622, degraded: 9, down: 6, no_data: 3 },
      requests: {
        total: sum(ordersDays, (d) => d.requests.total),
        server_errors: sum(ordersDays, (d) => d.requests.server_errors),
        error_rate:
          sum(ordersDays, (d) => d.requests.server_errors) /
          sum(ordersDays, (d) => d.requests.total),
        p95_weighted_ms: 1420,
      },
      incidents: 2,
      active_users: 214,
      page_loads: sum(ordersDays, (d) => d.page_loads),
    },
    days: ordersDays,
    incidents: [
      {
        day: degradedDay,
        start: `${degradedDay}T12:10:00.000Z`,
        end: `${degradedDay}T12:55:00.000Z`,
        kind: "degraded",
        seen: "Response time over 8 s (p95 11.2 s)",
      },
      {
        day: downDay,
        start: `${downDay}T07:35:00.000Z`,
        end: `${downDay}T08:05:00.000Z`,
        kind: "down",
        seen: "6 health checks failed; 41% of requests failed",
      },
    ],
    pages: [
      { page_id: "contacts/all", loads: 21904, user_days: 1880 },
      { page_id: "contacts/view", loads: 18232, user_days: 1760 },
      { page_id: "companies/all", loads: 6410, user_days: 910 },
      { page_id: "reporting-demo", loads: 2118, user_days: 440 },
      { page_id: "old-page", loads: 12, user_days: 3 },
    ],
    tickets: {
      opened: sum(ordersDays, (d) => d.tickets.opened),
      resolved: sum(ordersDays, (d) => d.tickets.resolved),
      open_at_end: 12,
      median_first_reply_ms: 22 * 60000,
      median_resolve_ms: 1.6 * DAY,
    },
    ...(top_users
      ? {
          top_users: [
            {
              user_id: "e2e-top-1",
              active_days: 19,
              page_loads: 2412,
              last_seen: `${yesterday}T15:00:00.000Z`,
            },
            {
              user_id: "e2e-top-2",
              active_days: 18,
              page_loads: 1980,
              last_seen: `${yesterday}T09:00:00.000Z`,
            },
            {
              user_id: "e2e-top-gone",
              active_days: 4,
              page_loads: 120,
              last_seen: `${days[3]}T09:00:00.000Z`,
            },
          ],
        }
      : {}),
  };
  const help = {
    id: "app-help",
    name: "Help",
    url: "https://help.example.com",
    target: 99.5,
    since,
    as_of: helpAsOf,
    stale: true,
    totals: {
      availability: 1,
      windows: {
        up: 288 * helpCounted.length,
        degraded: 0,
        down: 0,
        no_data: 0,
      },
      requests: {
        total: sum(helpCounted, (d) => d.requests.total),
        server_errors: helpCounted.length,
        error_rate:
          helpCounted.length / sum(helpCounted, (d) => d.requests.total),
        p95_weighted_ms: 880,
      },
      incidents: 0,
      active_users: 63,
      page_loads: sum(helpCounted, (d) => d.page_loads),
    },
    days: helpDays,
    incidents: [],
    pages: [{ page_id: "support/support", loads: 980, user_days: 410 }],
    tickets: {
      opened: 9,
      resolved: 8,
      open_at_end: 2,
      median_first_reply_ms: 35 * 60000,
      median_resolve_ms: 0.9 * DAY,
    },
    ...(top_users ? { top_users: [] } : {}),
  };
  return { apps: [orders, help] };
}

const pelican = createPelicanStub();

test.beforeAll(() => pelican.start());
test.afterAll(() => pelican.stop());
test.beforeEach(async ({ mdb }) => {
  pelican.reset();
  await mdb.seed("users", [
    { _id: "e2e-top-1", name: "Thandi Mokoena", email: "thandi@example.com" },
    { _id: "e2e-top-2", name: "Pieter Botha", email: "pieter@example.com" },
  ]);
});

async function call(page, payload) {
  const raw = await page.request.post(
    "/api/endpoints/service-dashboard/service-report",
    {
      data: { payload },
    },
  );
  return { status: raw.status(), body: await raw.json().catch(() => null) };
}

test("a user without a listed role gets 403 from the endpoint, and Pelican is never called", async ({
  ldf,
  page,
}) => {
  await ldf.user(MEMBER);
  pelican.answer(({ body }) => ({ status: 200, body: report(body) }));

  const result = await call(page, { period: "last_30_days" });

  expect(result.status).toBe(403);
  expect(pelican.calls).toHaveLength(0);
});

test("the endpoint asks Pelican for the period with the support key and names top users", async ({
  ldf,
  page,
}) => {
  await ldf.user(ADMIN);
  pelican.answer(({ body }) => ({ status: 200, body: report(body) }));

  const result = await call(page, { period: "last_month" });

  expect(result.status).toBe(200);
  const answer = result.body.response;
  expect(pelican.calls).toHaveLength(1);
  const [sent] = pelican.calls;
  expect(sent.endpoint).toBe("service-report");
  expect(sent.authorization).toBe("Bearer e2e-support-key");
  // Pelican's body schema allows no other keys.
  expect(Object.keys(sent.body).sort()).toEqual(["from", "to", "top_users"]);
  expect(sent.body.top_users).toBe(true);
  expect(sent.body.from.slice(8)).toBe("01");
  expect(answer.range).toMatchObject({
    period: "last_month",
    from: sent.body.from,
    to: sent.body.to,
  });
  expect(answer.tabs.map((tab) => tab.title)).toEqual([
    "Orders · orders.example.com",
    "Help · help.example.com",
  ]);
  expect(answer.apps[0].top_users.map((user) => user.name)).toEqual([
    "Thandi Mokoena",
    "Pieter Botha",
    "Unknown user",
  ]);
  expect(JSON.stringify(answer)).not.toContain("e2e-support-key");
});

for (const [name, reply] of [
  [
    "a 400 app_not_in_report",
    {
      status: 400,
      body: {
        error: {
          code: "app_not_in_report",
          message: "Not in this app's report: app-x.",
        },
      },
    },
  ],
  [
    "a 400 invalid_request range",
    {
      status: 400,
      body: {
        error: {
          code: "invalid_request",
          message: "to: must be at most 400 days after from.",
        },
      },
    },
  ],
  [
    "a 401",
    {
      status: 401,
      body: { error: { code: "unauthorized", message: "Bad key." } },
    },
  ],
  [
    "a 500",
    {
      status: 500,
      body: { error: { code: "internal", message: "Stack trace at line 3" } },
    },
  ],
  ["a body without apps", { status: 200, body: { reports: [] } }],
  ["no answer", { hangUp: true }],
]) {
  test(`Pelican answering ${name} shows the retry message, never the error or the key`, async ({
    ldf,
    page,
  }) => {
    await ldf.user(ADMIN);
    pelican.answer(() => reply);

    const result = await call(page, {});

    expect(result.status).toBe(200);
    expect(result.body.response).toEqual({
      ok: false,
      message:
        "Service status can't be loaded right now. Try again in a few minutes.",
    });
    expect(JSON.stringify(result.body)).not.toMatch(
      /Stack trace|Bad key|e2e-support-key|app-x|400 days/,
    );
  });
}

// Charts and grids size themselves when they mount, so each width is a fresh
// load of the page. `ready` waits for it; `then` puts it in the state shown.
async function shoot(page, name, ready, then = async () => {}) {
  for (const [width, height, suffix] of [
    [1440, 900, "desktop"],
    [390, 844, "phone"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(ready()).toBeVisible();
    await then();
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: test.info().outputPath(`${name}-${suffix}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("the page: cards, strip, charts and tables per app, the stale banner and a new period", async ({
  ldf,
  page,
}) => {
  await ldf.user(ADMIN);
  pelican.answer(({ body }) => ({ status: 200, body: report(body) }));

  await ldf.goto("/service-dashboard/service-status");
  await expect(page.locator("#card_availability")).toContainText("99.93%");
  await expect(page.locator("#card_incidents")).toContainText(
    "30 min down, 45 min degraded",
  );
  await expect(page.locator("#bl-strip_chart canvas")).toHaveCount(1);
  await expect(page.locator("#pages_table")).toContainText("Contacts");
  await expect(page.locator("#pages_table")).toContainText("old-page");
  await expect(page.locator("#incidents_table")).toContainText("Down");
  await expect(page.locator("#top_users_table")).toContainText(
    "Thandi Mokoena",
  );
  await expect(page.locator("#top_users_table")).toContainText("Unknown user");
  await shoot(page, "service-status-main", () =>
    page.locator("#bl-strip_chart canvas"),
  );

  await page.getByRole("tab", { name: /Help/ }).click();
  await expect(page.locator("#stale_alert")).toContainText(
    "The last two daily updates didn't finish",
  );
  await expect(page.locator("#strip_note")).toContainText(
    "before monitoring started",
  );
  await shoot(
    page,
    "service-status-help-stale",
    () => page.locator("#bl-strip_chart canvas"),
    () => page.getByRole("tab", { name: /Help/ }).click(),
  );

  const callsBefore = pelican.calls.length;
  await page.getByText("This month", { exact: true }).click();
  await expect.poll(() => pelican.calls.length).toBe(callsBefore + 1);
  expect(pelican.calls[callsBefore].body.from.slice(8)).toBe("01");
  await expect(page.getByRole("tab", { name: /Help/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("the page: Pelican unreachable shows the retry message and Try again reloads", async ({
  ldf,
  page,
}) => {
  await ldf.user(ADMIN);
  pelican.answer(() => ({ status: 503, body: {} }));

  await ldf.goto("/service-dashboard/service-status");
  await expect(page.locator("#unavailable_alert")).toContainText(
    "Service status can't be loaded right now",
  );
  await shoot(page, "service-status-unreachable", () =>
    page.locator("#unavailable_alert"),
  );

  pelican.answer(({ body }) => ({ status: 200, body: report(body) }));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("#card_availability")).toContainText("99.93%");
});

test("the page: an app with no data yet", async ({ ldf, page }) => {
  await ldf.user(ADMIN);
  pelican.answer(({ body }) => {
    const answer = report(body);
    answer.apps = [
      {
        ...answer.apps[1],
        name: "Help",
        as_of: null,
        stale: false,
        days: answer.apps[1].days.map((d) => ({
          day: d.day,
          counted: true,
          state: null,
          availability: null,
          windows: null,
          requests: null,
          active_users: null,
          page_loads: null,
          tickets: null,
        })),
        totals: {
          availability: null,
          windows: null,
          requests: null,
          incidents: 0,
          active_users: null,
          page_loads: null,
        },
        tickets: null,
        pages: [],
        since: null,
      },
    ];
    return { status: 200, body: answer };
  });

  await ldf.goto("/service-dashboard/service-status");
  await expect(page.locator("#empty_card")).toContainText(
    "No service data yet for Help. The first day appears after 03:30 tomorrow.",
  );
  await shoot(page, "service-status-no-data", () =>
    page.locator("#empty_card"),
  );
});

test("the page: a user without the role has no menu link and is refused the page", async ({
  ldf,
  page,
}) => {
  await ldf.user(MEMBER);
  pelican.answer(({ body }) => ({ status: 200, body: report(body) }));

  await ldf.goto("/contacts/all");
  await expect(
    page.getByRole("menuitem", { name: "Service status" }),
  ).toHaveCount(0);
  // Lowdefy answers a page the user's roles don't reach as one that doesn't
  // exist, so a refusal reveals nothing.
  const response = await page.goto("/service-dashboard/service-status");
  expect(response.status()).toBe(404);
  expect(pelican.calls).toHaveLength(0);
});
