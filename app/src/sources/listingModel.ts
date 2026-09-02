import type { SearchCriteria, UsedSourceId } from "./sourceCatalog";

export type RawSourceCard = { href: string; text: string; imageUrl?: string };
export type ImportedListing = {
  source: UsedSourceId;
  sourceId: string;
  url: string;
  title: string;
  price: number;
  imageUrl?: string;
  availability: "active";
  confidence: "candidate" | "review" | "excluded";
  reasons: string[];
};

const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function priceFrom(text: string) {
  const match = text.match(/[¥￥]\s*([\d,]+)|([\d,]+)\s*円/);
  return Number((match?.[1] ?? match?.[2] ?? "").replace(/,/g, ""));
}

function sourceId(source: UsedSourceId, href: string) {
  const patterns: Partial<Record<UsedSourceId, RegExp>> = {
    mercari: /\/item\/(m\d+)/,
    "yahoo-flea": /\/item\/([a-z]?\d+)/,
    rakuma: /item\.fril\.jp\/([a-f0-9]+)/,
    janpara: /[?&]ITMCODE=(\d+)/,
    "pc-koubou": /[?&]product_id=(\d+)/,
    hardoff: /\/product\/(\d+)/,
  };
  return href.match(patterns[source] ?? /$^/)?.[1] ?? "";
}

function layoutEvidence(text: string, criteria: SearchCriteria) {
  const [moduleSize, count] = criteria.layout.split(/[×xX*]/).map((part) => part.replace(/GB/i, "").trim());
  if (!moduleSize || !count) return false;
  const size = escapeRegExp(moduleSize);
  const qty = escapeRegExp(count);
  return new RegExp(`${size}\\s*gb\\s*(?:[x×*]\\s*${qty}|${qty}\\s*枚)|${qty}\\s*[x×*]\\s*${size}\\s*gb`, "i").test(text);
}

function detectedSpeed(text: string) {
  const direct = text.match(/ddr\s*4[-\s]?(2133|2400|2666|2933|3000|3200|3600)/i)?.[1];
  if (direct) return Number(direct);
  const pc4 = Number(text.match(/pc4[-\s]?(17000|19200|21300|23400|24000|25600|28800)/i)?.[1]);
  return ({ 17000: 2133, 19200: 2400, 21300: 2666, 23400: 2933, 24000: 3000, 25600: 3200, 28800: 3600 } as Record<number, number>)[pc4];
}

function speedBand(speed: number) {
  if (speed >= 3200) return "3200";
  if (speed >= 2666) return "2666";
  if (speed >= 2400) return "2400";
  return "below-2400";
}

export function parseSourceCard(source: UsedSourceId, card: RawSourceCard, criteria: SearchCriteria, activeConfirmed: boolean): ImportedListing | null {
  if (!activeConfirmed) return null;
  const id = sourceId(source, card.href);
  const text = normalize(card.text);
  const price = priceFrom(text);
  if (!id || !Number.isFinite(price) || price <= 0) return null;

  const lower = text.toLowerCase();
  const reasons: string[] = [];
  const isDdr4 = /ddr\s*4|pc4[-\s]?\d+/.test(lower);
  const layoutMatches = layoutEvidence(lower, criteria);
  const laptop = /so[-\s]?dimm|sodimm|ノート(?:pc)?用|m471a/.test(lower);
  const server = /registered|rdimm|サーバー用|ecc\s*\/|m393a/.test(lower);
  const wholePc = /ゲーミングpc|デスクトップpc|パソコン本体/.test(lower) && !/デスクトップ(?:pc)?用/.test(lower);
  const junk = /ジャンク|動作未確認/.test(lower);
  const speed = detectedSpeed(lower);
  if (!isDdr4) reasons.push("DDR4を確認できない");
  if (!layoutMatches) reasons.push(`${criteria.layout}を確認できない`);
  if (laptop) reasons.push("ノート用SO-DIMM");
  if (server) reasons.push("サーバー用メモリ");
  if (wholePc) reasons.push("メモリ単体ではなくPC本体");
  if (junk) reasons.push("ジャンク・動作未確認");
  if (speed && !criteria.speeds.includes(speedBand(speed))) reasons.push("選択した速度帯ではない");
  if (!speed) reasons.push("速度を確認できない");
  const excluded = !isDdr4 || !layoutMatches || laptop || server || wholePc || junk || (!!speed && !criteria.speeds.includes(speedBand(speed)));
  const confidence = excluded ? "excluded" : speed ? "candidate" : "review";
  const title = text.replace(/[¥￥]\s*[\d,]+(?:～)?/g, "").replace(/[\d,]+\s*円/g, "").trim();
  return { source, sourceId: `${source}:${id}`, url: card.href, title, price, imageUrl: card.imageUrl, availability: "active", confidence, reasons };
}

export function importSourceCards(source: UsedSourceId, cards: RawSourceCard[], criteria: SearchCriteria, activeConfirmed: boolean) {
  const unique = new Map<string, ImportedListing>();
  for (const card of cards) {
    const listing = parseSourceCard(source, card, criteria, activeConfirmed);
    if (listing) unique.set(listing.sourceId, listing);
  }
  return [...unique.values()];
}
