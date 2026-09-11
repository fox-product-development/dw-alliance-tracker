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

module.exports = { windowBounds, iso, pretty };
