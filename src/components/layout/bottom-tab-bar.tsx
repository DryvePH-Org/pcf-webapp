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
import { isNavActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function BottomTabBar({
  primary,
  overflow,
}: {
  primary: NavItem[];
  overflow: NavItem[];
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const columns = primary.length + (overflow.length > 0 ? 1 : 0);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
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
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon
                  className={cn("size-5", active && "stroke-[2.25]")}
                />
                <span className="max-w-full truncate px-1">
                  {item.shortLabel ?? item.label}
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
                    className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
                  />
                }
              >
                <MoreHorizontal className="size-5" />
                More
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[80svh] rounded-t-2xl"
              >
                <SheetHeader>
                  <SheetTitle>More</SheetTitle>
                  <SheetDescription className="sr-only">
                    Additional navigation links
                  </SheetDescription>
                </SheetHeader>
                <div className="grid grid-cols-2 gap-2 overflow-y-auto px-4 pb-8">
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
