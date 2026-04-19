const BASE_URL = "https://api.up.com.au/api/v1"

export class UpApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function upFetch(path: string, token: string): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new UpApiError(res.status, `UP API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export interface UpMoney {
  currencyCode: string
  value: string
  valueInBaseUnits: number
}

export interface UpAccount {
  id: string
  type: "accounts"
  attributes: {
    displayName: string
    accountType: "SAVER" | "TRANSACTIONAL" | "HOME_LOAN"
    balance: UpMoney
    createdAt: string
  }
}

export interface UpTransaction {
  id: string
  type: "transactions"
  attributes: {
    description: string
    rawText: string | null
    message: string | null
    status: "HELD" | "SETTLED"
    amount: UpMoney
    settledAt: string | null
    createdAt: string
    isCategorizable: boolean
    cardPurchaseMethod?: {
      method: string
      cardNumberSuffix?: string
    } | null
  }
  relationships: {
    category: { data: { id: string; type: "categories" } | null }
    parentCategory: { data: { id: string; type: "categories" } | null }
    account: { data: { id: string; type: "accounts" } }
  }
}

export interface UpCategory {
  id: string
  type: "categories"
  attributes: { name: string }
  relationships: {
    parent: { data: { id: string; type: "categories" } | null }
    children?: { data: Array<{ id: string; type: "categories" }> }
  }
}

export async function getAccounts(token: string): Promise<UpAccount[]> {
  const data = (await upFetch("/accounts", token)) as { data: UpAccount[] }
  return data.data
}

export async function getTransactions(
  token: string,
  params: { since?: string; until?: string; status?: string } = {}
): Promise<UpTransaction[]> {
  const qs = new URLSearchParams({ "page[size]": "100" })
  if (params.since) qs.set("filter[since]", params.since)
  if (params.until) qs.set("filter[until]", params.until)
  if (params.status) qs.set("filter[status]", params.status)

  const all: UpTransaction[] = []
  let url: string | null = `/transactions?${qs}`

  while (url) {
    const data = (await upFetch(url, token)) as {
      data: UpTransaction[]
      links: { next: string | null }
    }
    all.push(...data.data)
    url = data.links?.next ?? null
    if (all.length >= 1000) break
  }

  return all
}

export async function getCategories(token: string): Promise<UpCategory[]> {
  const data = (await upFetch("/categories", token)) as { data: UpCategory[] }
  return data.data
}

export async function ping(token: string): Promise<{ id: string }> {
  const data = (await upFetch("/util/ping", token)) as { meta: { id: string } }
  return { id: data.meta.id }
}
