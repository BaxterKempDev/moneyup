"use client"

import { useMemo, useState } from "react"
import { useTransactions, useCategories, isNotConfigured } from "@/hooks/useUpData"
import { formatCurrency, formatDateShort } from "@/lib/formatters"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { NoTokenState } from "@/components/no-token-state"
import { RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function TransactionsPage() {
  const { transactions, isLoading, error, mutate } = useTransactions()
  const { categories } = useCategories()
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.attributes.name])),
    [categories]
  )

  const allCategories = useMemo(() => {
    const ids = new Set<string>()
    for (const tx of transactions) {
      const id = tx.relationships.category.data?.id
      if (id) ids.add(id)
    }
    return [...ids].map((id) => ({ id, name: categoryMap.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions, categoryMap])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return transactions.filter((tx) => {
      const matchesSearch = !q || tx.attributes.description.toLowerCase().includes(q)
      const matchesCat =
        selectedCategory === "all" || tx.relationships.category.data?.id === selectedCategory
      return matchesSearch && matchesCat
    })
  }, [transactions, search, selectedCategory])

  if (isNotConfigured(error)) return <NoTokenState />

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Transactions
        </h1>
        <Button variant="ghost" size="icon-xs" onClick={() => mutate()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 border border-border px-2 py-1 flex-1 min-w-48">
          <Search className="size-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search merchant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs bg-transparent outline-none flex-1 placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="text-xs bg-background border border-border px-2 py-1 outline-none appearance-none cursor-pointer"
        >
          <option value="all">All categories</option>
          {allCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name.replace(/-/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} · last 90 days
        </p>
      )}

      {/* Table */}
      <div className="border border-border">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 border-b border-border last:border-0">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-40 rounded-none" />
                  <Skeleton className="h-2.5 w-20 rounded-none" />
                </div>
                <Skeleton className="h-3 w-16 rounded-none" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">No transactions found</div>
        ) : (
          <div>
            {filtered.map((tx, i) => {
              const isPositive = tx.attributes.amount.valueInBaseUnits > 0
              const catId = tx.relationships.category.data?.id
              const catName = catId ? categoryMap.get(catId) : undefined
              const date = tx.attributes.settledAt ?? tx.attributes.createdAt

              return (
                <div
                  key={tx.id}
                  className={cn(
                    "flex items-center justify-between p-3 gap-4",
                    i !== filtered.length - 1 && "border-b border-border"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{tx.attributes.description}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{formatDateShort(date)}</span>
                      {catName && (
                        <Badge variant="secondary" className="text-xs rounded-none px-1 py-0 h-4 capitalize">
                          {catName.replace(/-/g, " ")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "text-xs font-semibold tabular-nums shrink-0",
                      isPositive ? "text-green-600 dark:text-green-400" : "text-foreground"
                    )}
                  >
                    {isPositive ? "+" : ""}
                    {isPositive
                      ? formatCurrency(tx.attributes.amount.valueInBaseUnits)
                      : `-${formatCurrency(tx.attributes.amount.valueInBaseUnits)}`}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
