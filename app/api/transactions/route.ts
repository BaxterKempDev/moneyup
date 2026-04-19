import { NextRequest, NextResponse } from "next/server"
import { subDays } from "date-fns"
import { getTransactions, UpApiError } from "@/lib/up-client"

export async function GET(request: NextRequest) {
  const token = request.headers.get("x-up-token") ?? process.env.UP_BANK_TOKEN
  if (!token) {
    return NextResponse.json({ error: "UP_BANK_TOKEN not configured" }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const since = searchParams.get("since") ?? subDays(new Date(), 90).toISOString()
  const until = searchParams.get("until") ?? undefined

  try {
    const transactions = await getTransactions(token, {
      since,
      until,
      status: "SETTLED",
    })
    return NextResponse.json({ data: transactions })
  } catch (err) {
    if (err instanceof UpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 })
  }
}
