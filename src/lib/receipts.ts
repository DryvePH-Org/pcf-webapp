import imageCompression from "browser-image-compression";

import { createClient } from "@/lib/supabase/client";

export const RECEIPT_TARGET_BYTES = 200 * 1024;

export async function compressReceipt(file: File) {
  return imageCompression(file, {
    maxSizeMB: 0.2,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/jpeg",
  });
}

export async function uploadReceipt(
  file: File,
  fundId: string,
  voucherId: string,
) {
  const supabase = createClient();
  const compressed = await compressReceipt(file);
  const path = `${fundId}/${voucherId}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from("receipts")
    .upload(path, compressed, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) throw new Error(error.message);
  return path;
}
