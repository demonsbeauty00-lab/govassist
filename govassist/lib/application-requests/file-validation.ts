import { ALLOWED_UPLOAD_MIME, MAX_FILE_BYTES, type AllowedMime } from "./constants";

/** Verifies the file's leading bytes match the claimed type, so a renamed
 *  executable can't pass as a PDF/image just by setting a MIME type. */
export function bytesMatchMime(bytes: Uint8Array, mime: AllowedMime): boolean {
  const at = (i: number) => bytes[i] ?? -1;
  switch (mime) {
    case "application/pdf":
      return at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46; // %PDF
    case "image/jpeg":
      return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
    case "image/png":
      return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47;
  }
}

export function normalizeMime(type: string): AllowedMime | null {
  const t = type === "image/jpg" ? "image/jpeg" : type;
  return (ALLOWED_UPLOAD_MIME as readonly string[]).includes(t) ? (t as AllowedMime) : null;
}

export function validateUploadMeta(size: number, type: string): { error: string } | { mime: AllowedMime } {
  if (size <= 0) return { error: "One of the files is empty." };
  if (size > MAX_FILE_BYTES) return { error: `Each file must be under ${MAX_FILE_BYTES / (1024 * 1024)}MB.` };
  const mime = normalizeMime(type);
  if (!mime) return { error: "Only PDF, JPG and PNG files are supported." };
  return { mime };
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 100) || "file";
}
