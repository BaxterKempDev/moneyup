import { differenceInDays, addWeeks, addMonths, addYears } from "date-fns"
import type { UpTransaction } from "./up-client"

export type BillFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly"

export interface DetectedBill {
  merchant: string
  amount: number
  amountFormatted: string
  frequency: BillFrequency
  lastCharged: string
  nextDue: string
  confidence: "high" | "medium" | "low"
  occurrences: number
  transactionIds: string[]
}

export interface MerchantBillInfo {
  frequency: BillFrequency
  avgAmount: number // cents
  lastCharged: string // ISO
  nextDue: string // ISO
  occurrences: number
}

// Days between each frequency occurrence (used for period conversion)
export const DAYS_PER_FREQ: Record<BillFrequency, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 365.25 / 12,
  quarterly: 365.25 / 4,
  yearly: 365.25,
}

function classifyInterval(avgDays: number): BillFrequency | null {
  if (avgDays >= 4 && avgDays <= 10) return "weekly"
  if (avgDays >= 11 && avgDays <= 19) return "fortnightly"
  if (avgDays >= 23 && avgDays <= 37) return "monthly"
  if (avgDays >= 76 && avgDays <= 104) return "quarterly"
  if (avgDays >= 300 && avgDays <= 430) return "yearly"
  return null
}

export function predictNextDate(last: Date, freq: BillFrequency): Date {
  switch (freq) {
    case "weekly":      return addWeeks(last, 1)
    case "fortnightly": return addWeeks(last, 2)
    case "monthly":     return addMonths(last, 1)
    case "quarterly":   return addMonths(last, 3)
    case "yearly":      return addYears(last, 1)
  }
}

/** Settled outgoing txs for a merchant, oldest first */
export function getMerchantOutgoingTxs(
  transactions: UpTransaction[],
  merchant: string
): UpTransaction[] {
  return transactions
    .filter(
      (t) =>
        t.attributes.status === "SETTLED" &&
        t.attributes.amount.valueInBaseUnits < 0 &&
        t.attributes.settledAt !== null &&
        t.attributes.description.trim().toLowerCase() === merchant.trim().toLowerCase()
    )
    .sort(
      (a, b) =>
        new Date(a.attributes.settledAt!).getTime() -
        new Date(b.attributes.settledAt!).getTime()
    )
}

/** Average debit amount in cents for this merchant, or null if no txs */
export function getMerchantAmountHint(
  transactions: UpTransaction[],
  merchant: string
): number | null {
  const txs = getMerchantOutgoingTxs(transactions, merchant)
  if (txs.length === 0) return null
  const amounts = txs.map((t) => Math.abs(t.attributes.amount.valueInBaseUnits))
  return Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length)
}

export type BillFlowSource = "detected" | "manual"

export interface ResolvedBillFlow extends MerchantBillInfo {
  source: BillFlowSource
}

export function resolveBillFlow(
  transactions: UpTransaction[],
  bill: {
    merchant: string
    estimatedAmountCents?: number
    estimatedFrequency?: BillFrequency
  }
): ResolvedBillFlow | null {
  const detected = detectMerchantBill(transactions, bill.merchant)
  if (detected) return { ...detected, source: "detected" }

  const amt = bill.estimatedAmountCents
  const freq = bill.estimatedFrequency
  if (amt != null && amt > 0 && freq) {
    const txs = getMerchantOutgoingTxs(transactions, bill.merchant)
    const lastDate =
      txs.length > 0
        ? new Date(txs[txs.length - 1].attributes.settledAt!)
        : new Date()
    return {
      frequency: freq,
      avgAmount: amt,
      lastCharged: lastDate.toISOString(),
      nextDue: predictNextDate(lastDate, freq).toISOString(),
      occurrences: txs.length,
      source: "manual",
    }
  }
  return null
}

export function detectMerchantBill(
  transactions: UpTransaction[],
  merchant: string
): MerchantBillInfo | null {
  const txs = getMerchantOutgoingTxs(transactions, merchant)

  if (txs.length === 0) return null

  const amounts = txs.map((t) => Math.abs(t.attributes.amount.valueInBaseUnits))
  const avgAmount = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length)
  const lastDate = new Date(txs[txs.length - 1].attributes.settledAt!)

  if (txs.length === 1) {
    // Single occurrence — can't reliably detect frequency, leave for user to set
    return null
  }

  const dates = txs.map((t) => new Date(t.attributes.settledAt!))
  const intervals: number[] = []
  for (let i = 1; i < dates.length; i++) {
    intervals.push(differenceInDays(dates[i], dates[i - 1]))
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const frequency = classifyInterval(avgInterval)
  if (!frequency) return null

  return {
    frequency,
    avgAmount,
    lastCharged: lastDate.toISOString(),
    nextDue: predictNextDate(lastDate, frequency).toISOString(),
    occurrences: txs.length,
  }
}

export function detectBills(transactions: UpTransaction[]): DetectedBill[] {
  const outgoing = transactions.filter(
    (t) =>
      t.attributes.status === "SETTLED" &&
      t.attributes.amount.valueInBaseUnits < 0 &&
      t.attributes.settledAt !== null
  )

  const byMerchant = new Map<string, UpTransaction[]>()
  for (const tx of outgoing) {
    const key = tx.attributes.description.trim().toLowerCase()
    if (!byMerchant.has(key)) byMerchant.set(key, [])
    byMerchant.get(key)!.push(tx)
  }

  const bills: DetectedBill[] = []

  for (const [, txs] of byMerchant) {
    if (txs.length < 3) continue

    const sorted = [...txs].sort(
      (a, b) =>
        new Date(a.attributes.settledAt!).getTime() -
        new Date(b.attributes.settledAt!).getTime()
    )

    const dates = sorted.map((t) => new Date(t.attributes.settledAt!))
    const intervals: number[] = []
    for (let i = 1; i < dates.length; i++) {
      intervals.push(differenceInDays(dates[i], dates[i - 1]))
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const freq = classifyInterval(avgInterval)
    if (!freq) continue

    const amounts = sorted.map((t) => Math.abs(t.attributes.amount.valueInBaseUnits))
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const stddev = Math.sqrt(
      amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length
    )
    const isConsistent = mean === 0 ? true : stddev / mean < 0.05

    const lastTx = sorted[sorted.length - 1]
    const lastDate = new Date(lastTx.attributes.settledAt!)
    const nextDue = predictNextDate(lastDate, freq)

    const confidence: DetectedBill["confidence"] =
      txs.length >= 5 && isConsistent ? "high" : txs.length >= 3 ? "medium" : "low"

    bills.push({
      merchant: lastTx.attributes.description.trim(),
      amount: Math.round(mean),
      amountFormatted: `$${(mean / 100).toFixed(2)}`,
      frequency: freq,
      lastCharged: lastDate.toISOString(),
      nextDue: nextDue.toISOString(),
      confidence,
      occurrences: txs.length,
      transactionIds: sorted.map((t) => t.id),
    })
  }

  return bills.sort(
    (a, b) => new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime()
  )
}

export function billMerchantKey(merchant: string): string {
  return merchant.trim().toLowerCase()
}

/** Apply a saved ordering; unknown or new bills follow default sort by next due. */
export function applyBillDisplayOrder(
  bills: DetectedBill[],
  savedOrder: string[]
): DetectedBill[] {
  const byKey = new Map(bills.map((b) => [billMerchantKey(b.merchant), b]))
  const used = new Set<string>()
  const result: DetectedBill[] = []
  for (const key of savedOrder) {
    const b = byKey.get(key)
    if (b && !used.has(key)) {
      result.push(b)
      used.add(key)
    }
  }
  const rest = bills.filter((b) => !used.has(billMerchantKey(b.merchant)))
  rest.sort(
    (a, b) => new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime()
  )
  return [...result, ...rest]
}
