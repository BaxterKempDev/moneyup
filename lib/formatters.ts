import { format, formatDistanceToNow, parseISO } from "date-fns"

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Math.abs(cents) / 100)
}

export function formatCurrencySigned(cents: number): string {
  const abs = Math.abs(cents) / 100
  const formatted = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(abs)
  return cents >= 0 ? `+${formatted}` : `-${formatted}`
}

export function formatDate(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy")
}

export function formatDateShort(iso: string): string {
  return format(parseISO(iso), "d MMM")
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true })
}

export function formatFrequency(freq: string): string {
  const map: Record<string, string> = {
    weekly: "Weekly",
    fortnightly: "Fortnightly",
    monthly: "Monthly",
    quarterly: "Quarterly",
  }
  return map[freq] ?? freq
}
