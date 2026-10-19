const GROUP_WINDOW_MS = 5 * 60 * 1000;

export const dayLabel = (d, now) => {
  const key = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(now)) return "Today";
  if (key(d) === key(new Date(now.getTime() - 86400000))) return "Yesterday";
  const opts = { day: "numeric", month: "long" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
};

const two = (n) => String(n).padStart(2, "0");

// Sort, dedupe by _id, and decorate with day breaks / grouping / times.
const decorateMessages = (messages, now) => {
  const seen = new Set();
  const list = (messages || [])
    .filter((m) => {
      if (!m || !m._id || seen.has(m._id)) return false;
      seen.add(m._id);
      return true;
    })
    .slice()
    .sort((a, b) => new Date(a.seq) - new Date(b.seq));
  let prev = null;
  return list.map((m) => {
    const d = new Date(m.seq);
    const dayBreak =
      !prev || dayLabel(new Date(prev.seq), now) !== dayLabel(d, now)
        ? dayLabel(d, now)
        : null;
    const grouped =
      !dayBreak &&
      !!prev &&
      prev.author_type === m.author_type &&
      (prev.author || {}).name === (m.author || {}).name &&
      d - new Date(prev.seq) < GROUP_WINDOW_MS;
    prev = m;
    return {
      ...m,
      dayBreak,
      grouped,
      time: `${two(d.getHours())}:${two(d.getMinutes())}`,
    };
  });
};

export default decorateMessages;
