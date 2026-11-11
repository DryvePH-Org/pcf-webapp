export const LIQUIDATION_ATTACHMENT_LIMIT = 20 * 1024 * 1024;
export const LIQUIDATION_ATTACHMENT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,.heic,.heif,image/jpeg,image/png,image/webp,application/pdf,image/heic,image/heif";

const types: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  heic: "image/heic",
  heif: "image/heif",
};

export function liquidationAttachmentType(file: File) {
  const suffix = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extension = types[suffix]
    ? suffix
    : (Object.keys(types).find((key) => types[key] === file.type) ?? "");
  const mime = types[extension];
  const heifFamily = [mime, file.type].every((type) =>
    ["image/heic", "image/heif"].includes(type),
  );
  if (
    !mime ||
    (file.type &&
      file.type !== "application/octet-stream" &&
      file.type !== mime &&
      !heifFamily)
  ) {
    throw new Error("Choose a JPEG, PNG, WebP, PDF, HEIC, or HEIF file.");
  }
  if (!file.size || file.size > LIQUIDATION_ATTACHMENT_LIMIT) {
    throw new Error("Choose a file between 1 byte and 20 MB.");
  }
  return { extension, mime };
}

export function canExtractLiquidationAttachment(path: string) {
  return /\.(jpe?g|png|webp)$/i.test(path);
}
