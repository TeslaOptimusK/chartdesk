/** Feature ID: data.session_status */

export type SessionStatus = {
  exchange: string;
  label: string;
  open: boolean;
  delayed: boolean;
};

const TZ_OFFSET_LABELS: Record<string, string> = {
  "America/New_York": "New York",
  "America/Chicago": "Chicago",
  "Europe/London": "London",
  "Asia/Seoul": "Seoul",
  "Asia/Tokyo": "Tokyo",
  UTC: "UTC",
};

export function timezoneDisplay(tz: string, date = new Date()): string {
  const name = TZ_OFFSET_LABELS[tz] ?? tz.split("/").pop() ?? tz;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const offset =
      parts.find((p) => p.type === "timeZoneName")?.value?.replace("GMT", "UTC") ??
      "";
    return `${name} (${offset})`;
  } catch {
    return name;
  }
}

function hourInTz(tz: string, date: Date): { day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { day: dayMap[weekday] ?? 1, hour: hour === 24 ? 0 : hour, minute };
}

/** Rough regular-session check for demo (no holiday calendar). */
export function getSessionStatus(
  exchange: string | undefined,
  date = new Date()
): SessionStatus {
  const ex = (exchange ?? "NYSE").toUpperCase();
  const delayed = true;

  if (ex === "KRX" || ex === "KOSPI" || ex === "KOSDAQ") {
    const { day, hour, minute } = hourInTz("Asia/Seoul", date);
    const mins = hour * 60 + minute;
    const open =
      day >= 1 && day <= 5 && mins >= 9 * 60 && mins < 15 * 60 + 30;
    return {
      exchange: "KRX",
      label: open ? "KRX Open (delayed)" : "KRX Closed (delayed)",
      open,
      delayed,
    };
  }

  if (ex === "BINANCE" || ex.includes("CRYPTO")) {
    return {
      exchange: "CRYPTO",
      label: "Crypto 24h (delayed)",
      open: true,
      delayed,
    };
  }

  // Default US equity (NYSE/NASDAQ)
  const { day, hour, minute } = hourInTz("America/New_York", date);
  const mins = hour * 60 + minute;
  const open =
    day >= 1 && day <= 5 && mins >= 9 * 60 + 30 && mins < 16 * 60;
  const name = ex === "NASDAQ" ? "NASDAQ" : "NYSE";
  return {
    exchange: name,
    label: open ? `${name} Open (delayed)` : `${name} Closed (delayed)`,
    open,
    delayed,
  };
}

export const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "Europe/London",
  "Asia/Seoul",
  "Asia/Tokyo",
  "UTC",
] as const;
