"use client"

import { useState, useEffect, useRef } from "react"
import { useSWRConfig } from "swr"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, RefreshCw, Eye, EyeOff, ExternalLink, Trash2, Download, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { getToken, saveToken, clearToken } from "@/lib/token"
import {
  downloadMoneyupBackup,
  parseMoneyupBackupJson,
  applyMoneyupBackup,
  type ImportMode,
} from "@/lib/moneyup-storage"

type PingStatus = "idle" | "loading" | "ok" | "error"

export default function SettingsPage() {
  const { mutate } = useSWRConfig()
  const [tokenInput, setTokenInput] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [hasSavedToken, setHasSavedToken] = useState(false)
  const [pingStatus, setPingStatus] = useState<PingStatus>("idle")
  const [pingError, setPingError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>("merge")
  const [backupMsg, setBackupMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = getToken()
    setHasSavedToken(!!saved)
    if (saved) setTokenInput(saved)
  }, [])

  async function handleSave() {
    if (!tokenInput.trim()) return
    saveToken(tokenInput)
    setHasSavedToken(true)
    setSaveMsg("Token saved")
    setTimeout(() => setSaveMsg(null), 2000)
    // Revalidate all cached data with the new token
    await mutate(() => true, undefined, { revalidate: true })
  }

  function handleClear() {
    clearToken()
    setTokenInput("")
    setHasSavedToken(false)
    setPingStatus("idle")
    mutate(() => true, undefined, { revalidate: false })
  }

  function handleExport() {
    setBackupMsg(null)
    downloadMoneyupBackup()
    setBackupMsg({ type: "ok", text: "Download started." })
    setTimeout(() => setBackupMsg(null), 3000)
  }

  function handleImportPick() {
    setBackupMsg(null)
    importInputRef.current?.click()
  }

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      const parsed = parseMoneyupBackupJson(text)
      if (!parsed.ok) {
        setBackupMsg({ type: "error", text: parsed.message })
        event.target.value = ""
        return
      }
      if (importMode === "replace") {
        const ok = window.confirm(
          "Replace all MoneyUp data in this browser with the backup? This cannot be undone."
        )
        if (!ok) {
          event.target.value = ""
          return
        }
      }
      const result = applyMoneyupBackup(parsed.backup, importMode)
      setBackupMsg({
        type: "ok",
        text: `Restored ${result.appliedKeys} setting group(s).`,
      })
      void mutate(() => true, undefined, { revalidate: true })
      const t = getToken()
      setHasSavedToken(!!t)
      setTokenInput(t ?? "")
      event.target.value = ""
    }
    reader.onerror = () => {
      setBackupMsg({ type: "error", text: "Could not read file" })
      event.target.value = ""
    }
    reader.readAsText(file)
  }

  async function testConnection() {
    setPingStatus("loading")
    setPingError(null)
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers["x-up-token"] = token

    try {
      const res = await fetch("/api/ping", { headers })
      const data = await res.json()
      if (res.ok && data.configured) {
        setPingStatus("ok")
      } else {
        setPingStatus("error")
        setPingError(data.error ?? "Connection failed")
      }
    } catch {
      setPingStatus("error")
      setPingError("Network error")
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <h1 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Settings
      </h1>

      {/* Token entry */}
      <Card className="p-4 rounded-none space-y-3">
        <div>
          <p className="text-xs font-medium">UP Bank personal access token</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stored only in your browser&apos;s local storage — never sent to any server except UP Bank.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 flex items-center border border-border px-2 py-1.5 gap-2">
            <input
              type={showToken ? "text" : "password"}
              placeholder="up:yeah:..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
          <Button size="sm" onClick={handleSave} disabled={!tokenInput.trim()}>
            Save
          </Button>
          {hasSavedToken && (
            <Button variant="ghost" size="icon-sm" onClick={handleClear} title="Clear token">
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>

        {saveMsg && (
          <p className="text-xs text-green-600 dark:text-green-400">{saveMsg}</p>
        )}

        {hasSavedToken && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={pingStatus === "loading"}
              className="gap-1.5"
            >
              <RefreshCw className={cn("size-3", pingStatus === "loading" && "animate-spin")} />
              Test connection
            </Button>
            {pingStatus === "ok" && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="size-3.5" /> Connected
              </span>
            )}
            {pingStatus === "error" && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <XCircle className="size-3.5" /> {pingError}
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Backup & restore */}
      <Card className="p-4 rounded-none space-y-3">
        <div>
          <p className="text-xs font-medium">Backup &amp; restore</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Export everything stored in this browser (token, bills, flow settings) as a JSON file.
            Import it on another device or browser to continue with the same data. Treat exports like
            a password — anyone with the file can use your UP API access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0">Import mode</label>
          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as ImportMode)}
            className="text-xs border border-border px-2 py-1.5 bg-background max-w-[min(100%,20rem)]"
          >
            <option value="merge">Merge — only overwrite keys present in the file</option>
            <option value="replace">Replace — clear all MoneyUp data here, then import</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="size-3.5" />
            Export JSON
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleImportPick}>
            <Upload className="size-3.5" />
            Import JSON
          </Button>
        </div>

        {backupMsg && (
          <p
            className={cn(
              "text-xs",
              backupMsg.type === "ok"
                ? "text-green-600 dark:text-green-400"
                : "text-destructive"
            )}
          >
            {backupMsg.text}
          </p>
        )}
      </Card>

      {/* How to get the token */}
      <Card className="p-4 rounded-none space-y-3">
        <p className="text-xs font-medium">How to get your token</p>
        <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
          <li>Open the <span className="font-medium text-foreground">UP Bank app</span> on your phone</li>
          <li>Go to <span className="font-medium text-foreground">Profile → Developer → Personal Access Token</span></li>
          <li>Copy the token — it starts with <code className="bg-muted px-1 py-0.5">up:yeah:</code></li>
          <li>Paste it in the field above and hit Save</li>
        </ol>
        <a
          href="https://developer.up.com.au"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-4"
        >
          UP Bank Developer Portal <ExternalLink className="size-3" />
        </a>
      </Card>

      {/* About */}
      <Card className="p-4 rounded-none">
        <p className="text-xs font-medium mb-1">Privacy</p>
        <p className="text-xs text-muted-foreground">
          Your data lives in <code className="bg-muted px-1 py-0.5">localStorage</code> in this
          browser only (token, bills, and flow settings). It is not stored on this app&apos;s server.
          Use Backup &amp; restore above to move data to another browser.
        </p>
      </Card>
    </div>
  )
}
