"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";

import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import {
  isNavActive,
  type NavGroup,
} from "@/lib/navigation";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function SidebarNav({
  groups,
  user,
}: {
  groups: NavGroup[];
  user: { full_name: string; role: Role };
}) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex print:hidden">
      <Link
        href="/dashboard"
        className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="size-4.5" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Petty Cash</span>
          <span className="text-xs text-muted-foreground">Fund ledger</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border px-3 py-1.5">
        <span className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Notifications</span>
        <NotificationBell />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isNavActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-primary"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                      )}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
