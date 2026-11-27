"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavPills, NavDot } from "@/components/layout/nav-pills";
import type { NavIndicators } from "@/lib/nav-indicators";
import { isNavActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

// One dot for everything under "More": amber if any of it is work, blue if it is only news.
function moreIndicator(items: NavItem[], badges: NavIndicators) {
  const action = items.reduce((sum, item) => sum + (badges[item.href]?.action ?? 0), 0);
  const seen = items.reduce((sum, item) => sum + (badges[item.href]?.seen ?? 0), 0);
  return action || seen ? { action, seen } : undefined;
}

export function BottomTabBar({
  primary,
  overflow,
  badges = {},
}: {
  primary: NavItem[];
  overflow: NavItem[];
  badges?: NavIndicators;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const columns = primary.length + (overflow.length > 0 ? 1 : 0);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
    >
      <ul
        className={cn(
          "grid h-16",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-3",
          columns === 4 && "grid-cols-4",
          columns === 5 && "grid-cols-5",
        )}
      >
        {primary.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon
                  className={cn("size-5", active && "stroke-[2.25]")}
                />
                <span className="relative max-w-full truncate px-1">
                  {item.shortLabel ?? item.label}
                  <NavDot indicator={badges[item.href]} className="absolute -top-5 -right-1" />
                </span>
              </Link>
            </li>
          );
        })}

        {overflow.length > 0 ? (
          <li>
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger
                render={
                  <button
                    type="button"
                    className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
                  />
                }
              >
                <span className="relative">
                  <MoreHorizontal className="size-5" />
                  <NavDot indicator={moreIndicator(overflow, badges)} className="absolute -top-1 -right-1" />
                </span>
                More
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[80dvh] overflow-y-auto overscroll-contain rounded-t-2xl"
              >
                <SheetHeader>
                  <SheetTitle>More</SheetTitle>
                  <SheetDescription className="sr-only">
                    Additional navigation links
                  </SheetDescription>
                </SheetHeader>
                <div className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                  {overflow.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border border-border p-3 text-sm font-medium",
                        isNavActive(pathname, item.href)
                          ? "bg-muted"
                          : "bg-card",
                      )}
                    >
                      <item.icon className="size-4 text-muted-foreground" />
                      {item.label}
                      <NavPills indicator={badges[item.href]} />
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
