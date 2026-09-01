import type { Currency } from "./types";

/**
 * Every currency is stored as 2-decimal minor units, including HUF and other
 * real-world zero-decimal currencies. Intl would otherwise render HUF/JPY-style
 * currencies without decimals, so the fraction digits are pinned here.
 */
const MINOR_UNITS_PER_MAJOR = 100;

const formatterCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: Currency, withSymbol: boolean): Intl.NumberFormat {
  const key = `${currency}:${withSymbol}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat("en-US", {
    style: withSymbol ? "currency" : "decimal",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  formatterCache.set(key, formatter);
  return formatter;
}

export function formatMoney(amountMinor: number, currency: Currency): string {
  const major = (amountMinor ?? 0) / MINOR_UNITS_PER_MAJOR;
  try {
    return currencyFormatter(currency, true).format(major);
  } catch {
    return `${currencySymbol(currency)}${currencyFormatter(currency, false).format(major)}`;
  }
}

/** Absolute value, for places where the sign is carried by colour or an arrow. */
export function formatMoneyAbs(amountMinor: number, currency: Currency): string {
  return formatMoney(Math.abs(amountMinor ?? 0), currency);
}

/** Signed, with an explicit leading "+" for positives. */
export function formatMoneySigned(amountMinor: number, currency: Currency): string {
  const formatted = formatMoney(Math.abs(amountMinor ?? 0), currency);
  if (amountMinor > 0) return `+${formatted}`;
  if (amountMinor < 0) return `-${formatted}`;
  return formatted;
}

const FALLBACK_SYMBOLS: Record<Currency, string> = {
  EUR: "€",
  HUF: "Ft",
  USD: "$",
  INR: "₹",
  GBP: "£",
  CZK: "Kč",
};

export function currencySymbol(currency: Currency): string {
  try {
    const parts = currencyFormatter(currency, true).formatToParts(0);
    const symbol = parts.find((p) => p.type === "currency")?.value;
    if (symbol) return symbol;
  } catch {
    /* fall through to the table below */
  }
  return FALLBACK_SYMBOLS[currency] ?? currency;
}

/**
 * Accepts what people actually type: "12", "12.5", "12,50", "€12.50", "1 234,56".
 * Returns integer minor units; 0 for anything unparseable.
 */
export function parseAmountToMinor(input: string, _currency?: Currency): number {
  if (typeof input !== "string") return 0;

  let cleaned = input.replace(/[^0-9.,-]/g, "").trim();
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal point.
    const decimalSep = lastComma > lastDot ? "," : ".";
    const groupSep = decimalSep === "," ? "." : ",";
    cleaned = cleaned.split(groupSep).join("");
    cleaned = cleaned.replace(decimalSep, ".");
  } else if (lastComma > -1) {
    // A lone comma is a decimal separator unless it groups thousands (1,234).
    const decimals = cleaned.length - lastComma - 1;
    cleaned = decimals === 3 ? cleaned.split(",").join("") : cleaned.replace(",", ".");
  }

  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * MINOR_UNITS_PER_MAJOR);
}

/** Minor units back into an editable plain-number string ("1234" -> "12.34"). */
export function minorToInput(amountMinor: number): string {
  if (!Number.isFinite(amountMinor)) return "";
  return (amountMinor / MINOR_UNITS_PER_MAJOR).toFixed(2);
}

/* ---- Dates ------------------------------------------------------------- */

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today", "Yesterday", "12 Mar", or "12 Mar 2024" for other years. */
export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";

  const now = new Date();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function formatLongDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Local (not UTC) yyyy-mm-dd, so <input type="date"> defaults to today. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function toDateInputValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayIso();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
