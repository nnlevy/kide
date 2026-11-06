// Redirect policy for the platform gate. A page may only be audited if the final URL is the same site
// as the one requested. Allowed: identical origin; apex<->www of the same host; http->https upgrade.
// Everything else (other domain, other subdomain, localhost -> live, https->http, port change) is off-origin.
const bare = (h) => h.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
const port = (u) => u.port || (u.protocol === "https:" ? "443" : u.protocol === "http:" ? "80" : "");
export function sameSite(requested, final) {
  const a = new URL(requested), b = new URL(final);
  if (a.origin === b.origin) return true;
  const proto = a.protocol === b.protocol || (a.protocol === "http:" && b.protocol === "https:");
  if (!proto) return false;
  if (bare(a.hostname) !== bare(b.hostname)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$|^\[|^localhost$/.test(bare(a.hostname))) return a.hostname === b.hostname && port(a) === port(b);
  const protoChanged = a.protocol !== b.protocol;
  return protoChanged ? !a.port && !b.port : port(a) === port(b);
}
