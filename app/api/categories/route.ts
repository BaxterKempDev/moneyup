import { NextRequest, NextResponse } from "next/server"
import { getCategories, UpApiError } from "@/lib/up-client"

export async function GET(request: NextRequest) {
  const token = request.headers.get("x-up-token") ?? process.env.UP_BANK_TOKEN
  if (!token) {
    return NextResponse.json({ error: "UP_BANK_TOKEN not configured" }, { status: 401 })
  }
  try {
    const categories = await getCategories(token)
    return NextResponse.json({ data: categories })
  } catch (err) {
    if (err instanceof UpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}
