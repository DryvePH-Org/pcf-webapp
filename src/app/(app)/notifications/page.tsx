import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell } from "lucide-react";

import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { NotificationPreferencesForm } from "@/components/notifications/preferences-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { WorkflowDatabase } from "@/lib/workflow";

const PAGE_SIZE = 30;
const DOT = { info: "bg-sky-500", action: "bg-amber-500", alert: "bg-red-600", success: "bg-emerald-600" } as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("/notifications");
  const params = await searchParams;
  const parsed = Number(params.page);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 1;
  const db = (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const [list, unread, prefs] = await Promise.all([
    db.from("notifications").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    db.from("notification_preferences").select("email_actions, email_digest").eq("user_id", user.id).maybeSingle(),
  ]);
  if (list.error) throw new Error(list.error.message);
  const items = list.data ?? [];
  const total = list.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Everything that needs you or changed on your work. Opening one marks it as read."
        actions={(unread.count ?? 0) > 0 ? <MarkAllReadButton /> : undefined}
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing yet" description="You will see updates about your requests, vouchers and liquidations here." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.link_path ?? "/notifications"}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", item.read_at ? "bg-muted" : DOT[item.tone])} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", item.read_at ? "text-muted-foreground" : "font-semibold")}>{item.title}</span>
                  {item.body ? <span className="block text-sm text-muted-foreground">{item.body}</span> : null}
                  <span className="block text-xs text-muted-foreground">{formatDateTime(item.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link className="underline underline-offset-4" href={`/notifications?page=${page - 1}`}>Newer</Link> : <span />}
          <span className="text-muted-foreground">Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
          {page * PAGE_SIZE < total ? <Link className="underline underline-offset-4" href={`/notifications?page=${page + 1}`}>Older</Link> : <span />}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Choose which emails you get. In-app notifications are always on.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm
            initial={{ emailActions: prefs.data?.email_actions ?? true, emailDigest: prefs.data?.email_digest ?? true }}
            emailAvailable={process.env.NOTIFICATIONS_ENABLED === "true"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
