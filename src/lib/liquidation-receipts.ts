"use client";
import { createClient } from "@/lib/supabase/client";
import { compressReceipt } from "@/lib/receipts";
import {
  liquidationAttachmentType,
} from "@/lib/liquidation-attachment";

export async function uploadLiquidationReceipt(
  file: File,
  liquidationId: string,
  lineId: string,
) {
  const { extension, mime } = liquidationAttachmentType(file);
  const image = ["image/jpeg", "image/png", "image/webp"].includes(mime);
  const body = image
    ? await compressReceipt(new File([file], file.name, { type: mime }))
    : file;
  const path = `${liquidationId}/${lineId}/${crypto.randomUUID()}.${image ? "jpg" : extension}`;
  const client = createClient();
  const { error } = await client.storage
    .from("liquidation-receipts")
    .upload(path, body, {
      contentType: image ? "image/jpeg" : mime,
      upsert: false,
    });
  if (error) throw new Error("Could not upload the receipt. Try again.");
  return path;
}
