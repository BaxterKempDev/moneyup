import Link from "next/link"
import { AlertCircle } from "lucide-react"

export function NoTokenState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center min-h-[300px]">
      <AlertCircle className="size-6 text-muted-foreground" />
      <div>
        <p className="text-xs font-medium">UP Bank not connected</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add your personal access token to get started
        </p>
      </div>
      <Link
        href="/settings"
        className="text-xs text-primary underline-offset-4 hover:underline"
      >
        Go to Settings →
      </Link>
    </div>
  )
}
