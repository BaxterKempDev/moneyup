import { NextRequest, NextResponse } from "next/server"
import { ping, UpApiError } from "@/lib/up-client"

export async function GET(request: NextRequest) {
  const token = request.headers.get("x-up-token") ?? process.env.UP_BANK_TOKEN
  if (!token) {
    return NextResponse.json({ error: "UP_BANK_TOKEN not configured", configured: false }, { status: 401 })
  }
  try {
    const result = await ping(token)
    return NextResponse.json({ id: result.id, configured: true })
  } catch (err) {
    if (err instanceof UpApiError) {
      return NextResponse.json({ error: err.message, configured: false }, { status: err.status })
    }
    return NextResponse.json({ error: "Failed to reach UP Bank API", configured: false }, { status: 500 })
  }
}
