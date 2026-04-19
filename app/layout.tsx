import type { Metadata } from "next"
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/components/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MoneyUp",
  description: "Personal finance dashboard powered by UP Bank",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("dark",
        "h-full antialiased",
        geistSans.variable,
        geistMono.variable,
        jetbrainsMono.variable,
        "font-mono"
      )}
    >
      <body className="h-full bg-background text-foreground">
        <TooltipProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="ml-0 flex-1 overflow-auto pt-11 md:ml-48 md:pt-0">
              {children}
            </main>
          </div>
        </TooltipProvider>
      </body>
    </html>
  )
}
