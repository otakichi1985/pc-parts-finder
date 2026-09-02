(() => {
  const token = new URL(location.href).searchParams.get("pcpf_token");
  if (!token) return;

  const config = (() => {
    if (location.hostname === "jp.mercari.com" && location.pathname === "/search") {
      return { source: "mercari", selector: 'a[href*="/item/"]', active: () => {
        const checkbox = [...document.querySelectorAll('input[type="checkbox"]')].find((element) => ((element.closest("label")?.textContent || "") + (element.getAttribute("aria-label") || "")).includes("販売中のみ表示"));
        return new URL(location.href).searchParams.get("status") === "on_sale" && checkbox?.checked === true;
      }};
    }
    if (location.hostname === "paypayfleamarket.yahoo.co.jp" && location.pathname.startsWith("/search/")) {
      return { source: "yahoo-flea", selector: 'a[href^="/item/"]', active: () => new URL(location.href).searchParams.get("open") === "1" };
    }
    if (location.hostname === "fril.jp" && location.pathname === "/s") {
      return { source: "rakuma", selector: ".item-box", linkSelector: 'a[href^="https://item.fril.jp/"]', active: () => new URL(location.href).searchParams.get("transaction") === "selling" };
    }
    if (location.hostname === "www.janpara.co.jp" && location.pathname === "/sale/search/result/") {
      return { source: "janpara", selector: 'a.search_itemlink[href*="ITMCODE="]', active: () => new URL(location.href).searchParams.get("CHKOUTCOM") === "1" };
    }
    if (location.hostname === "www.pc-koubou.jp" && location.pathname.startsWith("/pc/used_memory_d_ddr4")) {
      return { source: "pc-koubou", selector: 'a[href*="products/detail.php?product_id="]', active: () => true };
    }
    if (location.hostname === "netmall.hardoff.co.jp" && location.pathname.startsWith("/cate/0001000200050009")) {
      return { source: "hardoff", selector: 'a[href*="/product/"]', active: () => {
        const checkbox = [...document.querySelectorAll('input[type="checkbox"]')].find((element) => ((element.getAttribute("aria-label") || "") + (element.parentElement?.textContent || "")).includes("販売中のみ表示"));
        if (checkbox && !checkbox.checked) {
          checkbox.click();
          return false;
        }
        return checkbox?.checked === true;
      }};
    }
    return null;
  })();
  if (!config) return;

  let delivered = false;
  const startedAt = Date.now();
  const capture = async () => {
    if (delivered) return;
    const activeConfirmed = config.active();
    const cards = [...document.querySelectorAll(config.selector)].map((element) => {
      const anchor = config.linkSelector ? element.querySelector(config.linkSelector) : element;
      if (!anchor) return null;
      const readable = element.cloneNode(true);
      readable.querySelectorAll("button, noscript, script, style").forEach((node) => node.remove());
      const text = [anchor.getAttribute("aria-label") || "", readable.textContent || "", ...[...element.querySelectorAll("img")].map((image) => image.getAttribute("alt") || "")].filter(Boolean).join(" ");
      if (/\bsold\b|sold out|売り切れ/i.test(text)) return null;
      return {
        href: anchor.href,
        imageUrl: element.querySelector("img")?.currentSrc || element.querySelector("img")?.getAttribute("src") || "",
        text,
      };
    }).filter(Boolean);
    if (!activeConfirmed || (cards.length === 0 && Date.now() - startedAt < 4000)) return;
    try {
      const response = await fetch("http://127.0.0.1:38491/imports/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: config.source, token, pageUrl: location.href, activeConfirmed, cards }),
      });
      if (response.ok) delivered = true;
    } catch (_) {}
  };
  const start = () => {
    window.setTimeout(capture, 1200);
    const timer = window.setInterval(capture, 1000);
    const observer = new MutationObserver(() => window.setTimeout(capture, 300));
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => { observer.disconnect(); window.clearInterval(timer); }, 18000);
  };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
