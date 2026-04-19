/**
 * Single source of truth for all MoneyUp localStorage keys and backup/restore.
 */

export const LS = {
  TOKEN: "moneyup_up_token",
  BILLS: "moneyup_bills",
  BILLS_DETECTED_ORDER_UPCOMING: "moneyup_bills_detected_order_upcoming",
  BILLS_DETECTED_ORDER_PAST: "moneyup_bills_detected_order_past",
  SHARED_PEOPLE: "moneyup_shared_people",
  INCOME: "moneyup_flow_income",
  INCOME_SOURCE: "moneyup_flow_income_source",
} as const

export type MoneyupStorageKey = (typeof LS)[keyof typeof LS]

export const MONEYUP_STORAGE_KEYS: readonly MoneyupStorageKey[] = [
  LS.TOKEN,
  LS.BILLS,
  LS.BILLS_DETECTED_ORDER_UPCOMING,
  LS.BILLS_DETECTED_ORDER_PAST,
  LS.SHARED_PEOPLE,
  LS.INCOME,
  LS.INCOME_SOURCE,
]

const KEY_SET = new Set<string>(MONEYUP_STORAGE_KEYS)

function isWhitelistedKey(k: string): k is MoneyupStorageKey {
  return KEY_SET.has(k)
}

export interface MoneyupBackupV1 {
  v: 1
  app: "moneyup"
  exportedAt: string
  /** Only keys that had a value at export time */
  keys: Partial<Record<MoneyupStorageKey, string>>
}

export function collectMoneyupLocalStorage(): Partial<Record<MoneyupStorageKey, string>> {
  if (typeof window === "undefined") return {}
  const out: Partial<Record<MoneyupStorageKey, string>> = {}
  for (const key of MONEYUP_STORAGE_KEYS) {
    const v = localStorage.getItem(key)
    if (v !== null) out[key] = v
  }
  return out
}

export function createMoneyupBackupJson(): string {
  const payload: MoneyupBackupV1 = {
    v: 1,
    app: "moneyup",
    exportedAt: new Date().toISOString(),
    keys: collectMoneyupLocalStorage(),
  }
  return JSON.stringify(payload, null, 2)
}

export type ImportMode = "merge" | "replace"

export interface ImportResult {
  ok: true
  appliedKeys: number
  mode: ImportMode
}

export type ParseBackupResult =
  | { ok: true; backup: MoneyupBackupV1 }
  | { ok: false; message: string }

export function parseMoneyupBackupJson(text: string): ParseBackupResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { ok: false, message: "Invalid JSON" }
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, message: "Backup must be a JSON object" }
  }
  const o = parsed as Record<string, unknown>
  if (o.v !== 1) {
    return { ok: false, message: "Unsupported backup version" }
  }
  if (o.app !== "moneyup") {
    return { ok: false, message: "Not a MoneyUp backup file" }
  }
  if (typeof o.keys !== "object" || o.keys === null || Array.isArray(o.keys)) {
    return { ok: false, message: "Invalid backup: missing keys object" }
  }
  const keys: Partial<Record<MoneyupStorageKey, string>> = {}
  for (const [k, v] of Object.entries(o.keys as Record<string, unknown>)) {
    if (!isWhitelistedKey(k)) continue
    if (typeof v !== "string") {
      return { ok: false, message: `Invalid value for key ${k}` }
    }
    keys[k] = v
  }
  return {
    ok: true,
    backup: {
      v: 1,
      app: "moneyup",
      exportedAt: typeof o.exportedAt === "string" ? o.exportedAt : "",
      keys,
    },
  }
}

export function applyMoneyupBackup(
  backup: MoneyupBackupV1,
  mode: ImportMode
): ImportResult {
  if (typeof window === "undefined") {
    return { ok: true, appliedKeys: 0, mode }
  }
  if (mode === "replace") {
    for (const key of MONEYUP_STORAGE_KEYS) {
      localStorage.removeItem(key)
    }
  }
  let applied = 0
  for (const [k, v] of Object.entries(backup.keys)) {
    if (!isWhitelistedKey(k)) continue
    if (typeof v !== "string") continue
    localStorage.setItem(k, v)
    applied++
  }
  return { ok: true, appliedKeys: applied, mode }
}

export function downloadMoneyupBackup(filename?: string): void {
  const json = createMoneyupBackupJson()
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename ?? `moneyup-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
