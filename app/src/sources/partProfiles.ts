import { usedSources, type UsedSourceId } from "./sourceCatalog";

export type ProfileId = "memory" | "keyword";
export type Confidence = "candidate" | "review" | "excluded" | "unchecked";

export type MemoryCriteria = {
  profile: "memory";
  generation: "DDR4";
  capacity: string;
  layout: string;
  speeds: string[];
  keyword: string;
};

export type KeywordCriteria = {
  profile: "keyword";
  keyword: string;
  priceMin?: number;
  priceMax?: number;
  excludeWords: string[];
  excludeJunk: boolean;
};

export type PartCriteria = MemoryCriteria | KeywordCriteria;

export type FieldDef =
  | { id: string; kind: "select"; label: string; options: { value: string; label: string }[]; disabled?: boolean }
  | { id: string; kind: "text"; label: string; placeholder?: string }
  | { id: string; kind: "number"; label: string; placeholder?: string }
  | { id: string; kind: "checks"; label: string; options: { value: string; label: string }[] }
  | { id: string; kind: "toggle"; label: string };

export type FieldValues = Record<string, string | string[] | boolean>;

/** アプリ側が生成するURLが、src-tauri の許可規則を満たすことをテストで確かめるための写し。 */
export type SourceUrlShape = { host: string; path: string | RegExp; required: [string, string][] };

export type SourceBinding = {
  summary: string;
  buildUrl(criteria: PartCriteria, token?: string): string;
  shape: SourceUrlShape;
};

export type Verdict = { confidence: Confidence; reasons: string[] };

export type PartProfile = {
  id: ProfileId;
  modeLabel: string;
  heading: string;
  title: string;
  description: string;
  fields: FieldDef[];
  defaults: FieldValues;
  showCurrentSpec: boolean;
  sources: Partial<Record<UsedSourceId, SourceBinding>>;
  queryTerms(criteria: PartCriteria): string;
  canSearch(criteria: PartCriteria): boolean;
  classify(text: string, price: number, criteria: PartCriteria): Verdict;
  resultTags(criteria: PartCriteria): string[];
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function layoutEvidence(text: string, criteria: MemoryCriteria) {
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

const terms = (parts: (string | undefined)[]) => parts.map((part) => (part ?? "").trim()).filter(Boolean).join(" ");

const memoryTerms = (criteria: MemoryCriteria) =>
  terms([criteria.generation, criteria.layout, criteria.capacity, "デスクトップ用", criteria.keyword]);

const commonFleaShapes: Partial<Record<UsedSourceId, SourceUrlShape>> = {
  mercari: { host: "jp.mercari.com", path: "/search", required: [["status", "on_sale"]] },
  "yahoo-flea": { host: "paypayfleamarket.yahoo.co.jp", path: /^\/search\//, required: [["open", "1"]] },
  rakuma: { host: "fril.jp", path: "/s", required: [["transaction", "selling"]] },
  janpara: { host: "www.janpara.co.jp", path: "/sale/search/result/", required: [["CHKOUTCOM", "1"]] },
};

const memorySources: Partial<Record<UsedSourceId, SourceBinding>> = {
  mercari: {
    summary: "販売中のみ＋共通除外",
    buildUrl: (criteria, token) => `https://jp.mercari.com/search?${new URLSearchParams({ keyword: memoryTerms(criteria as MemoryCriteria), status: "on_sale", ...(token ? { pcpf_token: token } : {}) })}`,
    shape: commonFleaShapes.mercari as SourceUrlShape,
  },
  "yahoo-flea": {
    summary: "販売中のみ＋共通除外",
    buildUrl: (criteria, token) => `https://paypayfleamarket.yahoo.co.jp/search/${encodeURIComponent(memoryTerms(criteria as MemoryCriteria))}?${new URLSearchParams({ open: "1", ...(token ? { pcpf_token: token } : {}) })}`,
    shape: commonFleaShapes["yahoo-flea"] as SourceUrlShape,
  },
  rakuma: {
    summary: "販売中のみ＋共通除外",
    buildUrl: (criteria, token) => `https://fril.jp/s?${new URLSearchParams({ query: memoryTerms(criteria as MemoryCriteria), transaction: "selling", ...(token ? { pcpf_token: token } : {}) })}`,
    shape: commonFleaShapes.rakuma as SourceUrlShape,
  },
  janpara: {
    summary: "在庫あり＋デスクトップ",
    buildUrl: (criteria, token) => {
      const memory = criteria as MemoryCriteria;
      return `https://www.janpara.co.jp/sale/search/result/?${new URLSearchParams({ CHKOUTCOM: "1", KEYWORDS: `${memory.generation} デスクトップ ${memory.layout}`, OUTCLSCODE: "8", ORDER: "3", ...(token ? { pcpf_token: token } : {}) })}`;
    },
    shape: commonFleaShapes.janpara as SourceUrlShape,
  },
  "pc-koubou": {
    summary: "現行中古＋DDR4カテゴリ",
    buildUrl: (_criteria, token) => `https://www.pc-koubou.jp/pc/used_memory_d_ddr4_32gb.php${token ? `?pcpf_token=${encodeURIComponent(token)}` : ""}`,
    shape: { host: "www.pc-koubou.jp", path: "/pc/used_memory_d_ddr4_32gb.php", required: [] },
  },
  hardoff: {
    summary: "販売中のみ＋DDR4カテゴリ",
    buildUrl: (_criteria, token) => `https://netmall.hardoff.co.jp/cate/00010002000500090001/${token ? `?pcpf_token=${encodeURIComponent(token)}` : ""}`,
    shape: { host: "netmall.hardoff.co.jp", path: "/cate/00010002000500090001/", required: [] },
  },
};

export const memoryProfile: PartProfile = {
  id: "memory",
  modeLabel: "メモリ",
  heading: "欲しいメモリ",
  title: "中古メモリ横断検索",
  description: "条件に合わない出品を除き、安い順に比較する。",
  showCurrentSpec: true,
  fields: [
    { id: "generation", kind: "select", label: "規格", options: [{ value: "DDR4", label: "DDR4" }], disabled: true },
    { id: "layout", kind: "select", label: "容量・枚数", options: [{ value: "32GB×2", label: "32GB×2" }, { value: "16GB×2", label: "16GB×2" }, { value: "8GB×2", label: "8GB×2" }] },
    { id: "speeds", kind: "checks", label: "速度帯（複数選択可）", options: [{ value: "2400", label: "2400" }, { value: "2666", label: "2666～3000" }, { value: "3200", label: "3200以上" }] },
    { id: "keyword", kind: "text", label: "メーカー・型番（任意）", placeholder: "例：Crucial" },
  ],
  defaults: { generation: "DDR4", layout: "32GB×2", speeds: ["2400", "2666", "3200"], keyword: "" },
  sources: memorySources,
  queryTerms: (criteria) => memoryTerms(criteria as MemoryCriteria),
  canSearch: (criteria) => (criteria as MemoryCriteria).speeds.length > 0,
  classify: (text, _price, criteria) => {
    const memory = criteria as MemoryCriteria;
    const lower = text.toLowerCase();
    const reasons: string[] = [];
    const isDdr4 = /ddr\s*4|pc4[-\s]?\d+/.test(lower);
    const layoutMatches = layoutEvidence(lower, memory);
    const laptop = /so[-\s]?dimm|sodimm|ノート(?:pc)?用|m471a/.test(lower);
    const server = /registered|rdimm|サーバー用|ecc\s*\/|m393a/.test(lower);
    const wholePc = /ゲーミングpc|デスクトップpc|パソコン本体/.test(lower) && !/デスクトップ(?:pc)?用/.test(lower);
    const junk = /ジャンク|動作未確認/.test(lower);
    const speed = detectedSpeed(lower);
    if (!isDdr4) reasons.push("DDR4を確認できない");
    if (!layoutMatches) reasons.push(`${memory.layout}を確認できない`);
    if (laptop) reasons.push("ノート用SO-DIMM");
    if (server) reasons.push("サーバー用メモリ");
    if (wholePc) reasons.push("メモリ単体ではなくPC本体");
    if (junk) reasons.push("ジャンク・動作未確認");
    if (speed && !memory.speeds.includes(speedBand(speed))) reasons.push("選択した速度帯ではない");
    if (!speed) reasons.push("速度を確認できない");
    const excluded = !isDdr4 || !layoutMatches || laptop || server || wholePc || junk || (!!speed && !memory.speeds.includes(speedBand(speed)));
    return { confidence: excluded ? "excluded" : speed ? "candidate" : "review", reasons };
  },
  resultTags: (criteria) => {
    const memory = criteria as MemoryCriteria;
    return [memory.generation, memory.layout, "デスクトップ用"];
  },
};

const keywordSources: Partial<Record<UsedSourceId, SourceBinding>> = {
  mercari: {
    summary: "販売中のみ",
    buildUrl: (criteria, token) => `https://jp.mercari.com/search?${new URLSearchParams({ keyword: (criteria as KeywordCriteria).keyword, status: "on_sale", ...(token ? { pcpf_token: token } : {}) })}`,
    shape: commonFleaShapes.mercari as SourceUrlShape,
  },
  "yahoo-flea": {
    summary: "販売中のみ",
    buildUrl: (criteria, token) => `https://paypayfleamarket.yahoo.co.jp/search/${encodeURIComponent((criteria as KeywordCriteria).keyword)}?${new URLSearchParams({ open: "1", ...(token ? { pcpf_token: token } : {}) })}`,
    shape: commonFleaShapes["yahoo-flea"] as SourceUrlShape,
  },
  rakuma: {
    summary: "販売中のみ",
    buildUrl: (criteria, token) => `https://fril.jp/s?${new URLSearchParams({ query: (criteria as KeywordCriteria).keyword, transaction: "selling", ...(token ? { pcpf_token: token } : {}) })}`,
    shape: commonFleaShapes.rakuma as SourceUrlShape,
  },
  janpara: {
    summary: "在庫あり（分類未指定・要確認）",
    buildUrl: (criteria, token) => `https://www.janpara.co.jp/sale/search/result/?${new URLSearchParams({ CHKOUTCOM: "1", KEYWORDS: (criteria as KeywordCriteria).keyword, ORDER: "3", ...(token ? { pcpf_token: token } : {}) })}`,
    shape: commonFleaShapes.janpara as SourceUrlShape,
  },
};

export const keywordProfile: PartProfile = {
  id: "keyword",
  modeLabel: "キーワード",
  heading: "探したいもの",
  title: "キーワード横断検索",
  description: "内容を判定せず、キーワード一致の販売中商品を安い順に並べる。",
  showCurrentSpec: false,
  fields: [
    { id: "keyword", kind: "text", label: "キーワード", placeholder: "例：Surface Pro 8" },
    { id: "priceMin", kind: "number", label: "価格の下限（任意）", placeholder: "例：20000" },
    { id: "priceMax", kind: "number", label: "価格の上限（任意）", placeholder: "例：150000" },
    { id: "excludeWords", kind: "text", label: "除外ワード（任意・空白区切り）", placeholder: "例：ケース フィルム" },
    { id: "excludeJunk", kind: "toggle", label: "ジャンク・動作未確認を除く" },
  ],
  defaults: { keyword: "", priceMin: "", priceMax: "", excludeWords: "", excludeJunk: true },
  sources: keywordSources,
  queryTerms: (criteria) => (criteria as KeywordCriteria).keyword,
  canSearch: (criteria) => (criteria as KeywordCriteria).keyword.trim().length > 0,
  classify: (text, price, criteria) => {
    const keyword = criteria as KeywordCriteria;
    const lower = text.normalize("NFKC").toLowerCase();
    const reasons: string[] = [];
    const words = keyword.excludeWords.map((word) => word.normalize("NFKC").toLowerCase()).filter(Boolean);
    const hit = words.filter((word) => lower.includes(word));
    if (hit.length > 0) reasons.push(`除外ワード: ${hit.join(", ")}`);
    const junk = keyword.excludeJunk && /ジャンク|動作未確認|未チェック|保証なし/.test(lower);
    if (junk) reasons.push("ジャンク・動作未確認");
    const belowMin = keyword.priceMin !== undefined && price < keyword.priceMin;
    const aboveMax = keyword.priceMax !== undefined && price > keyword.priceMax;
    if (belowMin) reasons.push(`下限${keyword.priceMin}円未満`);
    if (aboveMax) reasons.push(`上限${keyword.priceMax}円超`);
    const excluded = hit.length > 0 || junk || belowMin || aboveMax;
    return { confidence: excluded ? "excluded" : "unchecked", reasons };
  },
  resultTags: () => ["キーワード一致"],
};

const profiles: Record<ProfileId, PartProfile> = { memory: memoryProfile, keyword: keywordProfile };

export const profileIds: ProfileId[] = ["memory", "keyword"];

export function profileFor(id: ProfileId): PartProfile {
  return profiles[id];
}

export function sourcesFor(profile: PartProfile) {
  return usedSources.filter((source) => source.status === "connected" && profile.sources[source.id] !== undefined);
}

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function listValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/[,\s]/g, "");
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** 画面の入力値から、そのプロファイルの検索条件を作る。 */
export function criteriaFromValues(profile: PartProfile, values: FieldValues): PartCriteria {
  if (profile.id === "memory") {
    const layout = stringValue(values.layout, "32GB×2");
    const capacity = layout === "32GB×2" ? "64GB" : layout === "16GB×2" ? "32GB" : "16GB";
    return { profile: "memory", generation: "DDR4", capacity, layout, speeds: listValue(values.speeds), keyword: stringValue(values.keyword).trim() };
  }
  return {
    profile: "keyword",
    keyword: stringValue(values.keyword).trim(),
    priceMin: numberValue(values.priceMin),
    priceMax: numberValue(values.priceMax),
    excludeWords: stringValue(values.excludeWords).split(/[\s,、]+/).map((word) => word.trim()).filter(Boolean),
    excludeJunk: values.excludeJunk !== false,
  };
}
