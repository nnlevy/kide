// Money path: a parent's share link (?ref=CODE) → kide_ref cookie → the family
// unlock checkout carries it to the billing hub → a paid unlock credits the
// sharer. The hub owns codes, payouts and the owner queue. This file only reads
// and carries the code. It never decides a payout.

// Same alphabet the hub issues (no 0, 1, I, L, O, U): read aloud, retyped.
const REF_RE = /^[2-9A-HJKMNP-TV-Z]{8}$/;
export const REF_COOKIE = "kide_ref";
export const REF_DAYS = 30;

export function normalizeRef(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return REF_RE.test(code) ? code : null;
}

export function refFromUrl(url) {
  try {
    return normalizeRef(new URL(url).searchParams.get("ref"));
  } catch {
    return null;
  }
}

export function refFromRequest(request) {
  const raw = (request && request.headers && request.headers.get("cookie")) || "";
  const match = raw.match(/(?:^|;\s*)kide_ref=([A-Za-z0-9]{8})(?:;|$)/);
  return match ? normalizeRef(match[1]) : null;
}

export function refCookie(code) {
  return `${REF_COOKIE}=${code}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${REF_DAYS * 86400}`;
}

// The latest link a family followed wins. Only GET/HEAD page loads set it.
export function withRefCookie(request, response) {
  if (!request || (request.method !== "GET" && request.method !== "HEAD")) return response;
  const code = refFromUrl(request.url);
  if (!code || !response) return response;
  const out = new Response(response.body, response);
  out.headers.append("Set-Cookie", refCookie(code));
  return out;
}
