// Finds the Vercel Blob credentials however the store was connected:
//  • BLOB_READ_WRITE_TOKEN (the usual name),
//  • the same key under a custom prefix (e.g. PINE_READ_WRITE_TOKEN) — any value starting "vercel_blob_rw_",
//  • or the newer sign-in method (BLOB_STORE_ID + Vercel's automatic OIDC token; no key at all).
export function blobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const [k, v] of Object.entries(process.env)) if (v && /READ_WRITE_TOKEN$/.test(k) && v.startsWith("vercel_blob_rw_")) return v;
  return undefined;
}
const storeId = () => process.env.BLOB_STORE_ID || Object.entries(process.env).find(([k, v]) => v && /BLOB_STORE_ID$/.test(k))?.[1];

export const blobOn = () => Boolean(blobToken() || storeId());
/** Uploads from her computer need the key (to sign a short upload permission). */
export const blobUploadsOn = () => Boolean(blobToken());

/** Options to pass to put / get / del. */
export function blobAuth(): { token?: string; storeId?: string } {
  const token = blobToken();
  if (token) return { token };
  const id = storeId();
  return id ? { storeId: id } : {};
}
