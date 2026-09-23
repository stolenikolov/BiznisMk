/**
 * Dates, written by hand.
 *
 * Same reason money is grouped by hand in `money.ts`: not every browser ships
 * Macedonian locale data, and the ones that do not fall back to English
 * silently — `toLocaleDateString` then prints 21 September as "9/21/2026" in
 * the middle of a Macedonian sentence. Every date the app shows is
 * `dd.mm.yyyy`, in both languages, because that is how a date is written here.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** "21.09.2026" */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** "21.09.2026 16:40" */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
