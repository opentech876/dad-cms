/**
 * Shared French date formatting.
 *
 * All inputs accept either a YYYY-MM-DD date string, a full ISO timestamp,
 * `null`, or `undefined`. Null/undefined → empty string so templates render
 * blank cells instead of "Invalid Date".
 */

export const MONTHS_FR_LONG = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export const MONTHS_FR_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

export const MONTHS_FR_LONG_CAP = MONTHS_FR_LONG.map(
  m => m.charAt(0).toUpperCase() + m.slice(1),
);

/** "15 août 2026" — use for hero blocks, detail cards, event titles. */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  const monthName = MONTHS_FR_LONG[parseInt(m, 10) - 1] ?? '';
  return `${parseInt(d, 10)} ${monthName} ${y}`;
}

/** "15/08/2026" — use for tables, lists, badges, filter labels. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** "15/08/2026 14h30" — use for notifications, audit log entries. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}h${mi}`;
}

/**
 * Relative time in French — "il y a 8 min", "hier", etc.
 * Falls back to short date after a week.
 */
export function formatRelativeFr(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "À l'instant";
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  const diffDay = Math.floor(diffSec / 86400);
  if (diffDay === 1) return 'hier';
  if (diffDay < 7) return `il y a ${diffDay} j`;
  return formatDateShort(iso);
}

/** "15 août" — long form without year, for in-year contexts. */
export function formatDayMonthLong(iso: string | null | undefined): string {
  if (!iso) return '';
  const [_y, m, d] = iso.slice(0, 10).split('-');
  if (!m || !d) return iso;
  const monthName = MONTHS_FR_LONG[parseInt(m, 10) - 1] ?? '';
  return `${parseInt(d, 10)} ${monthName}`;
}
