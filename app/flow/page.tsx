"use client"

import { useState, useEffect, useMemo } from "react"
import { subDays, formatDistanceToNow, parseISO, differenceInDays } from "date-fns"
import { useTransactions, isNotConfigured } from "@/hooks/useUpData"
import {
  getBills, saveBills,
  getFortnightlyIncome, saveFortnightlyIncome,
  getIncomeSource, saveIncomeSource, clearIncome,
  getSharedPeopleList,
  syncSharedPeopleFromBills,
  rememberSharedPerson,
  getSharedPeopleMap,
  normalizePersonKey,
  type Bill, type BillSplit,
} from "@/lib/flow-config"
import {
  detectMerchantBill,
  resolveBillFlow,
  getMerchantAmountHint,
  DAYS_PER_FREQ,
  type BillFrequency,
  type ResolvedBillFlow,
} from "@/lib/bills-detector"
import { formatCurrency, formatDate } from "@/lib/formatters"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NoTokenState } from "@/components/no-token-state"
import { cn } from "@/lib/utils"
import {
  Plus, X, RefreshCw, ChevronDown, ChevronUp, CheckCircle2,
  Pencil, Calendar, AlertCircle, Search,
} from "lucide-react"

// ─── types ───────────────────────────────────────────────────────────────────

type ViewPeriod = "weekly" | "fortnightly" | "monthly" | "yearly"

const VIEW_LABELS: Record<ViewPeriod, string> = {
  weekly: "Week",
  fortnightly: "Fortnight",
  monthly: "Month",
  yearly: "Year",
}

const DAYS_PER_VIEW: Record<ViewPeriod, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 365.25 / 12,
  yearly: 365.25,
}

const FREQ_LABELS: Record<BillFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toPeriod(cents: number, freq: BillFrequency, view: ViewPeriod): number {
  const dailyRate = cents / DAYS_PER_FREQ[freq]
  return Math.round(dailyRate * DAYS_PER_VIEW[view])
}

function splitAmount(billAmount: number, splits: BillSplit[]): number {
  const fixedTotal = splits.filter((s) => s.type === "fixed").reduce((sum, s) => sum + s.value, 0)
  const pctTotal = splits.filter((s) => s.type === "percentage").reduce((sum, s) => sum + s.value, 0)
  return Math.max(0, billAmount - fixedTotal - Math.round((billAmount * pctTotal) / 100))
}

/** One line’s share of the bill (what that person pays / owes for each occurrence) */
function splitLineOwed(split: BillSplit, billAmount: number): number {
  if (split.type === "fixed") return split.value
  return Math.round((billAmount * split.value) / 100)
}

type PersonOwedLine = { billId: string; billName: string; centsPerView: number }

type PersonOwedSummary = {
  key: string
  displayName: string
  totalCents: number
  lines: PersonOwedLine[]
}

function buildPersonOwedSummaries(
  billDetails: { bill: Bill; flow: ResolvedBillFlow | null }[],
  view: ViewPeriod
): PersonOwedSummary[] {
  const displayMap = getSharedPeopleMap()
  const byKey = new Map<string, PersonOwedSummary>()

  for (const { bill, flow } of billDetails) {
    if (!flow) continue
    for (const split of bill.splits) {
      const raw = split.name.trim()
      if (!raw) continue
      const key = normalizePersonKey(raw)
      const owedPerOccurrence = splitLineOwed(split, flow.avgAmount)
      if (owedPerOccurrence <= 0) continue
      const centsPerView = toPeriod(owedPerOccurrence, flow.frequency, view)
      const displayName = displayMap[key] ?? raw

      let row = byKey.get(key)
      if (!row) {
        row = { key, displayName, totalCents: 0, lines: [] }
        byKey.set(key, row)
      }
      row.totalCents += centsPerView
      row.lines.push({
        billId: bill.id,
        billName: bill.name,
        centsPerView,
      })
    }
  }

  return [...byKey.values()]
    .filter((p) => p.totalCents > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

// ─── MerchantPicker ──────────────────────────────────────────────────────────

function MerchantPicker({
  merchants,
  selected,
  onSelect,
}: {
  merchants: string[]
  selected: string
  onSelect: (m: string) => void
}) {
  const [query, setQuery] = useState("")
  const filtered = query
    ? merchants.filter((m) => m.toLowerCase().includes(query.toLowerCase()))
    : merchants

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 border border-border px-2 py-1.5">
        <Search className="size-3 text-muted-foreground shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchant..."
          className="text-xs bg-transparent outline-none flex-1 placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-48 overflow-y-auto border border-border">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">No matches</p>
        ) : (
          filtered.map((m) => (
            <button
              key={m}
              onClick={() => onSelect(m)}
              className={cn(
                "w-full text-left text-xs px-3 py-2 border-b border-border last:border-0 transition-colors",
                selected === m
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted/50 text-foreground"
              )}
            >
              {selected === m && <CheckCircle2 className="size-3 inline mr-1.5 text-primary" />}
              {m}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ─── SplitEditor ─────────────────────────────────────────────────────────────

const SPLIT_PEOPLE_DATALIST_ID = "flow-split-people-datalist"

function SplitEditor({
  splits,
  billAmount,
  knownPeople,
  onPersonNamed,
  onChange,
}: {
  splits: BillSplit[]
  billAmount: number
  knownPeople: string[]
  onPersonNamed?: () => void
  onChange: (splits: BillSplit[]) => void
}) {
  function add() {
    onChange([...splits, { id: crypto.randomUUID(), name: "", type: "fixed", value: 0 }])
  }

  function update(id: string, patch: Partial<BillSplit>) {
    onChange(splits.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function remove(id: string) {
    onChange(splits.filter((s) => s.id !== id))
  }

  const yourShare = splitAmount(billAmount, splits)

  return (
    <div className="space-y-2">
      <datalist id={SPLIT_PEOPLE_DATALIST_ID}>
        {knownPeople.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {splits.map((split) => (
        <div key={split.id} className="flex items-center gap-2">
          <input
            value={split.name}
            onChange={(e) => update(split.id, { name: e.target.value })}
            onBlur={(e) => {
              const t = e.currentTarget.value.trim()
              if (t) {
                rememberSharedPerson(t)
                onPersonNamed?.()
              }
            }}
            list={SPLIT_PEOPLE_DATALIST_ID}
            placeholder="Person name"
            autoComplete="off"
            className="flex-1 text-xs border border-border px-2 py-1.5 bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <select
            value={split.type}
            onChange={(e) => update(split.id, { type: e.target.value as "fixed" | "percentage", value: 0 })}
            className="text-xs border border-border px-1.5 py-1.5 bg-background outline-none"
          >
            <option value="fixed">$</option>
            <option value="percentage">%</option>
          </select>
          <input
            type="number"
            min="0"
            value={split.type === "fixed" ? split.value / 100 : split.value}
            onChange={(e) => {
              const raw = parseFloat(e.target.value) || 0
              update(split.id, { value: split.type === "fixed" ? Math.round(raw * 100) : raw })
            }}
            className="w-20 text-xs border border-border px-2 py-1.5 bg-transparent outline-none text-right tabular-nums"
          />
          <Button variant="ghost" size="icon-xs" onClick={() => remove(split.id)}>
            <X className="size-3 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="xs" onClick={add} className="gap-1">
        <Plus className="size-3" /> Add person
      </Button>
      {billAmount > 0 && (
        <p className="text-xs text-muted-foreground">
          Your share:{" "}
          <span className="font-semibold text-foreground">{formatCurrency(yourShare)}</span>
          {splits.length > 0 && billAmount > 0 && (
            <span className="ml-1">({Math.round((yourShare / billAmount) * 100)}%)</span>
          )}
        </p>
      )}
    </div>
  )
}

// ─── BillForm ────────────────────────────────────────────────────────────────

function BillForm({
  initial,
  merchants,
  transactions,
  knownPeople,
  onPersonNamed,
  onSave,
  onCancel,
}: {
  initial?: Bill
  merchants: string[]
  transactions: ReturnType<typeof useTransactions>["transactions"]
  knownPeople: string[]
  onPersonNamed?: () => void
  onSave: (bill: Bill) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [merchant, setMerchant] = useState(initial?.merchant ?? "")
  const [splits, setSplits] = useState<BillSplit[]>(initial?.splits ?? [])
  const [showTransactionPicker, setShowTransactionPicker] = useState(false)
  const [estimatedAmountCents, setEstimatedAmountCents] = useState(
    initial?.estimatedAmountCents ?? 0
  )
  const [estimatedFrequency, setEstimatedFrequency] = useState<BillFrequency>(
    initial?.estimatedFrequency ?? "monthly"
  )

  const merchantKey = merchant.trim()

  const detected = useMemo(
    () => (merchantKey ? detectMerchantBill(transactions, merchantKey) : null),
    [merchantKey, transactions]
  )

  const flowInfo = useMemo(
    () =>
      merchantKey
        ? resolveBillFlow(transactions, {
            merchant: merchantKey,
            estimatedAmountCents: estimatedAmountCents > 0 ? estimatedAmountCents : undefined,
            estimatedFrequency,
          })
        : null,
    [merchantKey, transactions, estimatedAmountCents, estimatedFrequency]
  )

  function handleSelectMerchant(m: string) {
    setMerchant(m)
    setShowTransactionPicker(false)
    if (!name) setName(m)
    const det = detectMerchantBill(transactions, m)
    if (!det) {
      const hint = getMerchantAmountHint(transactions, m)
      if (hint) setEstimatedAmountCents(hint)
    }
  }

  function handleSave() {
    const merchantTrimmed = merchant.trim()
    if (!name.trim() || !merchantTrimmed || !flowInfo) return
    const det = detectMerchantBill(transactions, merchantTrimmed)
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      merchant: merchantTrimmed,
      splits,
      ...(det
        ? { estimatedAmountCents: undefined, estimatedFrequency: undefined }
        : {
            estimatedAmountCents: estimatedAmountCents > 0 ? estimatedAmountCents : undefined,
            estimatedFrequency: estimatedAmountCents > 0 ? estimatedFrequency : undefined,
          }),
    })
  }

  return (
    <Card className="rounded-none p-4 space-y-4 border-primary/40">
      {/* Name */}
      <div>
        <label className="text-xs text-muted-foreground">Bill name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rent, Electricity, Water"
          className="mt-1 w-full text-xs border border-border px-2 py-1.5 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Payee / merchant — type freely or pick from settled debits */}
      <div>
        <div className="flex items-center justify-between mb-1 gap-2">
          <label className="text-xs text-muted-foreground">Where does this money go?</label>
          <button
            type="button"
            onClick={() => setShowTransactionPicker((v) => !v)}
            className="text-xs text-primary hover:underline underline-offset-4 shrink-0"
          >
            {showTransactionPicker ? "Hide list" : "Choose from transactions"}
          </button>
        </div>
        <input
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Type a name (e.g. landlord, insurer, streaming service)"
          className="w-full text-xs border border-border px-2 py-1.5 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {showTransactionPicker && (
          <div className="mt-2 space-y-1.5">
            {merchants.length === 0 ? (
              <p className="text-xs text-muted-foreground border border-border px-2 py-2">
                No outgoing transactions loaded yet — enter a name above.
              </p>
            ) : (
              <MerchantPicker
                merchants={merchants}
                selected={merchant}
                onSelect={handleSelectMerchant}
              />
            )}
          </div>
        )}
      </div>

      {/* Auto-detected or manual estimate */}
      {merchant && (
        <div className="border border-border p-3 space-y-3">
          {detected ? (
            <>
              <p className="text-xs font-medium">Detected from your transaction history</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span>Frequency: <span className="text-foreground font-medium">{FREQ_LABELS[detected.frequency]}</span></span>
                <span>Avg amount: <span className="text-foreground font-medium">{formatCurrency(detected.avgAmount)}</span></span>
                <span>Occurrences: <span className="text-foreground font-medium">{detected.occurrences}</span></span>
                <span>Last: <span className="text-foreground font-medium">{formatDate(detected.lastCharged)}</span></span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                <span>
                  Not enough history to detect frequency automatically. Enter an estimated amount and how often it repeats.
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Estimated amount (per occurrence)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={estimatedAmountCents > 0 ? estimatedAmountCents / 100 : ""}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value)
                      setEstimatedAmountCents(Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) : 0)
                    }}
                    placeholder="0.00"
                    className="mt-1 w-full text-xs border border-border px-2 py-1.5 bg-transparent outline-none tabular-nums placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">How often</label>
                  <select
                    value={estimatedFrequency}
                    onChange={(e) => setEstimatedFrequency(e.target.value as BillFrequency)}
                    className="mt-1 w-full text-xs border border-border px-2 py-1.5 bg-background outline-none"
                  >
                    {(Object.keys(FREQ_LABELS) as BillFrequency[]).map((f) => (
                      <option key={f} value={f}>{FREQ_LABELS[f]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Splits */}
      {flowInfo && (
        <div>
          <label className="text-xs text-muted-foreground">
            Split with others{" "}
            <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <div className="mt-2">
            <SplitEditor
              splits={splits}
              billAmount={flowInfo.avgAmount}
              knownPeople={knownPeople}
              onPersonNamed={onPersonNamed}
              onChange={setSplits}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={!name.trim() || !merchant.trim() || !flowInfo}>
          {initial ? "Save changes" : "Add bill"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}

// ─── BillCard ────────────────────────────────────────────────────────────────

function BillCard({
  bill,
  flow,
  view,
  onEdit,
  onDelete,
  listIndex,
  listLength,
  onMoveBill,
}: {
  bill: Bill
  flow: ResolvedBillFlow | null
  view: ViewPeriod
  onEdit: () => void
  onDelete: () => void
  listIndex: number
  listLength: number
  onMoveBill: (dir: "up" | "down") => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (!flow) {
    return (
      <Card className="rounded-none p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium">{bill.name}</p>
          <p className="text-xs text-muted-foreground">{bill.merchant}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <AlertCircle className="size-3" /> Add an estimated amount and frequency to include this bill in totals
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {listLength > 1 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-foreground"
                aria-label="Move bill up"
                disabled={listIndex === 0}
                onClick={() => onMoveBill("up")}
              >
                <ChevronUp className="size-3.5" strokeWidth={2.25} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-foreground"
                aria-label="Move bill down"
                disabled={listIndex >= listLength - 1}
                onClick={() => onMoveBill("down")}
              >
                <ChevronDown className="size-3.5" strokeWidth={2.25} />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-xs" onClick={onEdit}><Pencil className="size-3" /></Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete}><X className="size-3 text-muted-foreground" /></Button>
        </div>
      </Card>
    )
  }

  const yourShare = splitAmount(flow.avgAmount, bill.splits)
  const yourSharePerView = toPeriod(yourShare, flow.frequency, view)
  const totalPerView = toPeriod(flow.avgAmount, flow.frequency, view)
  const daysUntil = differenceInDays(parseISO(flow.nextDue), new Date())
  const isOverdue = daysUntil < 0

  return (
    <Card className="rounded-none overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={() => setExpanded((v) => !v)} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{bill.name}</span>
            {flow.source === "manual" && (
              <Badge variant="outline" className="rounded-none text-xs px-1.5 py-0 h-4 border-amber-500/50 text-amber-700 dark:text-amber-400">
                Estimated
              </Badge>
            )}
            <Badge variant="secondary" className="rounded-none text-xs px-1.5 py-0 h-4">
              {FREQ_LABELS[flow.frequency]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{bill.merchant}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <div>
              <span className="text-xs text-muted-foreground">Total </span>
              <span className="text-xs font-semibold tabular-nums">{formatCurrency(totalPerView)}</span>
              <span className="text-xs text-muted-foreground">/{VIEW_LABELS[view].toLowerCase()}</span>
            </div>
            {bill.splits.length > 0 && (
              <>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <div>
                  <span className="text-xs text-muted-foreground">You pay </span>
                  <span className="text-xs font-semibold tabular-nums text-primary">{formatCurrency(yourSharePerView)}</span>
                  <span className="text-xs text-muted-foreground">/{VIEW_LABELS[view].toLowerCase()}</span>
                </div>
              </>
            )}
          </div>
        </button>

        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          {listLength > 1 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-foreground"
                aria-label="Move bill up"
                disabled={listIndex === 0}
                onClick={() => onMoveBill("up")}
              >
                <ChevronUp className="size-3.5" strokeWidth={2.25} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-foreground"
                aria-label="Move bill down"
                disabled={listIndex >= listLength - 1}
                onClick={() => onMoveBill("down")}
              >
                <ChevronDown className="size-3.5" strokeWidth={2.25} />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-xs" onClick={onEdit}><Pencil className="size-3" /></Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete}><X className="size-3 text-muted-foreground" /></Button>
        </div>
      </div>

      {/* Next due strip */}
      <div className={cn(
        "flex items-center gap-2 px-4 py-1.5 border-t border-border text-xs",
        isOverdue ? "text-destructive bg-destructive/5" : daysUntil <= 5 ? "text-amber-500 bg-amber-500/5" : "text-muted-foreground"
      )}>
        <Calendar className="size-3 shrink-0" />
        {isOverdue
          ? `Overdue · was due ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""} ago`
          : daysUntil === 0
          ? "Due today"
          : `Due ${formatDate(flow.nextDue)} · in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`}
        <span className="ml-auto text-muted-foreground">
          Last: {formatDistanceToNow(parseISO(flow.lastCharged), { addSuffix: true })}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {flow.source === "manual" ? (
              <>
                Your estimate · {formatCurrency(flow.avgAmount)}/{FREQ_LABELS[flow.frequency].toLowerCase()}
                {flow.occurrences > 0 && (
                  <> · {flow.occurrences} transaction{flow.occurrences !== 1 ? "s" : ""} on record</>
                )}
              </>
            ) : (
              <>
                Based on {flow.occurrences} payment{flow.occurrences !== 1 ? "s" : ""} ·
                avg {formatCurrency(flow.avgAmount)}/{FREQ_LABELS[flow.frequency].toLowerCase()}
              </>
            )}
          </p>
          {bill.splits.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Split breakdown ({formatCurrency(flow.avgAmount)} total):</p>
              {bill.splits.map((split) => {
                const amt = split.type === "fixed"
                  ? split.value
                  : Math.round((flow.avgAmount * split.value) / 100)
                return (
                  <div key={split.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{split.name || "Unnamed"}</span>
                    <span className="tabular-nums">
                      {formatCurrency(amt)}
                      {split.type === "percentage" && <span className="text-muted-foreground ml-1">({split.value}%)</span>}
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center justify-between text-xs font-medium border-t border-border pt-1">
                <span>You</span>
                <span className="tabular-nums text-primary">{formatCurrency(yourShare)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No split — you pay the full amount</p>
          )}
        </div>
      )}
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FlowPage() {
  // Extended history for yearly bill detection (400 days)
  const since = useMemo(() => subDays(new Date(), 400).toISOString(), [])
  const { transactions, isLoading, error, mutate } = useTransactions(since)

  const [bills, setBills] = useState<Bill[]>([])
  const [view, setView] = useState<ViewPeriod>("monthly")
  const [editingId, setEditingId] = useState<string | "new" | null>(null)
  const [peopleTick, setPeopleTick] = useState(0)

  // Income (for pay source — kept for context)
  const [fortnightlyIncome, setFortnightlyIncome] = useState(0)
  const [incomeSource, setIncomeSource] = useState<string | null>(null)
  const [showSourcePicker, setShowSourcePicker] = useState(false)

  useEffect(() => {
    const loaded = getBills()
    syncSharedPeopleFromBills(loaded)
    setBills(loaded)
    const income = getFortnightlyIncome()
    if (income) setFortnightlyIncome(income)
    const src = getIncomeSource()
    if (src) setIncomeSource(src)
  }, [])

  const knownPeople = useMemo(() => getSharedPeopleList(), [bills, peopleTick])

  function updateBills(next: Bill[]) {
    saveBills(next)
    syncSharedPeopleFromBills(next)
    setBills(next)
  }

  // All unique outgoing merchants (sorted alphabetically)
  const outgoingMerchants = useMemo(() => {
    const set = new Set<string>()
    for (const tx of transactions) {
      if (tx.attributes.amount.valueInBaseUnits < 0 && tx.attributes.status === "SETTLED") {
        set.add(tx.attributes.description.trim())
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [transactions])

  // Income sources for pay source picker
  const incomeSources = useMemo(() => {
    const map = new Map<string, { amount: number; settledAt: string }[]>()
    for (const tx of transactions) {
      if (tx.attributes.status !== "SETTLED" || tx.attributes.amount.valueInBaseUnits <= 0 || !tx.attributes.settledAt) continue
      const name = tx.attributes.description.trim()
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push({ amount: tx.attributes.amount.valueInBaseUnits, settledAt: tx.attributes.settledAt })
    }
    return [...map.entries()]
      .map(([name, txs]) => {
        const sorted = [...txs].sort((a, b) => new Date(b.settledAt).getTime() - new Date(a.settledAt).getTime())
        const last3 = sorted.slice(0, 3)
        return { name, count: txs.length, avg: Math.round(last3.reduce((s, t) => s + t.amount, 0) / last3.length) }
      })
      .sort((a, b) => b.avg - a.avg)
  }, [transactions])

  function selectIncomeSource(name: string) {
    const src = incomeSources.find((s) => s.name === name)
    if (!src) return
    saveIncomeSource(name)
    saveFortnightlyIncome(src.avg)
    setIncomeSource(name)
    setFortnightlyIncome(src.avg)
    setShowSourcePicker(false)
  }

  function moveBillInList(index: number, dir: "up" | "down") {
    const j = dir === "up" ? index - 1 : index + 1
    if (j < 0 || j >= bills.length) return
    const next = [...bills]
    ;[next[index], next[j]] = [next[j], next[index]]
    updateBills(next)
  }

  // Resolved flow per bill (detected or manual estimate)
  const billDetails = useMemo(
    () => bills.map((b) => ({ bill: b, flow: resolveBillFlow(transactions, b) })),
    [bills, transactions]
  )

  // Summary totals in selected view period
  const summary = useMemo(() => {
    let totalGross = 0
    let totalYours = 0
    for (const { bill, flow } of billDetails) {
      if (!flow) continue
      totalGross += toPeriod(flow.avgAmount, flow.frequency, view)
      totalYours += toPeriod(splitAmount(flow.avgAmount, bill.splits), flow.frequency, view)
    }
    return { totalGross, totalYours, reimbursed: totalGross - totalYours }
  }, [billDetails, view])

  const personOwedSummaries = useMemo(
    () => buildPersonOwedSummaries(billDetails, view),
    [billDetails, view, peopleTick]
  )

  if (isNotConfigured(error)) return <NoTokenState />

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Money Flow</h1>
        <Button variant="ghost" size="icon-xs" onClick={() => mutate()} disabled={isLoading}>
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Pay source */}
      <Card className="p-3 rounded-none">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium">
              {incomeSource ? incomeSource : "No pay source set"}
            </p>
            {fortnightlyIncome > 0 ? (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(fortnightlyIncome)}/fortnight ·{" "}
                ≈ {formatCurrency(toPeriod(fortnightlyIncome, "fortnightly", view))}/{VIEW_LABELS[view].toLowerCase()}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Select who pays you to track net savings</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {incomeSource && (
              <Button variant="ghost" size="xs" onClick={() => { clearIncome(); setIncomeSource(null); setFortnightlyIncome(0) }} className="text-muted-foreground">
                Clear
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowSourcePicker((v) => !v)} disabled={isLoading} className="gap-1.5">
              {incomeSource ? "Change" : "Set pay source"}
              <ChevronDown className={cn("size-3 transition-transform", showSourcePicker && "rotate-180")} />
            </Button>
          </div>
        </div>

        {showSourcePicker && (
          <div className="border-t border-border mt-3 pt-3 space-y-1">
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : incomeSources.map((src) => (
              <button
                key={src.name}
                onClick={() => selectIncomeSource(src.name)}
                className={cn(
                  "w-full flex items-center justify-between gap-4 px-3 py-2 text-left border transition-colors",
                  src.name === incomeSource ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {src.name === incomeSource && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
                  <div>
                    <p className="text-xs font-medium truncate">{src.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {src.count} payment{src.count !== 1 ? "s" : ""} · avg of last {Math.min(3, src.count)}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold tabular-nums shrink-0">{formatCurrency(src.avg)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Period toggle + summary */}
      {bills.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Total bills</p>
            <p className="text-sm font-semibold">
              {formatCurrency(summary.totalGross)}
              <span className="text-xs font-normal text-muted-foreground ml-1">/{VIEW_LABELS[view].toLowerCase()}</span>
            </p>
            {summary.reimbursed > 0 && (
              <p className="text-xs text-muted-foreground">
                Your share:{" "}
                <span className="font-medium text-primary">{formatCurrency(summary.totalYours)}</span>
                <span className="ml-1">· {formatCurrency(summary.reimbursed)} covered by others</span>
              </p>
            )}
            {fortnightlyIncome > 0 && (
              <p className="text-xs text-muted-foreground">
                {Math.round((summary.totalYours / toPeriod(fortnightlyIncome, "fortnightly", view)) * 100)}% of income
              </p>
            )}
          </div>
          <div className="flex border border-border shrink-0">
            {(Object.keys(VIEW_LABELS) as ViewPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setView(p)}
                className={cn(
                  "px-2.5 py-1 text-xs transition-colors border-r border-border last:border-r-0",
                  view === p ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >
                {VIEW_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Per-person share (what others owe you across splits) */}
      {personOwedSummaries.length > 0 && (
        <Card className="rounded-none p-4 space-y-3">
          <div>
            <p className="text-xs font-medium">Household — their share</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total others owe you from bill splits, scaled to{" "}
              <span className="text-foreground/90">per {VIEW_LABELS[view].toLowerCase()}</span>.
              Names are remembered in this browser for autocomplete.
            </p>
          </div>
          <ul className="space-y-2">
            {personOwedSummaries.map((p) => (
              <li key={p.key} className="border border-border px-3 py-2.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium">{p.displayName}</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(p.totalCents)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {p.lines.map((line) => (
                    <li key={`${p.key}-${line.billId}`} className="flex justify-between gap-2">
                      <span className="truncate">{line.billName}</span>
                      <span className="tabular-nums shrink-0">{formatCurrency(line.centsPerView)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Bills list */}
      <div className="space-y-2">
        {isLoading && bills.length === 0 ? (
          <p className="text-xs text-muted-foreground">Loading transactions...</p>
        ) : bills.length === 0 && editingId !== "new" ? (
          <Card className="rounded-none p-8 text-center space-y-2">
            <p className="text-xs font-medium">No bills added yet</p>
            <p className="text-xs text-muted-foreground">Add your recurring bills — rent, electricity, water, subscriptions.</p>
          </Card>
        ) : null}

        {billDetails.map(({ bill, flow }, index) =>
          editingId === bill.id ? (
            <BillForm
              key={bill.id}
              initial={bill}
              merchants={outgoingMerchants}
              transactions={transactions}
              knownPeople={knownPeople}
              onPersonNamed={() => setPeopleTick((t) => t + 1)}
              onSave={(updated) => {
                updateBills(bills.map((b) => (b.id === updated.id ? updated : b)))
                setEditingId(null)
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <BillCard
              key={bill.id}
              bill={bill}
              flow={flow}
              view={view}
              listIndex={index}
              listLength={billDetails.length}
              onMoveBill={(dir) => moveBillInList(index, dir)}
              onEdit={() => setEditingId(bill.id)}
              onDelete={() => updateBills(bills.filter((b) => b.id !== bill.id))}
            />
          )
        )}

        {editingId === "new" && (
          <BillForm
            merchants={outgoingMerchants}
            transactions={transactions}
            knownPeople={knownPeople}
            onPersonNamed={() => setPeopleTick((t) => t + 1)}
            onSave={(newBill) => {
              updateBills([...bills, newBill])
              setEditingId(null)
            }}
            onCancel={() => setEditingId(null)}
          />
        )}

        {editingId !== "new" && (
          <Button variant="outline" size="sm" onClick={() => setEditingId("new")} className="gap-1.5 w-full">
            <Plus className="size-3" /> Add bill
          </Button>
        )}
      </div>
    </div>
  )
}
