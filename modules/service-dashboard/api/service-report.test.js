/**
 * Runs the `_js` of the service report: the days a period covers
 * (parts/report-range.yaml) and the shaping of Pelican's answer for the page
 * (parts/shape-report.yaml), against stubbed answers, and the build check on
 * top_users (build/require_users.js).
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

import requireUsers from "../build/require_users.js";

const here = dirname(fileURLToPath(import.meta.url));
const readYaml = (path) => loadYaml(readFileSync(join(here, path), "utf8"));
const runFn = (fn, args) => new Function("args", fn)(args);

const rangeFn = readYaml("parts/report-range.yaml")[0][":set_state"].range._js
  .fn;
const range = (period, now) => runFn(rangeFn, { period, now });

const shapeFn = readYaml("parts/shape-report.yaml")[0][":return"]._js.fn;
const shape = (apps, rangeArg, names = null) =>
  runFn(shapeFn, { apps, range: rangeArg, names });

describe("the days a period covers", () => {
  // 10:00 SAST on 28 Oct 2026.
  const now = "2026-10-28T08:00:00.000Z";

  test("last 30 days ends yesterday", () => {
    expect(range("last_30_days", now)).toEqual({
      period: "last_30_days",
      from: "2026-09-28",
      to: "2026-10-27",
      today: "2026-10-28",
    });
  });

  test("last 90 days ends yesterday", () => {
    expect(range("last_90_days", now)).toMatchObject({
      from: "2026-07-30",
      to: "2026-10-27",
    });
  });

  test("this month runs from the 1st to yesterday", () => {
    expect(range("this_month", now)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-27",
    });
  });

  test("this month on the 1st is that day alone", () => {
    expect(range("this_month", "2026-11-01T06:00:00.000Z")).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-01",
    });
  });

  test("last month in early January spans December of the year before", () => {
    expect(range("last_month", "2027-01-03T08:00:00.000Z")).toMatchObject({
      period: "last_month",
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  test("last month in March ends on the last day of February", () => {
    expect(range("last_month", "2028-03-02T08:00:00.000Z")).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  test("days turn at midnight South African time, not UTC", () => {
    // 23:30 UTC on 31 Oct is 01:30 SAST on 1 Nov.
    expect(range("last_month", "2026-10-31T23:30:00.000Z")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
      today: "2026-11-01",
    });
  });
});

const RANGE = {
  period: "last_30_days",
  from: "2026-09-28",
  to: "2026-10-27",
  today: "2026-10-28",
};

function day(date, extra = {}) {
  return {
    day: date,
    availability: 1,
    windows: { up: 288, degraded: 0, down: 0, no_data: 0 },
    requests: { total: 10000, server_errors: 5, p50_ms: 300, p95_ms: 1400 },
    active_users: 90,
    tickets: { opened: 1, resolved: 2 },
    ...extra,
  };
}

function daysBetween(from, to) {
  const days = [];
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += 86400000
  ) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

const APP = {
  id: "app-1",
  name: "Orders",
  url: "https://orders.example.com",
  target: 99.5,
  since: null,
  as_of: "2026-10-27",
  stale: false,
  totals: {
    availability: 0.99934,
    requests: {
      total: 412380,
      server_errors: 330,
      p50_ms: 310,
      p95_ms: 1420,
    },
    active_users: 214,
  },
  days: daysBetween("2026-09-28", "2026-10-27").map((date) => {
    if (date === "2026-10-17") {
      return day(date, {
        availability: 1,
        windows: { up: 279, degraded: 9, down: 0, no_data: 0 },
      });
    }
    if (date === "2026-10-25") {
      return day(date, {
        availability: 0.979,
        windows: { up: 282, degraded: 0, down: 6, no_data: 0 },
      });
    }
    return day(date);
  }),
  incidents: [
    {
      start: "2026-10-17T12:10:00.000Z",
      end: "2026-10-17T12:55:00.000Z",
      kind: "degraded",
      seen: "Response time over 8 s (p95 11.2 s)",
    },
    {
      start: "2026-10-25T07:35:00.000Z",
      end: "2026-10-25T08:05:00.000Z",
      kind: "down",
      seen: "6 health checks failed; 41% of requests failed",
    },
  ],
  pages: [{ page_id: "tickets", users: 188, loads: 21904 }],
  tickets: {
    opened: 38,
    resolved: 41,
    open_at_end: 12,
    first_reply_median_ms: 22 * 60000,
    resolve_median_ms: 1.6 * 86400000,
  },
};

describe("shaping the report", () => {
  test("one tab per app, named with its host", () => {
    const report = shape(
      [
        APP,
        { ...APP, id: "app-2", name: "Help", url: "https://help.example.com/" },
      ],
      RANGE,
    );
    expect(report.ok).toBe(true);
    expect(report.tabs).toEqual([
      { key: "0", title: "Orders · orders.example.com" },
      { key: "1", title: "Help · help.example.com" },
    ]);
  });

  test("the cards read as the mockup does", () => {
    const [app] = shape([APP], RANGE).apps;
    expect(app.cards).toEqual({
      availability: {
        value: "99.93%",
        tone: "success",
        sub: "Target 99.5% · met",
      },
      incidents: { value: "2", sub: "30 min down, 45 min degraded" },
      response: {
        value: "1.4 s",
        sub: "Error rate 0.08% of 412,380 requests",
      },
      users: { value: "214", sub: "90 on an average weekday" },
    });
  });

  test("availability under target is missed, and never rounds up to 100%", () => {
    const [missed] = shape(
      [{ ...APP, totals: { ...APP.totals, availability: 0.99 } }],
      RANGE,
    ).apps;
    expect(missed.cards.availability).toMatchObject({
      value: "99%",
      tone: "error",
      sub: "Target 99.5% · missed",
    });
    const [almost] = shape(
      [{ ...APP, totals: { ...APP.totals, availability: 0.99999 } }],
      RANGE,
    ).apps;
    expect(almost.cards.availability.value).toBe("99.99%");
  });

  test("a calendar period names its days on the availability card", () => {
    const [app] = shape([APP], {
      period: "this_month",
      from: "2026-10-01",
      to: "2026-10-27",
      today: "2026-10-28",
    }).apps;
    expect(app.cards.availability.sub).toBe("Target 99.5% · met · 1–27 Oct");
    expect(app.cards.incidents.value).toBe("2");
  });

  test("the strip marks the down and degraded days, and days before since as no data", () => {
    const [app] = shape([{ ...APP, since: "2026-10-06" }], RANGE).apps;
    const series = Object.fromEntries(
      app.strip.series.map((s) => [s.name, s.data]),
    );
    const index = (date) =>
      daysBetween("2026-09-28", "2026-10-27").indexOf(date);
    expect(series.Down[index("2026-10-25")]).toBe(1);
    expect(series.Degraded[index("2026-10-17")]).toBe(1);
    expect(series["No data"][index("2026-10-05")]).toBe(1);
    expect(series.Up[index("2026-10-06")]).toBe(1);
    expect(app.strip.xAxis.data[0]).toBe("28 Sep");
    expect(app.strip_note).toBe(
      "Grey days are before monitoring started (6 Oct) and don't count towards availability.",
    );
  });

  test("incidents list newest first in South African time", () => {
    const [app] = shape([APP], RANGE).apps;
    expect(app.incidents).toEqual([
      {
        when: "25 Oct, 09:35",
        duration: "30 min",
        kind: "Down",
        seen: "6 health checks failed; 41% of requests failed",
      },
      {
        when: "17 Oct, 14:10",
        duration: "45 min",
        kind: "Degraded",
        seen: "Response time over 8 s (p95 11.2 s)",
      },
    ]);
  });

  test("an incident still open counts to the end of the period", () => {
    const [app] = shape(
      [
        {
          ...APP,
          incidents: [
            {
              start: "2026-10-27T21:00:00.000Z",
              end: null,
              kind: "down",
              seen: "Health checks failing",
            },
          ],
        },
      ],
      RANGE,
    ).apps;
    expect(app.incidents[0].duration).toBe("1 h, ongoing");
    expect(app.cards.incidents.sub).toBe("1 h down");
  });

  test("availability exactly at target is met", () => {
    const [app] = shape(
      [{ ...APP, target: 57, totals: { ...APP.totals, availability: 0.57 } }],
      RANGE,
    ).apps;
    expect(app.cards.availability.tone).toBe("success");
  });

  test("ticket medians read in minutes and days", () => {
    const [app] = shape([APP], RANGE).apps;
    expect(app.tickets_summary).toEqual([
      { label: "opened", value: "38" },
      { label: "resolved", value: "41" },
      { label: "open now", value: "12" },
      { label: "first reply, median", value: "22 min" },
      { label: "to resolve, median", value: "1.6 days" },
    ]);
    expect(app.tickets_chart.xAxis.data).toEqual([
      "28 Sep",
      "5 Oct",
      "12 Oct",
      "19 Oct",
      "26 Oct",
    ]);
  });

  test("a stale report names the last day with data and the days missing", () => {
    const [app] = shape(
      [{ ...APP, stale: true, as_of: "2026-10-25" }],
      RANGE,
    ).apps;
    expect(app.stale).toBe(
      "Data is up to 25 Oct 2026. The last two daily updates didn't finish; the support team has been told. Figures for 26 and 27 Oct will appear once it runs.",
    );
  });

  test("an app with no data yet says when the first day appears", () => {
    const [app] = shape(
      [{ ...APP, as_of: null, days: [], totals: {}, incidents: [] }],
      RANGE,
    ).apps;
    expect(app.empty).toBe(
      "No service data yet for Orders. The first day appears after 03:30 tomorrow.",
    );
  });

  test("top users are named from the app's users, unknown ids as Unknown user", () => {
    const [app] = shape(
      [
        {
          ...APP,
          top_users: [
            {
              user_id: "u1",
              active_days: 19,
              page_loads: 2412,
              last_seen: "2026-10-28T07:00:00.000Z",
            },
            {
              user_id: "u2",
              active_days: 3,
              page_loads: 12,
              last_seen: "2026-10-27T07:00:00.000Z",
            },
          ],
        },
      ],
      RANGE,
      { u1: { name: "Thandi Mokoena", company: "Acme Logistics" } },
    ).apps;
    expect(app.top_users).toEqual([
      {
        user_id: "u1",
        name: "Thandi Mokoena",
        company: "Acme Logistics",
        active_days: 19,
        page_loads: 2412,
        last_seen: "Today",
      },
      {
        user_id: "u2",
        name: "Unknown user",
        company: null,
        active_days: 3,
        page_loads: 12,
        last_seen: "Yesterday",
      },
    ]);
  });

  test("top users stay out when the module has them off", () => {
    const [app] = shape(
      [{ ...APP, top_users: [{ user_id: "u1", active_days: 1 }] }],
      RANGE,
      null,
    ).apps;
    expect(app.top_users).toBeNull();
  });
});

describe("the top users build check", () => {
  test("top_users without users fails with what to set", () => {
    expect(() => requireUsers({}, { top_users: true, users: null })).toThrow(
      /top_users on but users.collection or users.name_field is not set/,
    );
  });

  test("top_users with users, or off, passes the config through", () => {
    const input = { id: "service-report" };
    expect(
      requireUsers(input, {
        top_users: true,
        users: { collection: "users", name_field: "name" },
      }),
    ).toBe(input);
    expect(requireUsers(input, { top_users: false, users: null })).toBe(input);
  });
});
