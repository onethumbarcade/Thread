// Track links and sharing are shared by the menu and the score card.
(() => {
  function normalizeCode(value) {
    const compact = String(value).trim().toUpperCase().replace(/[\s\-\u2010-\u2015\u2212]/g, "");
    return /^[A-Z0-9]{4}[0-9]{4}$/.test(compact)
      ? `${compact.slice(0, 4)}-${compact.slice(4)}`
      : null;
  }

  function newCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let prefix = "";
    for (let i = 0; i < 4; i++) prefix += alphabet[Math.floor(Math.random() * alphabet.length)];
    return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function trackUrl(mode, value, base = location.href) {
    const url = new URL("index.html", base);
    url.searchParams.set("mode", mode);
    url.searchParams.set(mode === "daily" ? "track" : "seed", String(value));
    return url.href;
  }

  async function share(data) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
        return "shared";
      } catch (error) {
        // Dismissing the phone's share menu should not copy anything.
        if (error.name === "AbortError") return "cancelled";
      }
    }
    try {
      await navigator.clipboard.writeText(`${data.text}\n\n${data.url}`);
      return "copied";
    } catch {
      return "manual";
    }
  }

  globalThis.ThreadTracks = { normalizeCode, newCode, trackUrl, share };
})();
