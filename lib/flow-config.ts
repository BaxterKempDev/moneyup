import type { BillFrequency } from "./bills-detector"
import { LS } from "./moneyup-storage"

export type { BillFrequency }

export interface BillSplit {
  id: string
  name: string
  type: "fixed" | "percentage"
  value: number // cents if fixed, 0-100 if percentage
}

export interface Bill {
  id: string
  name: string
  merchant: string // matches tx.attributes.description (case-insensitive)
  splits: BillSplit[]
  /** When auto-detection cannot infer frequency, amount per billing period (cents) */
  estimatedAmountCents?: number
  /** How often the estimated amount recurs (required with estimatedAmountCents) */
  estimatedFrequency?: BillFrequency
}

/** Normalize for matching names (trim + lowercase) */
export function normalizePersonKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Map normalized key → preferred display name (first spelling wins) */
export function getSharedPeopleMap(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(LS.SHARED_PEOPLE)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
    return {}
  } catch {
    return {}
  }
}

export function saveSharedPeopleMap(map: Record<string, string>): void {
  localStorage.setItem(LS.SHARED_PEOPLE, JSON.stringify(map))
}

/** Remember a display name (merges case-insensitively) */
export function rememberSharedPerson(displayName: string): void {
  const t = displayName.trim()
  if (!t) return
  const key = normalizePersonKey(t)
  const map = getSharedPeopleMap()
  if (!map[key]) map[key] = t
  saveSharedPeopleMap(map)
}

/** Sorted list of known people for autocomplete */
export function getSharedPeopleList(): string[] {
  const map = getSharedPeopleMap()
  return [...new Set(Object.values(map))].sort((a, b) => a.localeCompare(b))
}

/** Pull names from bill splits into the shared map */
export function syncSharedPeopleFromBills(bills: Bill[]): void {
  const map = getSharedPeopleMap()
  let changed = false
  for (const bill of bills) {
    for (const s of bill.splits) {
      const t = s.name.trim()
      if (!t) continue
      const key = normalizePersonKey(t)
      if (!map[key]) {
        map[key] = t
        changed = true
      }
    }
  }
  if (changed) saveSharedPeopleMap(map)
}

export function getBills(): Bill[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(LS.BILLS) ?? "[]")
  } catch {
    return []
  }
}

export function saveBills(bills: Bill[]): void {
  localStorage.setItem(LS.BILLS, JSON.stringify(bills))
}

export function getBillsDetectedOrderUpcoming(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(LS.BILLS_DETECTED_ORDER_UPCOMING)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
      ? parsed
      : []
  } catch {
    return []
  }
}

export function saveBillsDetectedOrderUpcoming(order: string[]): void {
  localStorage.setItem(LS.BILLS_DETECTED_ORDER_UPCOMING, JSON.stringify(order))
}

export function getBillsDetectedOrderPast(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(LS.BILLS_DETECTED_ORDER_PAST)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
      ? parsed
      : []
  } catch {
    return []
  }
}

export function saveBillsDetectedOrderPast(order: string[]): void {
  localStorage.setItem(LS.BILLS_DETECTED_ORDER_PAST, JSON.stringify(order))
}

export function getFortnightlyIncome(): number | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(LS.INCOME)
  return raw ? Number(raw) : null
}

export function saveFortnightlyIncome(cents: number): void {
  localStorage.setItem(LS.INCOME, String(cents))
}

export function getIncomeSource(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(LS.INCOME_SOURCE)
}

export function saveIncomeSource(source: string): void {
  localStorage.setItem(LS.INCOME_SOURCE, source)
}

export function clearIncome(): void {
  localStorage.removeItem(LS.INCOME)
  localStorage.removeItem(LS.INCOME_SOURCE)
}
