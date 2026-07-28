/**
 * TRADE//OS Timezone Utilities
 *
 * Converts UTC timestamps to user's IANA timezone for display and statistics.
 * Session classification is computed at query time, not at import time.
 */

export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

const IANA_RE = /^[A-Za-z_]+\/[A-Za-z_\/]+$/;

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getDateTimeParts(timestamp: number, tz: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function parseNaiveDateTime(value: string): DateTimeParts | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  const yearFirst = normalized.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  const dayFirst = normalized.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  const match = yearFirst ?? dayFirst;
  if (!match) return null;

  const dateParts = yearFirst
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [Number(match[3]), Number(match[2]), Number(match[1])];
  const parsed: DateTimeParts = {
    year: dateParts[0],
    month: dateParts[1],
    day: dateParts[2],
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
  };
  const validationDate = new Date(
    Date.UTC(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hour,
      parsed.minute,
      parsed.second
    )
  );

  if (
    parsed.month < 1 ||
    parsed.month > 12 ||
    parsed.day < 1 ||
    parsed.day > 31 ||
    parsed.hour > 23 ||
    parsed.minute > 59 ||
    parsed.second > 59 ||
    validationDate.getUTCFullYear() !== parsed.year ||
    validationDate.getUTCMonth() + 1 !== parsed.month ||
    validationDate.getUTCDate() !== parsed.day
  ) {
    return null;
  }

  return parsed;
}

/**
 * Parse an imported timestamp without allowing the server's local timezone to
 * influence the result. Offset-bearing timestamps are used as-is. Naive broker
 * timestamps are interpreted in the explicitly selected source timezone.
 *
 * Returns null for invalid input and for local times that do not exist during a
 * daylight-saving transition.
 */
export function parseTimestampInTimezone(
  value: string | number,
  sourceTimezone: string
): number | null {
  if (!isValidTimezone(sourceTimezone)) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  const input = value.trim();
  if (!input) return null;
  if (/^\d{10,13}$/.test(input)) {
    const numeric = Number(input);
    return input.length === 10 ? numeric * 1000 : numeric;
  }

  // An explicit Z or numeric UTC offset makes the source timezone irrelevant.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(input)) {
    const timestamp = Date.parse(input);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const local = parseNaiveDateTime(input);
  if (!local) return null;

  const desiredAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );
  let candidate = desiredAsUtc;

  // Two passes handle offsets that differ between the provisional UTC instant
  // and the requested local instant.
  for (let pass = 0; pass < 2; pass++) {
    const zoned = getDateTimeParts(candidate, sourceTimezone);
    const zonedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    candidate += desiredAsUtc - zonedAsUtc;
  }

  const roundTrip = getDateTimeParts(candidate, sourceTimezone);
  const matches = (Object.keys(local) as (keyof DateTimeParts)[]).every(
    (key) => local[key] === roundTrip[key]
  );
  return matches ? candidate : null;
}

/**
 * Validate a timezone string against the Intl API.
 */
export function isValidTimezone(tz: string): boolean {
  if (tz === "UTC") return true;
  if (!IANA_RE.test(tz)) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a short abbreviation for a timezone at a given timestamp.
 * e.g. "MYT", "EST", "UTC"
 */
export function getTimezoneAbbr(tz: string, timestamp: number = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date(timestamp));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz.split("/").pop() ?? tz;
  } catch {
    return tz.split("/").pop() ?? tz;
  }
}

/**
 * Convert a UTC timestamp to a Date in the given timezone.
 * Returns a plain Date object whose getHours/getDay etc. reflect the target timezone.
 */
export function toTimezoneDate(utcMs: number, tz: string): Date {
  // Format the time in the target timezone as ISO parts, then parse them locally
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(utcMs));
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const year = get("year");
  const month = get("month") - 1; // 0-indexed
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  return new Date(year, month, day, hour, minute, second);
}

/**
 * Get the weekday (0=Sunday) in the user's timezone.
 */
export function getWeekdayInTz(utcMs: number, tz: string): number {
  return toTimezoneDate(utcMs, tz).getDay();
}

/**
 * Get the hour (0-23) in the user's timezone.
 */
export function getHourInTz(utcMs: number, tz: string): number {
  return toTimezoneDate(utcMs, tz).getHours();
}

/**
 * Get the date string (YYYY-MM-DD) in the user's timezone.
 */
export function getDateStrInTz(utcMs: number, tz: string): string {
  const d = toTimezoneDate(utcMs, tz);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Classify a trade's session based on hour in the user's timezone.
 */
export function classifySession(hour: number): string {
  if (hour >= 0 && hour < 8) return "asia";
  if (hour >= 8 && hour < 12) return "london";
  if (hour >= 12 && hour < 16) return "ny";
  if (hour >= 16 && hour < 21) return "ny-after";
  return "asia";
}

/**
 * Format a UTC timestamp for display in the user's timezone.
 */
export function formatDateTime(utcMs: number, tz: string, locale: string = "en-US"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(utcMs));
  } catch {
    return new Date(utcMs).toLocaleString();
  }
}

/**
 * Format a UTC timestamp for display with timezone abbreviation.
 * e.g. "Jul 25, 14:30 MYT"
 */
export function formatDateTimeWithTz(utcMs: number, tz: string, locale: string = "en-US"): string {
  const dateStr = formatDateTime(utcMs, tz, locale);
  const abbr = getTimezoneAbbr(tz, utcMs);
  return `${dateStr} ${abbr}`;
}
