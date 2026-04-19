"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ArrowLeftRight,
  Receipt,
  Settings,
  Workflow,
  Menu,
  X,
} from "lucide-react"
import { Dialog } from "radix-ui"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/flow", label: "Money Flow", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
]

function SidebarNav({
  pathname,
  onNavigate,
  className,
}: {
  pathname: string
  onNavigate?: () => void
  className?: string
}) {
  return (
    <nav className={cn("flex-1 space-y-0.5 p-1.5", className)}>
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-30 flex h-11 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 pt-[env(safe-area-inset-top,0px)] md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-sidebar-foreground"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-4" />
        </Button>
        <span className="text-xs font-semibold tracking-tight text-sidebar-foreground">
          MoneyUp
        </span>
      </header>

      <aside className="fixed left-0 top-0 z-10 hidden h-screen w-48 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="border-b border-sidebar-border px-4 py-3">
          <span className="text-xs font-semibold tracking-tight text-sidebar-foreground">
            MoneyUp
          </span>
        </div>
        <SidebarNav pathname={pathname} />
      </aside>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-40 bg-black/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <Dialog.Content
            aria-describedby={undefined}
            className={cn(
              "fixed left-0 top-0 z-50 flex h-full w-48 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-lg",
              "pt-[env(safe-area-inset-top,0px)] outline-none",
              "data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-left-2 data-[state=open]:slide-in-from-left-2"
            )}
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
              <span className="text-xs font-semibold tracking-tight text-sidebar-foreground">
                MoneyUp
              </span>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-sidebar-foreground"
                  aria-label="Close menu"
                >
                  <X className="size-3.5" />
                </Button>
              </Dialog.Close>
            </div>
            <SidebarNav
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
