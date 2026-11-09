// A parent who opens family play from Pip's Cast Club comes back to the Cast
// Club, not to /play. The marker lives in this tab's sessionStorage, which
// survives the round trip through checkout and holds nothing about anyone.
(function () {
  try {
    if (new URLSearchParams(location.search).get("from") === "cast") sessionStorage.setItem("kide.from", "cast");
    if (sessionStorage.getItem("kide.from") !== "cast") return;
  } catch (e) { return; }
  document.querySelectorAll('a[href="/play/"]').forEach(function (a) {
    a.href = "/cast/app/";
    a.textContent = "Back to Pip's Cast Club";
  });
})();
