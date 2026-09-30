// Dates render on the server, so they are in the server's time zone.

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** `16:35` */
export function formatTime(time: number) {
  return TIME.format(time);
}

/** `Thu 24 Sep` */
export function formatDay(time: number) {
  const parts = Object.fromEntries(
    DAY.formatToParts(time).map(({ type, value }) => [type, value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

/** `2026-09-24`, for grouping by day and `<time datetime>`. */
export function isoDay(time: number) {
  const date = new Date(time);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
