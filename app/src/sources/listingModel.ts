import { profileFor, type Confidence, type PartCriteria } from "./partProfiles";
import type { UsedSourceId } from "./sourceCatalog";

export type RawSourceCard = { href: string; text: string; imageUrl?: string };
export type ImportedListing = {
  source: UsedSourceId;
  sourceId: string;
  url: string;
  title: string;
  price: number;
  imageUrl?: string;
  availability: "active";
  confidence: Confidence;
  reasons: string[];
};

const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();

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

export function parseSourceCard(source: UsedSourceId, card: RawSourceCard, criteria: PartCriteria, activeConfirmed: boolean): ImportedListing | null {
  if (!activeConfirmed) return null;
  const id = sourceId(source, card.href);
  const text = normalize(card.text);
  const price = priceFrom(text);
  if (!id || !Number.isFinite(price) || price <= 0) return null;

  const verdict = profileFor(criteria.profile).classify(text, price, criteria);
  const title = text.replace(/[¥￥]\s*[\d,]+(?:～)?/g, "").replace(/[\d,]+\s*円/g, "").trim();
  return { source, sourceId: `${source}:${id}`, url: card.href, title, price, imageUrl: card.imageUrl, availability: "active", confidence: verdict.confidence, reasons: verdict.reasons };
}

export function importSourceCards(source: UsedSourceId, cards: RawSourceCard[], criteria: PartCriteria, activeConfirmed: boolean) {
  const unique = new Map<string, ImportedListing>();
  for (const card of cards) {
    const listing = parseSourceCard(source, card, criteria, activeConfirmed);
    if (listing) unique.set(listing.sourceId, listing);
  }
  return [...unique.values()];
}
