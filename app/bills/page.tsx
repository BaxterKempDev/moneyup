"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { useTransactions, isNotConfigured } from "@/hooks/useUpData"
import { detectBills, applyBillDisplayOrder, billMerchantKey } from "@/lib/bills-detector"
import {
  getBillsDetectedOrderUpcoming,
  saveBillsDetectedOrderUpcoming,
  getBillsDetectedOrderPast,
  saveBillsDetectedOrderPast,
} from "@/lib/flow-config"
import { formatDate, formatFrequency } from "@/lib/formatters"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NoTokenState } from "@/components/no-token-state"
import { Button } from "@/components/ui/button"
import { RefreshCw, Calendar, ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { differenceInDays } from "date-fns"

const confidenceStyle: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-muted text-muted-foreground",
}

function reorderKeys(keys: string[], index: number, dir: "up" | "down"): string[] {
  const j = dir === "up" ? index - 1 : index + 1
  if (j < 0 || j >= keys.length) return keys
  const next = [...keys]
  ;[next[index], next[j]] = [next[j], next[index]]
  return next
}

function BillReorderArrows({
  atTop,
  atBottom,
  onUp,
  onDown,
}: {
  atTop: boolean
  atBottom: boolean
  onUp: () => void
  onDown: () => void
}) {
  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-none border border-border bg-muted/60 divide-y divide-border">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none text-foreground hover:bg-background/80"
        disabled={atTop}
        aria-label="Move up"
        onClick={onUp}
      >
        <ChevronUp className="size-4" strokeWidth={2.25} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none text-foreground hover:bg-background/80"
        disabled={atBottom}
        aria-label="Move down"
        onClick={onDown}
      >
        <ChevronDown className="size-4" strokeWidth={2.25} />
      </Button>
    </div>
  )
}

export default function BillsPage() {
  const { transactions, isLoading, error, mutate } = useTransactions()

  const bills = useMemo(() => detectBills(transactions), [transactions])

  const [orderUpcoming, setOrderUpcoming] = useState<string[]>([])
  const [orderPast, setOrderPast] = useState<string[]>([])

  useEffect(() => {
    setOrderUpcoming(getBillsDetectedOrderUpcoming())
    setOrderPast(getBillsDetectedOrderPast())
  }, [])

  const now = new Date()
  const upcoming = bills.filter((b) => new Date(b.nextDue) >= now)
  const past = bills.filter((b) => new Date(b.nextDue) < now)

  const orderedUpcoming = useMemo(
    () => applyBillDisplayOrder(upcoming, orderUpcoming),
    [upcoming, orderUpcoming]
  )
  const orderedPast = useMemo(
    () => applyBillDisplayOrder(past, orderPast),
    [past, orderPast]
  )

  const moveUpcoming = useCallback((index: number, dir: "up" | "down") => {
    const keys = orderedUpcoming.map((b) => billMerchantKey(b.merchant))
    const next = reorderKeys(keys, index, dir)
    if (next === keys) return
    setOrderUpcoming(next)
    saveBillsDetectedOrderUpcoming(next)
  }, [orderedUpcoming])

  const movePast = useCallback((index: number, dir: "up" | "down") => {
    const keys = orderedPast.map((b) => billMerchantKey(b.merchant))
    const next = reorderKeys(keys, index, dir)
    if (next === keys) return
    setOrderPast(next)
    saveBillsDetectedOrderPast(next)
  }, [orderedPast])

  if (isNotConfigured(error)) return <NoTokenState />

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Bills
        </h1>
        <Button variant="ghost" size="icon-xs" onClick={() => mutate()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-none" />
          ))}
        </div>
      ) : bills.length === 0 ? (
        <Card className="p-8 rounded-none text-center">
          <Calendar className="size-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs font-medium">No recurring bills detected</p>
          <p className="text-xs text-muted-foreground mt-1">
            Bills are auto-detected from 3+ recurring transactions in the last 90 days
          </p>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs text-muted-foreground mb-2">Upcoming</h2>
              <div className="space-y-1.5">
                {orderedUpcoming.map((bill, index) => {
                  const daysUntil = differenceInDays(new Date(bill.nextDue), now)
                  return (
                    <Card
                      key={billMerchantKey(bill.merchant)}
                      className="overflow-visible p-4 rounded-none"
                    >
                      <div className="flex items-center gap-3">
                        <BillReorderArrows
                          atTop={index === 0}
                          atBottom={index === orderedUpcoming.length - 1}
                          onUp={() => moveUpcoming(index, "up")}
                          onDown={() => moveUpcoming(index, "down")}
                        />
                        <div className="flex items-start justify-between gap-4 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">{bill.merchant}</span>
                              <span
                                className={cn(
                                  "text-xs px-1.5 py-0.5 rounded-none font-medium",
                                  confidenceStyle[bill.confidence]
                                )}
                              >
                                {bill.confidence}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>{formatFrequency(bill.frequency)}</span>
                              <span>·</span>
                              <span>Due {formatDate(bill.nextDue)}</span>
                              <span>·</span>
                              <span className={daysUntil <= 3 ? "text-destructive font-medium" : ""}>
                                {daysUntil === 0
                                  ? "due today"
                                  : daysUntil === 1
                                  ? "tomorrow"
                                  : `${daysUntil} days`}
                              </span>
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-destructive shrink-0">
                            {bill.amountFormatted}
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-xs text-muted-foreground mb-2">Overdue / recently charged</h2>
              <div className="space-y-1.5">
                {orderedPast.map((bill, index) => (
                  <Card
                    key={billMerchantKey(bill.merchant)}
                    className="overflow-visible p-4 rounded-none opacity-70"
                  >
                    <div className="flex items-center gap-3">
                      <BillReorderArrows
                        atTop={index === 0}
                        atBottom={index === orderedPast.length - 1}
                        onUp={() => movePast(index, "up")}
                        onDown={() => movePast(index, "down")}
                      />
                      <div className="flex items-start justify-between gap-4 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{bill.merchant}</span>
                            <Badge variant="secondary" className="text-xs rounded-none">
                              {formatFrequency(bill.frequency)}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Last charged {formatDate(bill.lastCharged)} · {bill.occurrences} times
                          </div>
                        </div>
                        <div className="text-xs font-semibold shrink-0">{bill.amountFormatted}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
