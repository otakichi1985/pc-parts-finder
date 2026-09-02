export type RawMercariCard = { href: string; text: string; imageUrl?: string };
export type ImportedListing = { source: "mercari"; sourceId: string; url: string; title: string; price: number; imageUrl?: string; availability: "active"; confidence: "candidate" | "review" | "excluded"; reasons: string[] };
const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();

export function isConfirmedOnSaleSearch(url: string, onSaleChecked: boolean) {
  const parsed = new URL(url);
  return parsed.hostname === "jp.mercari.com" && parsed.pathname === "/search" && parsed.searchParams.get("status") === "on_sale" && onSaleChecked;
}

export function parseMercariSearchCard(card: RawMercariCard, saleFilterConfirmed: boolean): ImportedListing | null {
  if (!saleFilterConfirmed) return null;
  const id = card.href.match(/\/item\/(m\d+)/)?.[1];
  const text = normalize(card.text);
  const priceText = text.match(/(?:現在\s*)?¥([\d,]+)/)?.[1];
  if (!id || !priceText) return null;
  const price = Number(priceText.replace(/,/g, ""));
  if (!Number.isFinite(price) || price <= 0) return null;
  const title = text.replace(/^(?:現在\s*)?¥[\d,]+\s*/, "").replace(/のサムネイル(?:画像)?$/u, "").trim();
  const lower = title.toLowerCase();
  const reasons: string[] = [];
  const isDdr4 = /ddr\s*4|pc4[-\s]?\d+/.test(lower);
  const isTwoBy32 = /32\s*gb\s*[x×*]\s*2|32\s*gb\s*2枚|2\s*[x×*]\s*32\s*gb|64\s*gb\s*\(\s*32\s*gb/.test(lower);
  const laptop = /so[-\s]?dimm|sodimm|ノート(?:pc)?用/.test(lower);
  const wholePc = /ゲーミングpc|デスクトップpc|パソコン本体/.test(lower);
  const wrongCapacity = /16\s*gb\s*2枚/.test(lower) && !isTwoBy32;
  const auctionPrice = /^現在\s*¥/.test(text);
  const desktopEvidence = /u[-\s]?dimm|udimm|デスクトップ用|288\s*pin/.test(lower);
  if (!isDdr4) reasons.push("DDR4を確認できない");
  if (!isTwoBy32) reasons.push("32GB×2を確認できない");
  if (laptop) reasons.push("ノート用SO-DIMM");
  if (wholePc) reasons.push("メモリ単体ではなくPC本体");
  if (wrongCapacity) reasons.push("16GB×2の出品");
  if (auctionPrice) reasons.push("現在価格であり購入額が未確定");
  if (!desktopEvidence && !laptop) reasons.push("デスクトップ用の確証がない");
  const excluded = laptop || wholePc || wrongCapacity || !isDdr4 || !isTwoBy32;
  const confidence = excluded ? "excluded" : desktopEvidence && !auctionPrice ? "candidate" : "review";
  return { source: "mercari", sourceId: id, url: `https://jp.mercari.com/item/${id}`, title, price, imageUrl: card.imageUrl, availability: "active", confidence, reasons };
}

export function importMercariSearch(cards: RawMercariCard[], pageUrl: string, onSaleChecked: boolean) {
  const confirmed = isConfirmedOnSaleSearch(pageUrl, onSaleChecked);
  const unique = new Map<string, ImportedListing>();
  for (const card of cards) {
    const listing = parseMercariSearchCard(card, confirmed);
    if (listing) unique.set(listing.sourceId, listing);
  }
  return [...unique.values()];
}
