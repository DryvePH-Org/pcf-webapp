import type { SupabaseClient } from "@supabase/supabase-js";

import { TelegramManager, type TelegramPerson, type TelegramStatus } from "@/components/admin/telegram-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { botName, telegramConfigured, webhookInfo } from "@/lib/telegram/api";
import type { WorkflowDatabase } from "@/lib/workflow";

export default async function AdminTelegramPage() {
  await requireUser("/admin/telegram");
  const supabase = await createClient();
  const db = supabase as unknown as SupabaseClient<WorkflowDatabase>;
  const [profiles, links] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").eq("is_active", true).order("full_name"),
    db.from("telegram_links").select("profile_id, username, linked_at"),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  if (links.error) throw new Error(links.error.message);
  const linked = new Map((links.data ?? []).map((row) => [row.profile_id, row]));
  const people: TelegramPerson[] = profiles.data.map((profile) => ({
    id: profile.id,
    name: profile.full_name,
    role: profile.role,
    linked: linked.has(profile.id),
    username: linked.get(profile.id)?.username ?? null,
    linkedAt: linked.get(profile.id)?.linked_at ?? null,
  }));

  const configured = telegramConfigured();
  const status: TelegramStatus = { configured, bot: null, webhook: null, pending: 0, error: null, expected: null };
  if (configured) {
    status.bot = process.env.TELEGRAM_BOT_USERNAME || (await botName());
    status.expected = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/telegram/webhook`;
    try {
      const info = await webhookInfo();
      status.webhook = info.url || null;
      status.pending = info.pending_update_count;
      status.error = info.last_error_message ?? null;
    } catch {
      status.error = "Could not ask Telegram for its status.";
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Telegram" description="Let requesters ask for a budget by voice message, with a summary to check before it goes in." />
      <TelegramManager people={people} status={status} />
    </div>
  );
}
