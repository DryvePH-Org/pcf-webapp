import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDatabase } from "@/lib/workflow";

export const TEMPLATE_BUCKET = "fund-templates";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_TEMPLATE_BYTES = 15 * 1024 * 1024;

const admin = () => createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;

export async function templateFor(fundId: string) {
  const found = await admin().from("fund_export_templates").select("*").eq("fund_id", fundId).maybeSingle();
  if (found.error) throw new Error("Could not read the fund's template.");
  return found.data;
}

export async function loadTemplateFile(path: string) {
  const file = await createAdminClient().storage.from(TEMPLATE_BUCKET).download(path);
  if (file.error || !file.data) throw new Error("Could not open the fund's template file.");
  return Buffer.from(await file.data.arrayBuffer());
}

// Replaces the fund's template. The old file is removed only after the new one is saved.
export async function saveTemplate(input: { fundId: string; fileName: string; bytes: Buffer; userId: string }) {
  const storage = createAdminClient().storage.from(TEMPLATE_BUCKET);
  const path = `${input.fundId}/${crypto.randomUUID()}.xlsx`;
  const uploaded = await storage.upload(path, input.bytes, { contentType: XLSX_TYPE, upsert: false });
  if (uploaded.error) throw new Error("Could not store the template.");
  const previous = await templateFor(input.fundId);
  const saved = await admin()
    .from("fund_export_templates")
    .upsert({ fund_id: input.fundId, file_name: input.fileName.slice(0, 200), storage_path: path, uploaded_by: input.userId, uploaded_at: new Date().toISOString() });
  if (saved.error) {
    await storage.remove([path]);
    throw new Error("Could not save the template.");
  }
  if (previous && previous.storage_path !== path) await storage.remove([previous.storage_path]);
}
