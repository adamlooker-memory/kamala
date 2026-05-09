/**
 * Formatting helpers shared between retreat list / detail / waitlist UI.
 *
 * Rules:
 * - Money is stored as integer pence in D1. Whole pounds render with no
 *   decimals; partial pounds render with two decimals.
 * - Dates render British-style: "Fri 2 – Sun 4 Oct".
 */

export function formatPence(pence: number): string {
  if (!Number.isFinite(pence)) return '';
  const pounds = pence / 100;
  const isWhole = Math.abs(pounds - Math.round(pounds)) < 1e-9;
  return isWhole
    ? `£${Math.round(pounds).toLocaleString('en-GB')}`
    : `£${pounds.toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Returns "Fri 2 Oct" — UTC components to avoid TZ drift on server. */
function shortDay(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * "Fri 2 – Sun 4 Oct" when months match, otherwise
 * "Fri 30 Sep – Sun 2 Oct".
 */
export function formatDateRange(start: Date | number, end: Date | number): string {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const sameMonth =
    s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  if (sameMonth) {
    const left = `${WEEKDAYS[s.getUTCDay()]} ${s.getUTCDate()}`;
    const right = `${WEEKDAYS[e.getUTCDay()]} ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
    return `${left} – ${right}`;
  }
  return `${shortDay(s)} – ${shortDay(e)}`;
}

/** YYYY-MM-DD for <input type="date">. */
export function toDateInputValue(d: Date | number | null | undefined): string {
  if (d === null || d === undefined) return '';
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Eyebrow like "October weekend" — uses full month + "weekend". */
export function monthEyebrow(d: Date | number): string {
  const x = d instanceof Date ? d : new Date(d);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[x.getUTCMonth()]} weekend`;
}
