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

// Opens an attached receipt in a new tab: the local copy while the file was
// just chosen, otherwise a short-lived signed link.
export async function openLiquidationReceipt(path: string, local?: string) {
  if (local) {
    window.open(local, "_blank", "noopener");
    return;
  }
  const tab = window.open("", "_blank");
  const { data, error } = await createClient()
    .storage.from("liquidation-receipts")
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    tab?.close();
    throw new Error("Could not open the attachment.");
  }
  if (tab) {
    tab.opener = null;
    tab.location.href = data.signedUrl;
  } else window.open(data.signedUrl, "_blank", "noopener");
}
