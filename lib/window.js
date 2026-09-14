function windowBounds(days) {
  const now = new Date();

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return { start, end };
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function pretty(d) {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Monday of the week containing the given date.
function mondayOf(d) {
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const shift = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - shift);
  return monday;
}

// A VS week runs Monday to Saturday. weeksBack 0 is the most recently
// completed week, 1 the week before that, and so on. The week rolls over
// on Monday, so the current week is never returned.
function weekBounds(weeksBack) {
  const now = new Date();
  const start = mondayOf(now);

  start.setUTCDate(start.getUTCDate() - 7 * (weeksBack + 1));

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 5);

  return { start, end };
}

// The six dates of a VS week as ISO strings, Monday first.
function weekDays(start) {
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(iso(d));
  }
  return days;
}

// How many weeks back a date sits, counted the same way as weekBounds.
// Returns 0 for the most recently completed week.
function weekOffsetFor(dateIso) {
  const target = mondayOf(new Date(`${dateIso}T00:00:00Z`));
  const latest = mondayOf(new Date());
  latest.setUTCDate(latest.getUTCDate() - 7);

  const diff = latest.getTime() - target.getTime();
  return Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

module.exports = {
  windowBounds,
  iso,
  pretty,
  weekBounds,
  weekDays,
  weekOffsetFor,
};
