"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, type ActionResult } from "@/lib/action-result";
import { safeDbMessage } from "@/lib/db-error";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRecord, WorkflowDatabase } from "@/lib/workflow";

async function db() {
  return (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
}

export type NotificationFeed = { unread: number; items: NotificationRecord[] };

// The latest notifications and the unread count for the signed-in person (own rows only, by RLS).
export async function listNotifications(limit = 8): Promise<NotificationFeed | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const client = await db();
  const [items, unread] = await Promise.all([
    client.from("notifications").select("*").order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 30)),
    client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (items.error || unread.error) return null;
  return { unread: unread.count ?? 0, items: items.data ?? [] };
}

const idsSchema = z.array(z.uuid()).min(1).max(50);

export async function markNotificationsRead(ids: string[]): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in first.");
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return actionError("Nothing to mark.");
  const { error } = await (await db()).rpc("mark_notifications_read", { p_ids: parsed.data });
  if (error) return actionError(safeDbMessage(error));
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in first.");
  const { error } = await (await db()).rpc("mark_all_notifications_read");
  if (error) return actionError(safeDbMessage(error));
  revalidatePath("/notifications");
  return { ok: true };
}

const preferencesSchema = z.object({ emailActions: z.boolean(), emailDigest: z.boolean() });

export async function saveNotificationPreferences(input: z.input<typeof preferencesSchema>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in first.");
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return actionError("Choose on or off.");
  const { error } = await (await db()).rpc("set_notification_preferences", {
    p_email_actions: parsed.data.emailActions,
    p_email_digest: parsed.data.emailDigest,
  });
  if (error) return actionError(safeDbMessage(error));
  revalidatePath("/notifications");
  return { ok: true };
}
