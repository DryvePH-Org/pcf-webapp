"use client";
import { createClient } from "@/lib/supabase/client";
import { compressReceipt } from "@/lib/receipts";

export async function uploadLiquidationReceipt(file: File, liquidationId: string, lineId: string) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) throw new Error("Use a JPEG, PNG, WebP, or PDF file up to 5 MB.");
  const pdf = file.type === "application/pdf";
  const body = pdf ? file : await compressReceipt(file);
  const path = `${liquidationId}/${lineId}/${crypto.randomUUID()}.${pdf ? "pdf" : "jpg"}`;
  const client = createClient();
  const { error } = await client.storage.from("liquidation-receipts").upload(path, body, { contentType: pdf ? "application/pdf" : "image/jpeg", upsert: false });
  if (error) throw new Error("Could not upload the receipt. Try again.");
  return path;
}
