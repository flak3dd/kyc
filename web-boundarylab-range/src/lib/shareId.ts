/**
 * Share-id format shared with the Cloudflare Worker (`functions/index.ts`).
 * New: 16 CSPRNG bytes → base64url without padding = 22 characters.
 * Legacy: 16-char alnum (pre-audit) accepted until 24h TTL drains.
 */
export const SHARE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const LEGACY_SHARE_ID_RE = /^[A-Za-z0-9]{16}$/;

export function isValidShareId(id: string): boolean {
  return typeof id === "string" && (SHARE_ID_RE.test(id) || LEGACY_SHARE_ID_RE.test(id));
}
