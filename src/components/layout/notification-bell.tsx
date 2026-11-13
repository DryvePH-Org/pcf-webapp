"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { listNotifications, markAllNotificationsRead, markNotificationsRead, type NotificationFeed } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

const DOT = {
  info: "bg-sky-500",
  action: "bg-amber-500",
  alert: "bg-red-600",
  success: "bg-emerald-600",
} as const;

const REFRESH_MS = 60_000;

export function NotificationBell({ className }: { className?: string }) {
  const [feed, setFeed] = useState<NotificationFeed | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await listNotifications(8);
      if (next) setFeed(next);
    } catch {
      // A dropped connection just keeps the last list.
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = () =>
      listNotifications(8)
        .then((next) => {
          if (active && next) setFeed(next);
        })
        .catch(() => undefined);
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, []);

  const unread = feed?.unread ?? 0;

  return (
    <DropdownMenu onOpenChange={(open) => open && void refresh()}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative size-10", className)}
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          />
        }
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-5 font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              onClick={async () => {
                await markAllNotificationsRead();
                void refresh();
              }}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-96 overflow-y-auto">
          {feed === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : feed.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">You are all caught up.</p>
          ) : (
            feed.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className="items-start gap-2.5 rounded-none px-3 py-2.5"
                render={<Link href={item.link_path ?? "/notifications"} />}
                onClick={() => {
                  if (!item.read_at) void markNotificationsRead([item.id]).then(refresh);
                }}
              >
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", item.read_at ? "bg-muted" : DOT[item.tone])} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", item.read_at ? "text-muted-foreground" : "font-semibold")}>
                    {item.title}
                  </span>
                  {item.body ? <span className="line-clamp-2 block text-xs text-muted-foreground">{item.body}</span> : null}
                  <span className="mt-0.5 block text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem className="justify-center rounded-none py-2.5 text-sm font-medium" render={<Link href="/notifications" />}>
          See all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
