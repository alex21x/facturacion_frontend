/**
 * lima.ts — Single source of truth for all timezone-aware date/time operations.
 *
 * ALL date generation (now, today) and ALL display formatting across the project
 * must go through these helpers. Never use:
 *   - new Date().getFullYear() / getMonth() / getDate()   → uses browser TZ
 *   - new Date().toISOString()                            → UTC, not Lima
 *   - .toLocaleString() / .toLocaleDateString() without timeZone option
 *   - Intl.DateTimeFormat without timeZone: 'America/Lima'
 */

const TZ = 'America/Lima';

// ─── "Now" / "Today" generators ───────────────────────────────────────────────

/** Returns today's date in Lima as 'YYYY-MM-DD' (for date inputs, filters, filenames). */
export function todayLima(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Returns current Lima datetime as ISO 8601 with -05:00 offset.
 * e.g. '2026-04-14T12:30:00-05:00'
 * Use for: paid_at, void_at, closed_at and any timestamp sent to backend.
 */
export function nowLimaIso(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}-05:00`;
}

/**
 * Returns a Lima-aware Date object representing "N days ago from now in Lima".
 * Safe to use with todayLima() arithmetic; do NOT call .toISOString() on the result.
 */
export function daysAgoLima(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  // Extract Lima date components
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Returns YYYY-MM-DD of the first day of N months ago in Lima. */
export function monthsAgoStartLima(n: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const year = pick('year');
  const month = pick('month'); // 1-12
  const targetYear = month - n <= 0
    ? year - Math.ceil((n - month + 1) / 12)
    : year;
  const targetMonth = ((month - n - 1 + 12 * 12) % 12) + 1;
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
}

/** Returns YYYY-01-01 of N years ago in Lima. */
export function yearsAgoStartLima(n: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? '0');
  return `${year - n}-01-01`;
}

// ─── Display formatters ────────────────────────────────────────────────────────

/**
 * Normalises a backend datetime string so the browser parses it as Lima time.
 * Strings without offset are assumed UTC (PostgreSQL default).
 */
function normaliseForDisplay(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Date-only: treat as Lima midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(trimmed + 'T00:00:00-05:00');
  }
  // Has explicit offset (Z or ±HH:MM) — JS parses correctly
  if (/Z$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  // No offset → assume UTC
  return new Date(trimmed + 'Z');
}

/** Formats a stored datetime as 'DD/MM/YYYY HH:MM AM/PM' in Lima time. */
export function fmtDateTimeLima(value: string | null | undefined): string {
  if (!value) return '-';
  const d = normaliseForDisplay(value);
  if (!d || Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: TZ,
  }).format(d);
}

/** Formats a stored date/datetime as 'DD/MM/YYYY' in Lima time. */
export function fmtDateLima(value: string | null | undefined): string {
  if (!value) return '-';
  const d = normaliseForDisplay(value);
  if (!d || Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TZ,
  }).format(d);
}

/** Formats a stored datetime as 'DD/MM/YYYY HH:MM' (24h) in Lima time. */
export function fmtDateTimeShortLima(value: string | null | undefined): string {
  if (!value) return '-';
  const d = normaliseForDisplay(value);
  if (!d || Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(d);
}

/** Formats a stored datetime as 'DD/MM/YYYY, HH:MM' (24h) in Lima time. */
export function fmtDateTimeFullLima(value: string | null | undefined): string {
  if (!value) return '-';
  const d = normaliseForDisplay(value);
  if (!d || Number.isNaN(d.getTime())) return value;

  const parts = new Intl.DateTimeFormat('es-PE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const day = pick('day');
  const month = pick('month');
  const year = pick('year');
  const hour = pick('hour');
  const minute = pick('minute');

  if (day && month && year && hour && minute) {
    return `${day}/${month}/${year}, ${hour}:${minute}`;
  }

  return new Intl.DateTimeFormat('es-PE', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(d);
}

/** Formats "now" as a human-readable Lima date+time. e.g. '14/04/2026 12:30 p. m.' */
export function fmtNowLima(): string {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: TZ,
  }).format(new Date());
}

// ─── Grouping key helpers (used in analytics / charts) ────────────────────────

/**
 * Extracts Lima year/month/day parts from a stored datetime string.
 * Use for grouping document rows by their Lima date.
 */
export function limaDateParts(value: string): { year: number; month: number; day: number } | null {
  const d = normaliseForDisplay(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}
