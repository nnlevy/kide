// Same shape as the parent-account check, kept here so the unlock module does
// not import the account handler (that file moves on its own).

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase().replace(/[\u0000-\u001f\u007f]/g, "");
  if (email.length < 3 || email.length > 254) return null;
  if (email.startsWith(".") || email.includes("..") || email.includes("@.") || email.includes(".@")) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return null;
  return email;
}
