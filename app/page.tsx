"use client"

import { useMemo } from "react"
import { addDays, startOfMonth } from "date-fns"
import { useAccounts, useTransactions, useCategories, isNotConfigured } from "@/hooks/useUpData"
import { detectBills } from "@/lib/bills-detector"
import { formatCurrency, formatDate } from "@/lib/formatters"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NoTokenState } from "@/components/no-token-state"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Dashboard() {
  const { accounts, isLoading: accountsLoading, error: accountsError, mutate: mutateAccounts } = useAccounts()
  const { transactions, isLoading: txLoading, mutate: mutateTx } = useTransactions()
  const { categories } = useCategories()

  const isLoading = accountsLoading || txLoading

  const monthStart = startOfMonth(new Date()).toISOString()

  const monthlyTxs = useMemo(
    () => transactions.filter((t) => t.attributes.settledAt && t.attributes.settledAt >= monthStart),
    [transactions, monthStart]
  )

  const income = useMemo(
    () =>
      monthlyTxs
        .filter((t) => t.attributes.amount.valueInBaseUnits > 0)
        .reduce((sum, t) => sum + t.attributes.amount.valueInBaseUnits, 0),
    [monthlyTxs]
  )

  const spending = useMemo(
    () =>
      monthlyTxs
        .filter((t) => t.attributes.amount.valueInBaseUnits < 0)
        .reduce((sum, t) => sum + Math.abs(t.attributes.amount.valueInBaseUnits), 0),
    [monthlyTxs]
  )

  const bills = useMemo(() => detectBills(transactions), [transactions])

  const upcomingBills = useMemo(() => {
    const now = new Date()
    const cutoff = addDays(now, 14)
    return bills.filter((b) => {
      const due = new Date(b.nextDue)
      return due >= now && due <= cutoff
    })
  }, [bills])

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.attributes.name])),
    [categories]
  )

  const topCategories = useMemo(() => {
    const spending = new Map<string, number>()
    for (const tx of monthlyTxs.filter((t) => t.attributes.amount.valueInBaseUnits < 0)) {
      const catId = tx.relationships.category.data?.id
      if (catId) {
        spending.set(catId, (spending.get(catId) ?? 0) + Math.abs(tx.attributes.amount.valueInBaseUnits))
      }
    }
    return [...spending.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amount]) => ({ name: categoryMap.get(id) ?? id, amount }))
  }, [monthlyTxs, categoryMap])

  if (isNotConfigured(accountsError)) return <NoTokenState />

  function refresh() {
    mutateAccounts()
    mutateTx()
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Dashboard
        </h1>
        <Button variant="ghost" size="icon-xs" onClick={refresh} disabled={isLoading}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Accounts */}
      <section>
        <h2 className="text-xs text-muted-foreground mb-2">Accounts</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-none" />
              ))
            : accounts.map((account) => (
                <Card key={account.id} className="p-4 rounded-none space-y-1">
                  <div className="text-xs text-muted-foreground">{account.attributes.displayName}</div>
                  <div className="text-base font-semibold">
                    {formatCurrency(account.attributes.balance.valueInBaseUnits)}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {account.attributes.accountType.toLowerCase().replace("_", " ")}
                  </div>
                </Card>
              ))}
        </div>
      </section>

      {/* Monthly summary */}
      <section>
        <h2 className="text-xs text-muted-foreground mb-2">This month</h2>
        <div className="grid grid-cols-2 gap-2">
          {isLoading ? (
            <>
              <Skeleton className="h-16 rounded-none" />
              <Skeleton className="h-16 rounded-none" />
            </>
          ) : (
            <>
              <Card className="p-4 rounded-none">
                <div className="text-xs text-muted-foreground">Income</div>
                <div className="text-base font-semibold text-green-600 dark:text-green-400 mt-1">
                  {formatCurrency(income)}
                </div>
              </Card>
              <Card className="p-4 rounded-none">
                <div className="text-xs text-muted-foreground">Spending</div>
                <div className="text-base font-semibold text-destructive mt-1">
                  {formatCurrency(spending)}
                </div>
              </Card>
            </>
          )}
        </div>
        {!isLoading && income > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>
                Net:{" "}
                <span className={spending > income ? "text-destructive" : "text-green-600 dark:text-green-400"}>
                  {spending > income ? "-" : "+"}{formatCurrency(Math.abs(income - spending))}
                </span>
              </span>
              <span>{Math.round((spending / income) * 100)}% spent</span>
            </div>
            <div className="h-1 bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min((spending / income) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Upcoming bills */}
      {!isLoading && upcomingBills.length > 0 && (
        <section>
          <h2 className="text-xs text-muted-foreground mb-2">Due in next 14 days</h2>
          <div className="space-y-1.5">
            {upcomingBills.map((bill) => (
              <Card key={bill.merchant} className="p-3 rounded-none flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium">{bill.merchant}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(bill.nextDue)}</div>
                </div>
                <div className="text-xs font-semibold text-destructive">{bill.amountFormatted}</div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Top categories */}
      {!isLoading && topCategories.length > 0 && (
        <section>
          <h2 className="text-xs text-muted-foreground mb-2">Top spending this month</h2>
          <div className="space-y-2">
            {topCategories.map(({ name, amount }) => (
              <div key={name} className="flex items-center gap-3">
                <div className="text-xs w-36 truncate capitalize">{name.replace(/-/g, " ")}</div>
                <div className="flex-1 h-1 bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(amount / (topCategories[0]?.amount ?? 1)) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground w-20 text-right">
                  {formatCurrency(amount)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
