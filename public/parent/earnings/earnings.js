// Money path: the parent sees pending, available, and paid for their family link.
(function () {
  const $ = (id) => document.getElementById(id);

  function money(cents) {
    const n = Number(cents) || 0;
    const dollars = Math.floor(Math.abs(n) / 100);
    const rem = Math.abs(n) % 100;
    const body = rem === 0 ? String(dollars) : dollars + "." + String(rem).padStart(2, "0");
    return (n < 0 ? "-$" : "$") + body;
  }

  function say(id, text) {
    const el = $(id);
    if (el) el.textContent = text || "";
  }

  async function load() {
    let data = null;
    try {
      const res = await fetch("/api/parent/earnings", { credentials: "same-origin" });
      data = await res.json();
    } catch {
      data = null;
    }
    if (!data || data.ok !== true) {
      say("earnMsg", (data && data.message) || "Pip could not open that just now. Try again in a moment.");
      return;
    }
    $("pending").textContent = money(data.pendingCents);
    $("available").textContent = money(data.availableCents);
    $("paid").textContent = money(data.paidCents);
    say("earnMsg", data.message || "");
    const send = $("sendLine");
    if (send) send.hidden = true;
    const rawLink = typeof data.link === "string" ? data.link : "";
    const link = rawLink.startsWith("https://kide.us/r/") || rawLink.startsWith("https://kide.us/?ref=")
      ? rawLink
      : "";
    const card = $("shareCard");
    if (!link || !card) return;
    card.hidden = false;
    say("shareUrl", link);
    const shareText = "I think your kiddo would love Pip.";
    $("shareGo").addEventListener("click", async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: "Kide", text: shareText, url: link });
          return;
        } catch { /* dismissed */ }
      }
      try {
        await navigator.clipboard.writeText(link);
        say("shareMsg", "Link copied. Paste it into a message.");
      } catch {
        say("shareMsg", link);
      }
    });
    $("copyGo").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link);
        say("shareMsg", "Link copied. Paste it into a message.");
      } catch {
        say("shareMsg", link);
      }
    });
  }

  load();
})();
