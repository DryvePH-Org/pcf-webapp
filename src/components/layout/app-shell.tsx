"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";

import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { mobileNavFor, navGroupsFor } from "@/lib/navigation";
import type { Role } from "@/lib/permissions";

export function AppShell({
  user,
  children,
}: {
  user: { full_name: string; role: Role };
  children: React.ReactNode;
}) {
  const groups = navGroupsFor(user.role);
  const { primary, overflow } = mobileNavFor(user.role);

  return (
    <div className="min-h-svh bg-background">
      <SidebarNav groups={groups} user={user} />

      <div className="flex min-h-svh flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="size-4" />
            </span>
            Petty Cash
          </Link>
          <UserMenu user={user} compact />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">
          {children}
        </main>
      </div>

      <BottomTabBar primary={primary} overflow={overflow} />
    </div>
  );
}
