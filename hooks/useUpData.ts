"use client"

import useSWR from "swr"
import type { UpAccount, UpTransaction, UpCategory } from "@/lib/up-client"
import { getToken } from "@/lib/token"

interface ApiError {
  status: number
  message: string
}

const fetcher = async (url: string) => {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers["x-up-token"] = token

  const res = await fetch(url, { headers })
  const data = await res.json()
  if (!res.ok) {
    const err: ApiError = { status: res.status, message: data.error ?? "Unknown error" }
    throw err
  }
  return data
}

const swrConfig = {
  revalidateOnMount: true,
  revalidateOnFocus: false,
  refreshInterval: 0,
  dedupingInterval: 60_000,
}

export function useAccounts() {
  const { data, error, isLoading, mutate } = useSWR<{ data: UpAccount[] }>(
    "/api/accounts",
    fetcher,
    swrConfig
  )
  return { accounts: data?.data ?? [], error, isLoading, mutate }
}

export function useTransactions(since?: string) {
  const url = since ? `/api/transactions?since=${encodeURIComponent(since)}` : "/api/transactions"
  const { data, error, isLoading, mutate } = useSWR<{ data: UpTransaction[] }>(
    url,
    fetcher,
    swrConfig
  )
  return { transactions: data?.data ?? [], error, isLoading, mutate }
}

export function useCategories() {
  const { data, error, isLoading } = useSWR<{ data: UpCategory[] }>(
    "/api/categories",
    fetcher,
    swrConfig
  )
  return { categories: data?.data ?? [], error, isLoading }
}

export function isNotConfigured(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as ApiError).status === 401
  )
}
