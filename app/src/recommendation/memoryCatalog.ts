export type Strategy = "value" | "stability" | "lowest";
export type Confidence = "recommended" | "review" | "excluded";
export type Availability = "active" | "sold" | "ended" | "unknown";

export type MemoryProduct = {
  id: string;
  maker: string;
  model: string;
  speed: 2400 | 2666 | 3200 | 3600;
  capacityGb: number;
  sticks: number;
  lowestPrice: number;
  shipping: number;
  newPrice?: number;
  listings: number;
  source: string;
  availability: Availability;
  checkedAt: string;
  confidence: Confidence;
  compatibility: number;
  evidence: string[];
  caution?: string;
};

export const fixtureProducts: MemoryProduct[] = [
  { id: "adata-3200-16x2", maker: "A-DATA", model: "AD4U320016G22-D", speed: 3200, capacityGb: 32, sticks: 2, lowestPrice: 17800, shipping: 750, newPrice: 29800, listings: 3, source: "Yahoo!オークション", availability: "active", checkedAt: "17:31", confidence: "recommended", compatibility: 94, evidence: ["販売中を確認", "現在と同じメーカー", "DDR4-3200 / 1.2V", "16GB×2を写真で確認"], caution: "既存品の細かい型番は未取得" },
  { id: "crucial-2666-16x2", maker: "Crucial", model: "CT2K16G4DFD8266", speed: 2666, capacityGb: 32, sticks: 2, lowestPrice: 13800, shipping: 0, newPrice: 24800, listings: 5, source: "メルカリ", availability: "active", checkedAt: "17:31", confidence: "recommended", compatibility: 87, evidence: ["販売中を確認", "DDR4 UDIMM / 非ECC", "16GB×2セット", "動作確認済み"], caution: "増設時は全体が2666動作になる可能性" },
  { id: "team-2400-16x2", maker: "Team", model: "TED432G2400C16DC01", speed: 2400, capacityGb: 32, sticks: 2, lowestPrice: 9800, shipping: 850, listings: 2, source: "ラクマ", availability: "active", checkedAt: "17:30", confidence: "recommended", compatibility: 82, evidence: ["販売中を確認", "DDR4 UDIMM", "16GB×2セット", "容量・枚数を写真で確認"], caution: "増設時は全体が2400動作になる可能性" },
  { id: "team-3200-32x2", maker: "Team", model: "TPRD464G3200HC22DC01", speed: 3200, capacityGb: 64, sticks: 2, lowestPrice: 36800, shipping: 0, newPrice: 42392, listings: 4, source: "Yahoo!オークション", availability: "active", checkedAt: "17:31", confidence: "recommended", compatibility: 96, evidence: ["販売中を確認", "32GB×2へ交換", "DDR4-3200 / 1.2V", "2枚構成で安定しやすい"] },
  { id: "crucial-3200-32x2", maker: "Crucial", model: "CP2K32G4DFRA32A", speed: 3200, capacityGb: 64, sticks: 2, lowestPrice: 41800, shipping: 750, newPrice: 64980, listings: 7, source: "メルカリ", availability: "active", checkedAt: "17:31", confidence: "recommended", compatibility: 96, evidence: ["販売中を確認", "32GB×2へ交換", "DDR4-3200 / 1.2V", "型番を商品写真で確認"] },
  { id: "unknown-3200", maker: "不明", model: "型番未記載 32GB×2", speed: 3200, capacityGb: 64, sticks: 2, lowestPrice: 26800, shipping: 1200, listings: 1, source: "メルカリ", availability: "unknown", checkedAt: "17:29", confidence: "review", compatibility: 54, evidence: ["DDR4-3200の記載あり"], caution: "販売状態・型番・電圧・ECC有無を確認できないため推薦対象外" },
  { id: "sold-crucial", maker: "Crucial", model: "CP2K32G4DFRA32A", speed: 3200, capacityGb: 64, sticks: 2, lowestPrice: 22000, shipping: 0, listings: 1, source: "メルカリ", availability: "sold", checkedAt: "17:28", confidence: "excluded", compatibility: 96, evidence: ["売り切れを確認"], caution: "過去価格としてのみ保存" },
  { id: "ended-adata", maker: "A-DATA", model: "AD4U320016G22-D", speed: 3200, capacityGb: 32, sticks: 2, lowestPrice: 12000, shipping: 750, listings: 1, source: "Yahoo!オークション", availability: "ended", checkedAt: "17:28", confidence: "excluded", compatibility: 94, evidence: ["オークション終了を確認"], caution: "落札相場としてのみ保存" },
];

export function totalPrice(product: MemoryProduct) { return product.lowestPrice + product.shipping; }

export function rankProducts(products: MemoryProduct[], strategy: Strategy, includeReview: boolean, query: string) {
  const needle = query.trim().toLowerCase();
  const visible = products.filter((product) => {
    if (product.availability !== "active") return false;
    if (!includeReview && product.confidence !== "recommended") return false;
    return !needle || `${product.maker} ${product.model}`.toLowerCase().includes(needle);
  });
  return [...visible].sort((a, b) => {
    if (strategy === "lowest") return totalPrice(a) - totalPrice(b);
    if (strategy === "stability") return b.compatibility - a.compatibility || totalPrice(a) - totalPrice(b);
    const valueA = totalPrice(a) / a.capacityGb + (100 - a.compatibility) * 9 + Math.abs(3200 - a.speed) * 0.08;
    const valueB = totalPrice(b) / b.capacityGb + (100 - b.compatibility) * 9 + Math.abs(3200 - b.speed) * 0.08;
    return valueA - valueB;
  });
}
