import { importMercariSearch } from "../sources/mercari/mercariSearchAdapter";

function scanPage() {
  const onSaleCheckbox = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((element) => element.closest("label")?.textContent?.includes("販売中のみ表示") || element.getAttribute("aria-label")?.includes("販売中のみ表示"));
  const cards = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/item/"]')].map((anchor) => ({
    href: anchor.getAttribute("href") ?? "",
    imageUrl: anchor.querySelector("img")?.currentSrc || anchor.querySelector("img")?.getAttribute("src") || "",
    text: [anchor.getAttribute("aria-label") ?? "", anchor.textContent ?? "", ...[...anchor.querySelectorAll("img")].map((image) => image.getAttribute("alt") ?? "")].filter(Boolean).join(" "),
  }));
  const listings = importMercariSearch(cards, location.href, Boolean(onSaleCheckbox?.checked));
  return { pageUrl: location.href, onSaleConfirmed: Boolean(onSaleCheckbox?.checked) && new URL(location.href).searchParams.get("status") === "on_sale", scanned: cards.length, listings };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PCPF_SCAN_MERCARI") return;
  sendResponse(scanPage());
});

const token = new URL(location.href).searchParams.get("pcpf_token");
if (token) {
  window.setTimeout(() => chrome.runtime.sendMessage({ type: "PCPF_DELIVER_MERCARI", token, payload: scanPage() }), 1200);
}
