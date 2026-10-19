import decorateMessages, { dayLabel } from "./decorateMessages.js";

const now = new Date(2026, 9, 7, 15, 0);
const at = (day, hour, minute) => new Date(2026, 9, day, hour, minute);

const msg = (id, seq, author_type = "reporter", name = "Ada") => ({
  _id: id,
  author_type,
  author: { name },
  body: id,
  seq,
});

test("drops messages without an _id and duplicates, keeping the first", () => {
  const out = decorateMessages(
    [
      msg("a", at(7, 9, 0)),
      { ...msg("a", at(7, 9, 1)), body: "second copy" },
      { body: "no id", seq: at(7, 9, 2) },
      null,
    ],
    now,
  );
  expect(out.map((m) => m._id)).toEqual(["a"]);
  expect(out[0].body).toBe("a");
});

test("sorts by seq", () => {
  const out = decorateMessages(
    [msg("c", at(7, 11, 0)), msg("a", at(7, 9, 0)), msg("b", at(7, 10, 0))],
    now,
  );
  expect(out.map((m) => m._id)).toEqual(["a", "b", "c"]);
});

test("accepts ISO strings for seq", () => {
  const out = decorateMessages(
    [msg("b", at(7, 10, 0).toISOString()), msg("a", at(7, 9, 0).toISOString())],
    now,
  );
  expect(out.map((m) => m._id)).toEqual(["a", "b"]);
  expect(out[0].time).toBe("09:00");
});

test("a day pill opens each new day", () => {
  const out = decorateMessages(
    [
      msg("a", at(6, 9, 0)),
      msg("b", at(6, 9, 30)),
      msg("c", at(7, 9, 0)),
      msg("d", at(7, 9, 2)),
    ],
    now,
  );
  expect(out.map((m) => m.dayBreak)).toEqual([
    "Yesterday",
    null,
    "Today",
    null,
  ]);
});

test("groups the same author within five minutes", () => {
  const out = decorateMessages(
    [
      msg("a", at(7, 9, 0)),
      msg("b", at(7, 9, 4)),
      msg("c", at(7, 9, 10)),
      msg("d", at(7, 9, 11), "team", "Grace"),
      msg("e", at(7, 9, 12), "team", "Alan"),
    ],
    now,
  );
  expect(out.map((m) => m.grouped)).toEqual([false, true, false, false, false]);
});

test("a day break is never grouped", () => {
  const out = decorateMessages(
    [msg("a", at(6, 23, 58)), msg("b", at(7, 0, 1))],
    now,
  );
  expect(out[1].dayBreak).toBe("Today");
  expect(out[1].grouped).toBe(false);
});

test("dayLabel names today and yesterday, and adds the year for another year", () => {
  expect(dayLabel(at(7, 1, 0), now)).toBe("Today");
  expect(dayLabel(at(6, 1, 0), now)).toBe("Yesterday");
  expect(dayLabel(new Date(2025, 0, 3), now)).toMatch(/2025/);
  expect(dayLabel(at(1, 1, 0), now)).not.toMatch(/2026/);
});

test("an empty or missing list gives no messages", () => {
  expect(decorateMessages(undefined, now)).toEqual([]);
  expect(decorateMessages([], now)).toEqual([]);
});
