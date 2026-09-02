(() => {
  if (location.hostname !== "jp.mercari.com" || location.pathname !== "/search") return;
  const token = new URL(location.href).searchParams.get("pcpf_token");
  if (!token) return;

  let delivered = false;
  const capture = async () => {
    if (delivered) return;
    const checkbox = [...document.querySelectorAll('input[type="checkbox"]')].find((element) => {
      const label = element.closest("label")?.textContent || "";
      return label.includes("販売中のみ表示") || (element.getAttribute("aria-label") || "").includes("販売中のみ表示");
    });
    const cards = [...document.querySelectorAll('a[href*="/item/"]')].map((anchor) => ({
      href: anchor.getAttribute("href") || "",
      imageUrl: anchor.querySelector("img")?.currentSrc || anchor.querySelector("img")?.getAttribute("src") || "",
      text: [
        anchor.getAttribute("aria-label") || "",
        anchor.textContent || "",
        ...[...anchor.querySelectorAll("img")].map((image) => image.getAttribute("alt") || ""),
      ].filter(Boolean).join(" "),
    }));
    if (!checkbox?.checked || cards.length === 0) return;
    try {
      const response = await fetch("http://127.0.0.1:38491/imports/mercari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pageUrl: location.href, onSaleChecked: true, cards }),
      });
      if (response.ok) delivered = true;
    } catch (_) {
      // The desktop app shows a timeout when the local bridge cannot be reached.
    }
  };

  const start = () => {
    window.setTimeout(capture, 1000);
    const observer = new MutationObserver(() => window.setTimeout(capture, 250));
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
