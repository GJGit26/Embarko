/**
 * Post-login redirect targets must stay on this site. Accepts only a relative
 * path like "/career" or "/roadmap/abc?x=1"; anything else (absolute URLs,
 * "//evil.com", backslashes, protocol tricks) falls back to the default.
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 300) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\") || next.includes("://") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
