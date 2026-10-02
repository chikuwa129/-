// 日付はすべて日本時間（JST）で扱う。
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" });
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日本時間の日付（YYYY-MM-DD） */
export function jstDate(d: Date = new Date()): string {
  return dateFormatter.format(d);
}

export function isDateString(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** 日本時間のその日の 0:00 をISO文字列（UTC）で */
export function jstStartOfDay(date: string): string {
  return new Date(`${date}T00:00:00+09:00`).toISOString();
}

/** 「9月28日(月)」の形 */
export function formatJpDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAYS[d.getUTCDay()]})`;
}

/** 「10/2 6:05」の形（日本時間） */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}
