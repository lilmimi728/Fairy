// Day keys are local calendar dates formatted as "YYYY-MM-DD". Weeks run Monday–Sunday.

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(key) {
  return (parseKey(key).getDay() + 6) % 7;
}

export function weekStart(key) {
  return addDays(key, -weekdayIndex(key));
}

/** Monday of the most recent fully completed week. */
export function lastCompleteWeekStart(todayKey = dayKey()) {
  return addDays(weekStart(todayKey), -7);
}

export function range(startKey, count) {
  return Array.from({ length: count }, (_, i) => addDays(startKey, i));
}

export function weekDays(startKey) {
  return range(startKey, 7);
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function formatDay(key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseKey(key).toLocaleDateString(undefined, opts);
}

export function formatWeekRange(startKey) {
  const end = addDays(startKey, 6);
  const a = parseKey(startKey);
  const b = parseKey(end);
  const sameMonth = a.getMonth() === b.getMonth();
  const left = a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const right = b.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${left} – ${right}`;
}
