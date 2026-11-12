import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { sendEmail } from "@/lib/email";
import type { Role } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDatabase } from "@/lib/workflow";

import { renderEmail, type EmailContent } from "./layout";

export type Recipient = {
  id: string | null;
  email: string;
  full_name: string;
};

export type NotificationEvent =
  | "liquidation.submitted"
  | "liquidation.reviewed"
  | "liquidation.settled"
  | "liquidation.reimbursement_approved"
  | "liquidation.flagged"
  | "liquidation.needs_approver"
  | "liquidation.due"
  | "voucher.released_to_requester"
  | "audit.self_approval"
  | "fund.approver_changed"
  | "budget.submitted"
  | "budget.reviewed"
  | "budget.cancelled"
  | "budget.voucher_created"
  | "voucher.submitted"
  | "voucher.pre_approved"
  | "voucher.returned"
  | "voucher.released"
  | "voucher.approved"
  | "voucher.flagged"
  | "voucher.voided"
  | "replenishment.submitted"
  | "replenishment.approved"
  | "replenishment.rejected"
  | "replenishment.closed"
  | "fund.low_balance"
  | "fund.assignment_changed"
  | "user.welcome"
  | "user.role_changed"
  | "user.access_changed"
  | "digest.daily";

type RecipientOptions = { include?: (string | null | undefined)[]; exclude?: string[] };

const SPACING_MS = 600;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function recipientsByRole(
  roles: Role[],
  options: RecipientOptions = {},
): Promise<Recipient[]> {
  const { data, error } = await createAdminClient().rpc("notification_recipients", {
    p_roles: roles,
    p_include: (options.include ?? []).filter((id): id is string => Boolean(id)),
    p_exclude: options.exclude ?? [],
  });
  if (error) throw error;
  return data.map((row) => ({ id: row.id, email: row.email, full_name: row.full_name }));
}

export async function recipientById(userId: string): Promise<Recipient | null> {
  const admin = createAdminClient();
  const [{ data: authData }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  const email = authData.user?.email;
  if (!email) return null;
  return { id: userId, email, full_name: profile?.full_name ?? email };
}

function dedupe(recipients: Recipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Emails go out only for things that need someone to act (or that someone must
// know about). Everything else is in-app only, so a team of 20 to 30 stays well
// inside the provider's daily limit.
const ACTION_EMAIL_EVENTS = new Set<NotificationEvent>([
  "budget.submitted",
  "budget.reviewed",
  "voucher.submitted",
  "voucher.pre_approved",
  "voucher.returned",
  "voucher.flagged",
  "voucher.released_to_requester",
  "liquidation.submitted",
  "liquidation.flagged",
  "liquidation.needs_approver",
  "liquidation.due",
  "replenishment.submitted",
  "replenishment.approved",
  "replenishment.rejected",
  "fund.low_balance",
  "user.welcome",
  "user.role_changed",
  "user.access_changed",
  "digest.daily",
]);
// Account emails are not optional.
const ALWAYS_EMAIL = new Set<NotificationEvent>(["user.welcome", "user.role_changed", "user.access_changed"]);

const IN_APP_TONE = { info: "info", action: "action", alert: "alert" } as const;

function manilaDayStart() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  return new Date(`${day}T00:00:00+08:00`).toISOString();
}

export async function notify(options: {
  event: NotificationEvent;
  entityType?: string;
  entityId?: string;
  recipients: Recipient[];
  subject: string;
  content: (recipient: Recipient) => Omit<EmailContent, "greeting">;
  // Override whether this send may email (default: only action events).
  email?: boolean;
  // The daily summary is email-only.
  inApp?: boolean;
}) {
  const recipients = dedupe(options.recipients);
  if (recipients.length === 0) return;

  // In-app first: it is free, instant and never blocked by email settings.
  // A problem here must never stop the email or break the action that triggered this.
  if (options.inApp !== false && recipients.some((recipient) => recipient.id)) {
    try {
      await storeInApp(options, recipients);
    } catch (error) {
      console.error("in-app notification failed", options.event, error);
    }
  }

  const emailAllowed = options.email ?? ACTION_EMAIL_EVENTS.has(options.event);
  if (!emailAllowed || process.env.NOTIFICATIONS_ENABLED !== "true") return;
  const admin = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  await sendEmails(admin, options, recipients);
}

type NotifyOptions = Parameters<typeof notify>[0];

async function storeInApp(options: NotifyOptions, recipients: Recipient[]) {
  const admin = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const rows = recipients
    .filter((recipient) => recipient.id)
    .map((recipient) => {
      const content = options.content(recipient);
      const link = content.cta?.path;
      return {
        user_id: recipient.id as string,
        event: options.event,
        title: content.heading.slice(0, 200),
        body: content.paragraphs[0]?.slice(0, 480) ?? null,
        link_path: link && /^\/[A-Za-z0-9/_?=&.%-]*$/.test(link) ? link : null,
        tone: IN_APP_TONE[content.tone],
        entity_type: options.entityType ?? null,
        entity_id: options.entityId ?? null,
      };
    });
  if (rows.length > 0) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error) console.error("in-app notification failed", options.event, error.message);
  }
}

async function sendEmails(admin: SupabaseClient<WorkflowDatabase>, options: NotifyOptions, recipients: Recipient[]) {
  // In development set NOTIFY_REDIRECT_TO so test accounts never email anyone.
  const redirectTo = process.env.NOTIFY_REDIRECT_TO;
  const ids = recipients.map((recipient) => recipient.id).filter((id): id is string => Boolean(id));
  const { data: prefRows } = ids.length
    ? await admin.from("notification_preferences").select("user_id, email_actions, email_digest").in("user_id", ids)
    : { data: [] };
  const prefs = new Map((prefRows ?? []).map((row) => [row.user_id, row]));
  const cap = Number(process.env.EMAIL_DAILY_LIMIT ?? 90);
  const { count: sentToday } = await admin
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("created_at", manilaDayStart());
  let sent = sentToday ?? 0;
  let emailedNow = false;

  for (const recipient of recipients) {
    const preference = recipient.id ? prefs.get(recipient.id) : undefined;
    const optedOut = !ALWAYS_EMAIL.has(options.event) &&
      (options.event === "digest.daily" ? preference?.email_digest === false : preference?.email_actions === false);

    let status: "sent" | "failed" | "skipped" = "sent";
    let error: string | null = null;
    if (optedOut) {
      status = "skipped";
      error = "Turned off by the recipient";
    } else if (Number.isFinite(cap) && sent >= cap && !ALWAYS_EMAIL.has(options.event)) {
      status = "skipped";
      error = "Daily email limit reached; the in-app notification was still delivered";
    } else {
      if (emailedNow) await wait(SPACING_MS);
      const greeting = `Hi ${recipient.full_name.split(/\s+/)[0] || "there"},`;
      const { html, text } = renderEmail({ ...options.content(recipient), greeting });
      const to = redirectTo ?? recipient.email;
      const subject = redirectTo ? `[to: ${recipient.email}] ${options.subject}` : options.subject;
      try {
        await sendEmail({ to, subject, html, text });
        sent += 1;
        emailedNow = true;
      } catch (caught) {
        status = "failed";
        error = caught instanceof Error ? caught.message.slice(0, 500) : String(caught);
        console.error("notification failed", options.event, recipient.email, error);
      }
    }

    await admin.from("notification_log").insert({
      event: options.event,
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
      recipient_id: recipient.id,
      recipient_email: recipient.email,
      subject: options.subject,
      status,
      error,
    });
  }
}

// Runs after the response is sent, so a slow or failing email never blocks or
// breaks the action that triggered it.
export function queueNotification(label: string, task: () => Promise<void>) {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`notification task failed: ${label}`, error);
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
