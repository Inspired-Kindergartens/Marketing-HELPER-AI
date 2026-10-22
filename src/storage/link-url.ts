// Links on the Links (Subscriptions) page are opened from the list,
// so only http(s) is kept; a bare domain such as "canva.com" gets https://
// rather than being treated as a relative path.
const URL_MAX_LENGTH = 2000;

export function normalizeLinkUrl(value: unknown): string {
  const text = String(value ?? "").trim().slice(0, URL_MAX_LENGTH);
  if (!text) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}
