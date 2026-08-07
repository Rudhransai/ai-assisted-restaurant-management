/**
 * Reservation time normalisation.
 *
 * reservation_time is a TEXT column and historically stored whatever the form sent —
 * usually a bare "19:30". A bare time cannot be compared with the clock, so the
 * reminder scheduler skipped those rows forever. Times are now normalised to ISO 8601
 * on the way in, which keeps the column sortable and makes every stored value parseable.
 *
 * Accepted input:
 *   "19:30"                  -> the NEXT occurrence of 19:30 (today if still ahead, else tomorrow)
 *   "2026-08-07T19:30"       -> as given (datetime-local format, local timezone)
 *   any string Date.parse understands (full ISO, RFC 2822, ...)
 */

const BARE_TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseReservationTime(input: string, now: Date = new Date()): Date | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  const bare = BARE_TIME.exec(raw);
  if (bare) {
    const at = new Date(now);
    at.setHours(Number(bare[1]), Number(bare[2]), 0, 0);
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
    return at;
  }

  // Looks like a bare time but failed validation (e.g. "25:00", "19:60"). Reject it here:
  // the lenient Date parser below would otherwise reinterpret it (V8 reads "19:60" as the
  // year 1960).
  if (/^\d{1,3}:\d{1,2}$/.test(raw)) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Human-readable form for messages and the dashboard, e.g. "7 Aug, 7:30 pm".
 * Legacy rows may still hold free-form text — those are shown as stored.
 */
export function formatReservationTime(stored: string): string {
  const parsed = new Date(stored);
  if (Number.isNaN(parsed.getTime())) return stored;

  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
