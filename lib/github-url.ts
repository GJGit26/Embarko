/**
 * Accepts only https://github.com/<owner>/<repo>[/...] links. Returns the
 * normalised URL, or null. Used for project submissions; the link is stored
 * and shown, never fetched by the server, so there is no SSRF surface here.
 */
export function parseGithubRepoUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 300) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  if (!parts.every((p) => /^[A-Za-z0-9._-]+$/.test(p))) return null;
  return `https://github.com/${parts.join("/")}`;
}
