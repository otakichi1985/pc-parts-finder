import { usedSources, type UsedSourceId } from "./sourceCatalog";

export type ProfileId = "memory" | "gpu" | "cpu" | "motherboard" | "ssd" | "keyword";
export type Confidence = "candidate" | "review" | "excluded" | "unchecked";
export type Generation = "DDR4" | "DDR5";

export type MemoryCriteria = {
  profile: "memory";
  generation: Generation;
  capacity: string;
  layout: string;
  speeds: string[];
  keyword: string;
};

export type GpuMaker = "any" | "nvidia" | "amd" | "intel";
export type GpuCriteria = {
  profile: "gpu";
  maker: GpuMaker;
  boardMaker: string;
  keyword: string;
  excludeJunk: boolean;
};

export type CpuMaker = "any" | "intel" | "amd";
export type CpuSeries =
  | "all"
  | "core-i5"
  | "core-i7"
  | "core-i9"
  | "core-ultra-5"
  | "core-ultra-7"
  | "core-ultra-9"
  | "xeon"
  | "ryzen-5"
  | "ryzen-7"
  | "ryzen-9"
  | "threadripper";
export type CpuCriteria = {
  profile: "cpu";
  maker: CpuMaker;
  series: CpuSeries;
  keyword: string;
  excludeJunk: boolean;
};

export type MotherboardSocket = "any" | "LGA1700" | "LGA1851" | "AM5" | "AM4";
export type MotherboardCriteria = {
  profile: "motherboard";
  socket: MotherboardSocket;
  keyword: string;
  excludeJunk: boolean;
};

export type SsdType = "any" | "nvme" | "sata";
export type SsdCriteria = {
  profile: "ssd";
  type: SsdType;
  capacity: string;
  keyword: string;
  excludeJunk: boolean;
};

export type KeywordCriteria = {
  profile: "keyword";
  keyword: string;
  priceMin?: number;
  priceMax?: number;
  excludeWords: string[];
  excludeJunk: boolean;
};

export type PartCriteria =
  | MemoryCriteria
  | GpuCriteria
  | CpuCriteria
  | MotherboardCriteria
  | SsdCriteria
  | KeywordCriteria;

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
  applyTo?: (criteria: PartCriteria) => boolean;
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
  judgementNote?: string;
  canSearchHint: string;
  fields: FieldDef[] | ((values: FieldValues) => FieldDef[]);
  defaults: FieldValues;
  showCurrentSpec: boolean;
  reviewToggle: boolean;
  sources: Partial<Record<UsedSourceId, SourceBinding>>;
  queryTerms(criteria: PartCriteria): string;
  canSearch(criteria: PartCriteria): boolean;
  classify(text: string, price: number, criteria: PartCriteria): Verdict;
  resultTags(criteria: PartCriteria): string[];
  sourceNote?: (criteria: PartCriteria) => string | undefined;
};

/* ------------------------------------------------------------------ */
/* 共通の小さな処理                                                     */
/* ------------------------------------------------------------------ */

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = (text: string) => text.normalize("NFKC").toLowerCase();
const terms = (parts: (string | undefined)[]) => parts.map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
const JUNK = /ジャンク|動作未確認|未チェック|保証なし|現状品|部品取り/;
const WHOLE_PC = /pc本体|パソコン本体|デスクトップpc本体|ゲーミングpc本体|btoパソコン|中古pc|ノートpc|ノートパソコン|ゲーミングノート/;

function junkReason(lower: string, enabled: boolean, reasons: string[]) {
  if (!enabled || !JUNK.test(lower)) return false;
  reasons.push("ジャンク・動作未確認");
  return true;
}

/* ------------------------------------------------------------------ */
/* メモリ                                                              */
/* ------------------------------------------------------------------ */

const DDR4_SPEEDS = ["2400", "2666", "3200"];
const DDR5_SPEEDS = ["4800", "5200", "6000"];

export function memorySpeedValues(generation: Generation): string[] {
  return generation === "DDR5" ? [...DDR5_SPEEDS] : [...DDR4_SPEEDS];
}

function memorySpeedOptions(generation: Generation): { value: string; label: string }[] {
  if (generation === "DDR5") {
    return [
      { value: "4800", label: "4800" },
      { value: "5200", label: "5200～5600" },
      { value: "6000", label: "6000以上" },
    ];
  }
  return [
    { value: "2400", label: "2400" },
    { value: "2666", label: "2666～3000" },
    { value: "3200", label: "3200以上" },
  ];
}

const DDR4_LAYOUTS = ["64GB×2", "32GB×4", "32GB×2", "16GB×2", "8GB×2"];
const DDR5_LAYOUTS = ["64GB×4", "64GB×2", "32GB×4", "48GB×2", "32GB×2", "16GB×2", "8GB×2"];
const DEFAULT_MEMORY_LAYOUT = "32GB×2";

export function memoryLayoutValues(generation: Generation): string[] {
  return generation === "DDR5" ? [...DDR5_LAYOUTS] : [...DDR4_LAYOUTS];
}

function memoryLayoutOptions(generation: Generation): { value: string; label: string }[] {
  return memoryLayoutValues(generation).map((value) => ({
    value,
    label: `${value}（${capacityForLayout(value)}）`,
  }));
}

function layoutEvidence(text: string, criteria: MemoryCriteria) {
  const [moduleSize, count] = criteria.layout.split(/[×xX*]/).map((part) => part.replace(/GB/i, "").trim());
  if (!moduleSize || !count) return false;
  const size = escapeRegExp(moduleSize);
  const qty = escapeRegExp(count);
  return new RegExp(`${size}\\s*gb\\s*(?:[x×*]\\s*${qty}|${qty}\\s*枚)|${qty}\\s*[x×*]\\s*${size}\\s*gb`, "i").test(text);
}

function detectedSpeed(text: string, generation: Generation) {
  const nearby = () => {
    const speeds =
      generation === "DDR5"
        ? "4800|5200|5600|6000|6400|6800|7000|7200|7600|8000"
        : "2133|2400|2666|2933|3000|3200|3600|3733|4000|4266|4400|4600|4800";
    const found = text.match(
      new RegExp(`ddr\\s*${generation === "DDR5" ? 5 : 4}[^\\n]{0,20}?(?:^|[^\\d])(${speeds})(?!\\s*(?:円|gb|g\\b))`, "i"),
    )?.[1];
    return found ? Number(found) : undefined;
  };
  if (generation === "DDR5") {
    const direct = text.match(/ddr\s*5[-\s]?(4800|5200|5600|6000|6400|6800|7000|7200|7600|8000)/i)?.[1];
    if (direct) return Number(direct);
    const pc5 = Number(text.match(/pc5[-\s]?(38400|41600|44800|48000|51200|56000|57600|60800|64000)/i)?.[1]);
    return ({ 38400: 4800, 41600: 5200, 44800: 5600, 48000: 6000, 51200: 6400, 56000: 7000, 57600: 7200, 60800: 7600, 64000: 8000 } as Record<number, number>)[pc5] ?? nearby();
  }
  const direct = text.match(/ddr\s*4[-\s]?(2133|2400|2666|2933|3000|3200|3600|3733|4000|4266|4400|4600|4800)/i)?.[1];
  if (direct) return Number(direct);
  const pc4 = Number(text.match(/pc4[-\s]?(17000|19200|21300|23400|24000|25600|28800|29900|32000|34100|35200|36800|38400)/i)?.[1]);
  return ({ 17000: 2133, 19200: 2400, 21300: 2666, 23400: 2933, 24000: 3000, 25600: 3200, 28800: 3600, 29900: 3733, 32000: 4000, 34100: 4266, 35200: 4400, 36800: 4600, 38400: 4800 } as Record<number, number>)[pc4] ?? nearby();
}

function speedBand(speed: number, generation: Generation) {
  if (generation === "DDR5") {
    if (speed >= 6000) return "6000";
    if (speed >= 5200) return "5200";
    if (speed >= 4800) return "4800";
    return "below-4800";
  }
  if (speed >= 3200) return "3200";
  if (speed >= 2666) return "2666";
  if (speed >= 2400) return "2400";
  return "below-2400";
}

const memoryTerms = (criteria: MemoryCriteria) =>
  terms([criteria.generation, criteria.layout, criteria.capacity, "デスクトップ用", criteria.keyword]);

function memoryFields(values: FieldValues): FieldDef[] {
  const generation: Generation = stringValue(values.generation, "DDR4") === "DDR5" ? "DDR5" : "DDR4";
  return [
    {
      id: "generation",
      kind: "select",
      label: "規格",
      options: [
        { value: "DDR4", label: "DDR4" },
        { value: "DDR5", label: "DDR5" },
      ],
    },
    {
      id: "layout",
      kind: "select",
      label: "容量・枚数",
      options: memoryLayoutOptions(generation),
    },
    { id: "speeds", kind: "checks", label: `速度帯（${generation}）`, options: memorySpeedOptions(generation) },
    { id: "keyword", kind: "text", label: "メーカー・型番（任意）", placeholder: "例：Crucial" },
  ];
}

const commonFleaShapes: Partial<Record<UsedSourceId, SourceUrlShape>> = {
  mercari: { host: "jp.mercari.com", path: "/search", required: [["status", "on_sale"]] },
  "yahoo-flea": { host: "paypayfleamarket.yahoo.co.jp", path: /^\/search\//, required: [["open", "1"]] },
  rakuma: { host: "fril.jp", path: "/s", required: [["transaction", "selling"]] },
  janpara: { host: "www.janpara.co.jp", path: "/sale/search/result/", required: [["CHKOUTCOM", "1"]] },
};

/** キーワード検索ができる4サイト。カテゴリ固定URLのパソコン工房・ハードオフは含めない。 */
function fleaSources(termsFor: (criteria: PartCriteria) => string): Partial<Record<UsedSourceId, SourceBinding>> {
  return {
    mercari: {
      summary: "販売中のみ",
      buildUrl: (criteria, token) =>
        `https://jp.mercari.com/search?${new URLSearchParams({ keyword: termsFor(criteria), status: "on_sale", ...(token ? { pcpf_token: token } : {}) })}`,
      shape: commonFleaShapes.mercari as SourceUrlShape,
    },
    "yahoo-flea": {
      summary: "販売中のみ",
      buildUrl: (criteria, token) =>
        `https://paypayfleamarket.yahoo.co.jp/search/${encodeURIComponent(termsFor(criteria))}?${new URLSearchParams({ open: "1", ...(token ? { pcpf_token: token } : {}) })}`,
      shape: commonFleaShapes["yahoo-flea"] as SourceUrlShape,
    },
    rakuma: {
      summary: "販売中のみ",
      buildUrl: (criteria, token) =>
        `https://fril.jp/s?${new URLSearchParams({ query: termsFor(criteria), transaction: "selling", ...(token ? { pcpf_token: token } : {}) })}`,
      shape: commonFleaShapes.rakuma as SourceUrlShape,
    },
    janpara: {
      summary: "在庫あり（在庫確認済み）",
      buildUrl: (criteria, token) =>
        `https://www.janpara.co.jp/sale/search/result/?${new URLSearchParams({ CHKOUTCOM: "1", KEYWORDS: termsFor(criteria), ORDER: "3", ...(token ? { pcpf_token: token } : {}) })}`,
      shape: commonFleaShapes.janpara as SourceUrlShape,
    },
  };
}

const memorySources: Partial<Record<UsedSourceId, SourceBinding>> = {
  ...fleaSources((criteria) => memoryTerms(criteria as MemoryCriteria)),
  janpara: {
    summary: "在庫あり＋メモリカテゴリ",
    buildUrl: (criteria, token) => {
      const memory = criteria as MemoryCriteria;
      return `https://www.janpara.co.jp/sale/search/result/?${new URLSearchParams({ CHKOUTCOM: "1", KEYWORDS: `${memory.generation} デスクトップ ${memory.layout}`, OUTCLSCODE: "8", ORDER: "3", ...(token ? { pcpf_token: token } : {}) })}`;
    },
    shape: commonFleaShapes.janpara as SourceUrlShape,
  },
  "pc-koubou": {
    summary: "DDR4・32GB×2カテゴリ",
    applyTo: (criteria) =>
      criteria.profile === "memory" && criteria.generation === "DDR4" && criteria.layout === "32GB×2",
    buildUrl: (_criteria, token) =>
      `https://www.pc-koubou.jp/pc/used_memory_d_ddr4_32gb.php${token ? `?pcpf_token=${encodeURIComponent(token)}` : ""}`,
    shape: { host: "www.pc-koubou.jp", path: "/pc/used_memory_d_ddr4_32gb.php", required: [] },
  },
  hardoff: {
    summary: "DDR4カテゴリ",
    applyTo: (criteria) => criteria.profile === "memory" && criteria.generation === "DDR4",
    buildUrl: (_criteria, token) =>
      `https://netmall.hardoff.co.jp/cate/00010002000500090001/${token ? `?pcpf_token=${encodeURIComponent(token)}` : ""}`,
    shape: { host: "netmall.hardoff.co.jp", path: "/cate/00010002000500090001/", required: [] },
  },
};

export const memoryProfile: PartProfile = {
  id: "memory",
  modeLabel: "メモリ",
  heading: "欲しいメモリ",
  title: "中古メモリ横断検索",
  description: "規格・容量・速度が合うデスクトップ用メモリを、条件に合わない出品を除いて比較する。",
  canSearchHint: "速度帯を1つ以上選んでください",
  fields: memoryFields,
  defaults: { generation: "DDR4", layout: DEFAULT_MEMORY_LAYOUT, speeds: memorySpeedValues("DDR4"), keyword: "" },
  showCurrentSpec: true,
  reviewToggle: true,
  sources: memorySources,
  queryTerms: (criteria) => memoryTerms(criteria as MemoryCriteria),
  canSearch: (criteria) => (criteria as MemoryCriteria).speeds.length > 0,
  classify: (text, _price, criteria) => {
    const memory = criteria as MemoryCriteria;
    const lower = normalize(text);
    const reasons: string[] = [];
    const isDdr4 = /ddr\s*4|pc4[-\s]?\d+/.test(lower);
    const isDdr5 = /ddr\s*5|pc5[-\s]?\d+/.test(lower);
    const isGeneration = memory.generation === "DDR4" ? isDdr4 : isDdr5;
    const otherGeneration = memory.generation === "DDR4" ? isDdr5 : isDdr4;
    const layoutMatches = layoutEvidence(lower, memory);
    const laptop = /so[-\s]?dimm|sodimm|ノート(?:pc)?用|m471a/.test(lower);
    const server = /registered|rdimm|サーバー用|ecc\s*\/|m393a/.test(lower);
    const wholePc = /ゲーミングpc|デスクトップpc|パソコン本体/.test(lower) && !/デスクトップ(?:pc)?用/.test(lower);
    const junk = JUNK.test(lower);
    const speed = detectedSpeed(lower, memory.generation);
    if (!isGeneration) reasons.push(otherGeneration ? `${memory.generation === "DDR4" ? "DDR5" : "DDR4"}の出品` : `${memory.generation}を確認できない`);
    if (!layoutMatches) reasons.push(`${memory.layout}を確認できない`);
    if (laptop) reasons.push("ノート用SO-DIMM");
    if (server) reasons.push("サーバー用メモリ");
    if (wholePc) reasons.push("メモリ単体ではなくPC本体");
    if (junk) reasons.push("ジャンク・動作未確認");
    if (speed && !memory.speeds.includes(speedBand(speed, memory.generation))) reasons.push("選択した速度帯ではない");
    if (!speed) reasons.push("速度を確認できない");
    const excluded =
      !isGeneration || !layoutMatches || laptop || server || wholePc || junk || (!!speed && !memory.speeds.includes(speedBand(speed, memory.generation)));
    return { confidence: excluded ? "excluded" : speed ? "candidate" : "review", reasons };
  },
  resultTags: (criteria) => {
    const memory = criteria as MemoryCriteria;
    return [memory.generation, memory.layout, "デスクトップ用"];
  },
  sourceNote: (criteria) => {
    if (criteria.profile !== "memory") return undefined;
    if (criteria.generation === "DDR5") {
      return "DDR5では、DDR4専用カテゴリのパソコン工房・ハードオフを検索対象から外しています。";
    }
    if (criteria.layout !== "32GB×2") {
      return "パソコン工房は32GB×2のカテゴリページのみ対応のため、検索対象から外しています。";
    }
    return undefined;
  },
};

/* ------------------------------------------------------------------ */
/* グラフィックボード                                                   */
/* ------------------------------------------------------------------ */

const GPU_MAKER_LABELS: Record<GpuMaker, string> = {
  any: "指定なし",
  nvidia: "NVIDIA GeForce",
  amd: "AMD Radeon",
  intel: "Intel Arc",
};

const GPU_MAKER_TERMS: Record<GpuMaker, string> = {
  any: "グラフィックボード",
  nvidia: "GeForce",
  amd: "Radeon",
  intel: "Intel Arc",
};

const gpuTerms = (criteria: GpuCriteria) => terms([GPU_MAKER_TERMS[criteria.maker], criteria.boardMaker, criteria.keyword]);

function gpuClassify(text: string, criteria: GpuCriteria): Verdict {
  const lower = normalize(text);
  const reasons: string[] = [];
  const junk = junkReason(lower, criteria.excludeJunk, reasons);
  const laptop = /ノートpc|ノートパソコン|ゲーミングノート|laptop\s*gpu|モバイル版/.test(lower);
  if (laptop) reasons.push("ノートPC向け");
  const wholePc = /pc本体|パソコン本体|デスクトップpc本体|ゲーミングpc本体|btoパソコン/.test(lower);
  if (wholePc) reasons.push("PC本体");
  const external = /外付けgpu|egpu|グラフィックボックス/.test(lower);
  if (external) reasons.push("外付けGPU");
  const accessory = /水冷ブロック|water\s*block|ライザーケーブル|ライザーカード|サポートステイ/.test(lower);
  if (accessory) reasons.push("グラフィックボード本体ではない");

  const nvidia = /nvidia|geforce|\brtx\s?\d{3,4}|\bgtx\s?\d{3,4}/.test(lower);
  const amd = /\bamd\b|radeon|\brx\s?\d{3,4}/.test(lower);
  const intel = /intel\s*arc|\barc\s?[ab]\d{3}/.test(lower);
  let mismatch = false;
  if (criteria.maker === "nvidia" && (amd || intel) && !nvidia) {
    reasons.push("NVIDIA製ではない");
    mismatch = true;
  }
  if (criteria.maker === "amd" && (nvidia || intel) && !amd) {
    reasons.push("AMD製ではない");
    mismatch = true;
  }
  if (criteria.maker === "intel" && (nvidia || amd) && !intel) {
    reasons.push("Intel製ではない");
    mismatch = true;
  }

  const categoryEvidence = /グラフィックボード|ビデオカード|\bgpu\b/.test(lower);
  const makerEvidence =
    criteria.maker === "any" ? nvidia || amd || intel || categoryEvidence : criteria.maker === "nvidia" ? nvidia : criteria.maker === "amd" ? amd : intel;
  if (!makerEvidence) reasons.push("メーカーを確認できない");
  const blocked = junk || laptop || wholePc || external || accessory || mismatch;
  return { confidence: blocked ? "excluded" : makerEvidence ? "candidate" : "review", reasons };
}

export const gpuProfile: PartProfile = {
  id: "gpu",
  modeLabel: "グラフィックボード",
  heading: "欲しいグラフィックボード",
  title: "中古グラフィックボード横断検索",
  description: "メーカーと型番を指定して、販売中のグラフィックボードを比較する。",
  judgementNote: "出品のタイトルと説明からメーカーを判定しています。判定できない出品は「要確認」に分けています。",
  canSearchHint: "検索条件を確認してください",
  fields: [
    {
      id: "maker",
      kind: "select",
      label: "メーカー",
      options: (Object.keys(GPU_MAKER_LABELS) as GpuMaker[]).map((value) => ({ value, label: GPU_MAKER_LABELS[value] })),
    },
    { id: "boardMaker", kind: "text", label: "ボードメーカー（任意）", placeholder: "例：ASUS、MSI" },
    { id: "keyword", kind: "text", label: "型番（任意）", placeholder: "例：RTX 4070" },
    { id: "excludeJunk", kind: "toggle", label: "ジャンクを除く" },
  ],
  defaults: { maker: "any", boardMaker: "", keyword: "", excludeJunk: true },
  showCurrentSpec: false,
  reviewToggle: true,
  sources: fleaSources((criteria) => gpuTerms(criteria as GpuCriteria)),
  queryTerms: (criteria) => gpuTerms(criteria as GpuCriteria),
  canSearch: () => true,
  classify: (text, _price, criteria) => gpuClassify(text, criteria as GpuCriteria),
  resultTags: (criteria) => {
    const gpu = criteria as GpuCriteria;
    return gpu.maker === "any" ? ["グラフィックボード"] : ["グラフィックボード", GPU_MAKER_LABELS[gpu.maker]];
  },
};

/* ------------------------------------------------------------------ */
/* CPU                                                                 */
/* ------------------------------------------------------------------ */

const CPU_MAKER_LABELS: Record<CpuMaker, string> = { any: "指定なし", intel: "Intel", amd: "AMD" };

const CPU_SERIES_OPTIONS: Record<Exclude<CpuMaker, "any">, { value: CpuSeries; label: string }[]> = {
  intel: [
    { value: "core-i5", label: "Core i5" },
    { value: "core-i7", label: "Core i7" },
    { value: "core-i9", label: "Core i9" },
    { value: "core-ultra-5", label: "Core Ultra 5" },
    { value: "core-ultra-7", label: "Core Ultra 7" },
    { value: "core-ultra-9", label: "Core Ultra 9" },
    { value: "xeon", label: "Xeon" },
  ],
  amd: [
    { value: "ryzen-5", label: "Ryzen 5" },
    { value: "ryzen-7", label: "Ryzen 7" },
    { value: "ryzen-9", label: "Ryzen 9" },
    { value: "threadripper", label: "Threadripper" },
  ],
};

const CPU_SERIES_LABELS: Record<CpuSeries, string> = {
  all: "すべて",
  "core-i5": "Core i5",
  "core-i7": "Core i7",
  "core-i9": "Core i9",
  "core-ultra-5": "Core Ultra 5",
  "core-ultra-7": "Core Ultra 7",
  "core-ultra-9": "Core Ultra 9",
  xeon: "Xeon",
  "ryzen-5": "Ryzen 5",
  "ryzen-7": "Ryzen 7",
  "ryzen-9": "Ryzen 9",
  threadripper: "Threadripper",
};

function cpuSeriesOptions(maker: CpuMaker) {
  return [{ value: "all" as CpuSeries, label: "すべて" }, ...(maker === "any" ? [] : CPU_SERIES_OPTIONS[maker])];
}

function cpuSeriesValues(maker: CpuMaker): CpuSeries[] {
  return cpuSeriesOptions(maker).map((option) => option.value);
}

function cpuFields(values: FieldValues): FieldDef[] {
  const maker: CpuMaker = stringValue(values.maker, "any") === "intel" ? "intel" : stringValue(values.maker, "any") === "amd" ? "amd" : "any";
  return [
    {
      id: "maker",
      kind: "select",
      label: "メーカー",
      options: (Object.keys(CPU_MAKER_LABELS) as CpuMaker[]).map((value) => ({ value, label: CPU_MAKER_LABELS[value] })),
    },
    { id: "series", kind: "select", label: "シリーズ", options: cpuSeriesOptions(maker), disabled: maker === "any" },
    { id: "keyword", kind: "text", label: "型番（任意）", placeholder: "例：9800X3D" },
    { id: "excludeJunk", kind: "toggle", label: "ジャンクを除く" },
  ];
}

function cpuTerms(criteria: CpuCriteria) {
  const makerTerm = criteria.maker === "any" ? "CPU" : criteria.maker === "amd" ? "AMD Ryzen" : "Intel CPU";
  const seriesTerm = criteria.series === "all" ? "" : CPU_SERIES_LABELS[criteria.series];
  return terms([seriesTerm || makerTerm, criteria.keyword]);
}

function cpuSeriesHits(lower: string): Set<CpuSeries> {
  const hits = new Set<CpuSeries>();
  if (/core\s*ultra\s*5|ultra\s*5/.test(lower)) hits.add("core-ultra-5");
  if (/core\s*ultra\s*7|ultra\s*7/.test(lower)) hits.add("core-ultra-7");
  if (/core\s*ultra\s*9|ultra\s*9/.test(lower)) hits.add("core-ultra-9");
  if (/core\s*i5|i5[-\s]?\d{4,5}/.test(lower)) hits.add("core-i5");
  if (/core\s*i7|i7[-\s]?\d{4,5}/.test(lower)) hits.add("core-i7");
  if (/core\s*i9|i9[-\s]?\d{4,5}/.test(lower)) hits.add("core-i9");
  if (/xeon/.test(lower)) hits.add("xeon");
  if (/ryzen\s*5|r5\s?\d{4}/.test(lower)) hits.add("ryzen-5");
  if (/ryzen\s*7|r7\s?\d{4}/.test(lower)) hits.add("ryzen-7");
  if (/ryzen\s*9|r9\s?\d{4}/.test(lower)) hits.add("ryzen-9");
  if (/threadripper/.test(lower)) hits.add("threadripper");
  return hits;
}

function cpuClassify(text: string, criteria: CpuCriteria): Verdict {
  const lower = normalize(text);
  const reasons: string[] = [];
  const junk = junkReason(lower, criteria.excludeJunk, reasons);
  const cooler = /cpuクーラー|クーラー|cooler|グリス|シリコングリス|リテールクーラー|ヒートシンク|水冷/.test(lower);
  if (cooler) reasons.push("CPU本体ではなく冷却用品");
  const board = /マザーボード|motherboard/.test(lower);
  if (board) reasons.push("マザーボード・セット品");
  const wholePc = WHOLE_PC.test(lower);
  if (wholePc) reasons.push("PC本体");

  const intelEvidence = /intel|core\s*(?:i[3579]|ultra)|xeon|pentium|celeron/.test(lower);
  const amdEvidence = /\bamd\b|ryzen|threadripper|epyc|athlon/.test(lower);
  let mismatch = false;
  if (criteria.maker === "intel" && amdEvidence && !intelEvidence) {
    reasons.push("Intel製ではない");
    mismatch = true;
  }
  if (criteria.maker === "amd" && intelEvidence && !amdEvidence) {
    reasons.push("AMD製ではない");
    mismatch = true;
  }

  const hits = cpuSeriesHits(lower);
  let seriesMismatch = false;
  if (criteria.series !== "all") {
    if (!hits.has(criteria.series)) {
      if (hits.size > 0) {
        reasons.push("選択したシリーズではない");
        seriesMismatch = true;
      } else {
        reasons.push("シリーズを確認できない");
      }
    }
  }

  const makerEvidence = criteria.maker === "any" ? intelEvidence || amdEvidence : criteria.maker === "intel" ? intelEvidence : amdEvidence;
  if (!makerEvidence) reasons.push("CPUを確認できない");
  const blocked = junk || cooler || board || wholePc || mismatch || seriesMismatch;
  const seriesOk = criteria.series === "all" || hits.has(criteria.series);
  return { confidence: blocked ? "excluded" : makerEvidence && seriesOk ? "candidate" : "review", reasons };
}

export const cpuProfile: PartProfile = {
  id: "cpu",
  modeLabel: "CPU",
  heading: "欲しいCPU",
  title: "中古CPU横断検索",
  description: "メーカーとシリーズを選び、販売中のCPUを比較する。冷却用品やセット品は除く。",
  judgementNote: "出品のタイトルと説明からメーカー・シリーズを判定しています。判定できない出品は「要確認」に分けています。",
  canSearchHint: "検索条件を確認してください",
  fields: cpuFields,
  defaults: { maker: "any", series: "all", keyword: "", excludeJunk: true },
  showCurrentSpec: false,
  reviewToggle: true,
  sources: fleaSources((criteria) => cpuTerms(criteria as CpuCriteria)),
  queryTerms: (criteria) => cpuTerms(criteria as CpuCriteria),
  canSearch: () => true,
  classify: (text, _price, criteria) => cpuClassify(text, criteria as CpuCriteria),
  resultTags: (criteria) => {
    const cpu = criteria as CpuCriteria;
    const tags = ["CPU"];
    if (cpu.maker !== "any") tags.push(CPU_MAKER_LABELS[cpu.maker]);
    if (cpu.series !== "all") tags.push(CPU_SERIES_LABELS[cpu.series]);
    return tags;
  },
};

/* ------------------------------------------------------------------ */
/* マザーボード                                                        */
/* ------------------------------------------------------------------ */

const MOTHERBOARD_SOCKET_LABELS: Record<MotherboardSocket, string> = {
  any: "指定なし",
  LGA1700: "Intel LGA1700",
  LGA1851: "Intel LGA1851",
  AM5: "AMD AM5",
  AM4: "AMD AM4",
};

const MOTHERBOARD_SOCKET_TERMS: Record<MotherboardSocket, string> = {
  any: "マザーボード",
  LGA1700: "LGA1700 マザーボード",
  LGA1851: "LGA1851 マザーボード",
  AM5: "AM5 マザーボード",
  AM4: "AM4 マザーボード",
};

const MOTHERBOARD_SOCKET_PATTERNS: Record<Exclude<MotherboardSocket, "any">, RegExp> = {
  LGA1700: /lga\s?1700|b760|z790|b660|z690|h610|h770|w680/,
  LGA1851: /lga\s?1851|z890|b860|h860|w880/,
  AM5: /am5|b650|x670|a620|b850|x870|b840/,
  AM4: /am4|b550|x570|a520|b450|x470|a320/,
};

function motherboardTerms(criteria: MotherboardCriteria) {
  return terms([MOTHERBOARD_SOCKET_TERMS[criteria.socket], criteria.keyword]);
}

function motherboardClassify(text: string, criteria: MotherboardCriteria): Verdict {
  const lower = normalize(text);
  const reasons: string[] = [];
  const junk = junkReason(lower, criteria.excludeJunk, reasons);
  const wholePc = WHOLE_PC.test(lower);
  if (wholePc) reasons.push("PC本体");
  const cooler = /cpuクーラー|クーラー|cooler|グリス/.test(lower);
  if (cooler) reasons.push("冷却用品");

  const boardEvidence = /マザーボード|motherboard|\bmb\b|チップセット|atx|micro-?atx|mini-?itx/.test(lower);
  let socketEvidence = boardEvidence;
  let socketMismatch = false;
  if (criteria.socket !== "any") {
    socketEvidence = MOTHERBOARD_SOCKET_PATTERNS[criteria.socket].test(lower);
    const otherHit = (Object.keys(MOTHERBOARD_SOCKET_PATTERNS) as Exclude<MotherboardSocket, "any">[])
      .filter((socket) => socket !== criteria.socket)
      .some((socket) => MOTHERBOARD_SOCKET_PATTERNS[socket].test(lower));
    if (!socketEvidence && otherHit) {
      reasons.push("選択したソケットではない");
      socketMismatch = true;
    } else if (!socketEvidence) {
      reasons.push("ソケットを確認できない");
    }
  }
  if (!boardEvidence) reasons.push("マザーボードを確認できない");
  const blocked = junk || wholePc || cooler || socketMismatch;
  return { confidence: blocked ? "excluded" : boardEvidence && socketEvidence ? "candidate" : "review", reasons };
}

export const motherboardProfile: PartProfile = {
  id: "motherboard",
  modeLabel: "マザーボード",
  heading: "欲しいマザーボード",
  title: "中古マザーボード横断検索",
  description: "CPUソケットを選び、販売中のマザーボードを比較する。",
  judgementNote: "出品のタイトルと説明からソケットを判定しています。判定できない出品は「要確認」に分けています。",
  canSearchHint: "検索条件を確認してください",
  fields: [
    {
      id: "socket",
      kind: "select",
      label: "CPUソケット",
      options: (Object.keys(MOTHERBOARD_SOCKET_LABELS) as MotherboardSocket[]).map((value) => ({ value, label: MOTHERBOARD_SOCKET_LABELS[value] })),
    },
    { id: "keyword", kind: "text", label: "チップセット・型番（任意）", placeholder: "例：B650" },
    { id: "excludeJunk", kind: "toggle", label: "ジャンクを除く" },
  ],
  defaults: { socket: "any", keyword: "", excludeJunk: true },
  showCurrentSpec: false,
  reviewToggle: true,
  sources: fleaSources((criteria) => motherboardTerms(criteria as MotherboardCriteria)),
  queryTerms: (criteria) => motherboardTerms(criteria as MotherboardCriteria),
  canSearch: () => true,
  classify: (text, _price, criteria) => motherboardClassify(text, criteria as MotherboardCriteria),
  resultTags: (criteria) => {
    const board = criteria as MotherboardCriteria;
    return board.socket === "any" ? ["マザーボード"] : ["マザーボード", MOTHERBOARD_SOCKET_LABELS[board.socket]];
  },
};

/* ------------------------------------------------------------------ */
/* SSD                                                                 */
/* ------------------------------------------------------------------ */

const SSD_TYPE_LABELS: Record<SsdType, string> = { any: "指定なし", nvme: "NVMe (M.2)", sata: "SATA (2.5インチ)" };
const SSD_TYPE_TERMS: Record<SsdType, string> = { any: "SSD", nvme: "NVMe SSD", sata: "SATA SSD" };
const SSD_CAPACITY_LABELS: Record<string, string> = { any: "指定なし", "500GB": "500GB", "1TB": "1TB", "2TB": "2TB", "4TB": "4TB" };
const SSD_CAPACITY_PATTERNS: Record<string, RegExp> = {
  "500GB": /(?:500|512)\s*gb|500\s*g\b/,
  "1TB": /1\s*tb|1000\s*gb|1024\s*gb/,
  "2TB": /2\s*tb|2000\s*gb|2048\s*gb/,
  "4TB": /4\s*tb|4000\s*gb|4096\s*gb/,
};

function ssdTerms(criteria: SsdCriteria) {
  return terms([SSD_TYPE_TERMS[criteria.type], criteria.capacity === "any" ? "" : criteria.capacity, criteria.keyword]);
}

function ssdClassify(text: string, criteria: SsdCriteria): Verdict {
  const lower = normalize(text);
  const reasons: string[] = [];
  const junk = junkReason(lower, criteria.excludeJunk, reasons);
  const hdd = /hdd|ハードディスク/.test(lower) && !/ssd/.test(lower);
  if (hdd) reasons.push("HDD");
  const enclosure = /ssdケース|外付けケース|usb\d|変換アダプタ|sataケーブル/.test(lower);
  if (enclosure) reasons.push("SSD本体ではなくケース・付属品");

  const evidence = /ssd|nvme|m\.?\s?2|ソリッドステート|シリコンディスク/.test(lower);
  const nvme = /nvme|m\.?\s?2/.test(lower);
  const sata = /sata|2\.5\s*(?:インチ|inch)/.test(lower);
  let typeMismatch = false;
  if (criteria.type === "nvme" && sata && !nvme) {
    reasons.push("SATAの出品");
    typeMismatch = true;
  }
  if (criteria.type === "sata" && nvme && !sata) {
    reasons.push("NVMeの出品");
    typeMismatch = true;
  }

  let capacityMismatch = false;
  if (criteria.capacity !== "any") {
    const selected = SSD_CAPACITY_PATTERNS[criteria.capacity]?.test(lower) ?? false;
    const other = Object.entries(SSD_CAPACITY_PATTERNS)
      .filter(([capacity]) => capacity !== criteria.capacity)
      .some(([, pattern]) => pattern.test(lower));
    if (!selected) {
      if (other) {
        reasons.push("選択した容量ではない");
        capacityMismatch = true;
      } else {
        reasons.push("容量を確認できない");
      }
    }
  }

  if (!evidence) reasons.push("SSDを確認できない");
  const typeOk = criteria.type === "any" || (criteria.type === "nvme" ? nvme : sata);
  const capacityKnown = criteria.capacity === "any" || (SSD_CAPACITY_PATTERNS[criteria.capacity]?.test(lower) ?? false);
  const blocked = junk || hdd || enclosure || typeMismatch || capacityMismatch;
  return { confidence: blocked ? "excluded" : evidence && typeOk && capacityKnown ? "candidate" : "review", reasons };
}

export const ssdProfile: PartProfile = {
  id: "ssd",
  modeLabel: "SSD",
  heading: "欲しいSSD",
  title: "中古SSD横断検索",
  description: "接続方式と容量を選び、販売中のSSDを比較する。",
  judgementNote: "出品のタイトルと説明から接続方式・容量を判定しています。容量は商品ページでも確認してください。",
  canSearchHint: "検索条件を確認してください",
  fields: [
    {
      id: "type",
      kind: "select",
      label: "接続方式",
      options: (Object.keys(SSD_TYPE_LABELS) as SsdType[]).map((value) => ({ value, label: SSD_TYPE_LABELS[value] })),
    },
    {
      id: "capacity",
      kind: "select",
      label: "容量",
      options: (Object.keys(SSD_CAPACITY_LABELS) as string[]).map((value) => ({ value, label: SSD_CAPACITY_LABELS[value] })),
    },
    { id: "keyword", kind: "text", label: "メーカー・型番（任意）", placeholder: "例：WD SN850X" },
    { id: "excludeJunk", kind: "toggle", label: "ジャンクを除く" },
  ],
  defaults: { type: "nvme", capacity: "any", keyword: "", excludeJunk: true },
  showCurrentSpec: false,
  reviewToggle: true,
  sources: fleaSources((criteria) => ssdTerms(criteria as SsdCriteria)),
  queryTerms: (criteria) => ssdTerms(criteria as SsdCriteria),
  canSearch: () => true,
  classify: (text, _price, criteria) => ssdClassify(text, criteria as SsdCriteria),
  resultTags: (criteria) => {
    const ssd = criteria as SsdCriteria;
    const tags = ["SSD", SSD_TYPE_LABELS[ssd.type]];
    if (ssd.capacity !== "any") tags.push(ssd.capacity);
    return tags;
  },
};

/* ------------------------------------------------------------------ */
/* キーワード                                                          */
/* ------------------------------------------------------------------ */

const keywordSources = fleaSources((criteria) => (criteria as KeywordCriteria).keyword);

export const keywordProfile: PartProfile = {
  id: "keyword",
  modeLabel: "キーワード",
  heading: "探したいもの",
  title: "キーワード横断検索",
  description: "パーツの種類を問わず、キーワードに一致する販売中商品を価格の安い順に並べる。",
  judgementNote: "内容の判定はしていません。キーワードに一致した販売中の出品を価格の安い順に並べています。",
  canSearchHint: "キーワードを入力してください",
  fields: [
    { id: "keyword", kind: "text", label: "キーワード", placeholder: "例：Surface Pro 8" },
    { id: "priceMin", kind: "number", label: "価格の下限（任意）", placeholder: "例：20000" },
    { id: "priceMax", kind: "number", label: "価格の上限（任意）", placeholder: "例：150000" },
    { id: "excludeWords", kind: "text", label: "除外ワード（任意・空白区切り）", placeholder: "例：ケース フィルム" },
    { id: "excludeJunk", kind: "toggle", label: "ジャンク・動作未確認を除く" },
  ],
  defaults: { keyword: "", priceMin: "", priceMax: "", excludeWords: "", excludeJunk: true },
  showCurrentSpec: false,
  reviewToggle: false,
  sources: keywordSources,
  queryTerms: (criteria) => (criteria as KeywordCriteria).keyword,
  canSearch: (criteria) => (criteria as KeywordCriteria).keyword.trim().length > 0,
  classify: (text, price, criteria) => {
    const keyword = criteria as KeywordCriteria;
    const lower = normalize(text);
    const reasons: string[] = [];
    const words = keyword.excludeWords.map((word) => normalize(word)).filter(Boolean);
    const hit = words.filter((word) => lower.includes(word));
    if (hit.length > 0) reasons.push(`除外ワード: ${hit.join(", ")}`);
    const junk = keyword.excludeJunk && JUNK.test(lower);
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

/* ------------------------------------------------------------------ */
/* 登録と画面向けの取り出し                                             */
/* ------------------------------------------------------------------ */

const profiles: Record<ProfileId, PartProfile> = {
  memory: memoryProfile,
  gpu: gpuProfile,
  cpu: cpuProfile,
  motherboard: motherboardProfile,
  ssd: ssdProfile,
  keyword: keywordProfile,
};

export const profileIds: ProfileId[] = ["memory", "gpu", "cpu", "motherboard", "ssd", "keyword"];

export function profileFor(id: ProfileId): PartProfile {
  return profiles[id];
}

export function sourcesFor(profile: PartProfile, criteria?: PartCriteria) {
  return usedSources.filter((source) => {
    if (source.status !== "connected") return false;
    const binding = profile.sources[source.id];
    if (!binding) return false;
    return criteria === undefined || binding.applyTo?.(criteria) !== false;
  });
}

export function fieldsFor(profile: PartProfile, values: FieldValues): FieldDef[] {
  return typeof profile.fields === "function" ? profile.fields(values) : profile.fields;
}

/** 画面の入力を1つ変えた結果を返す。規格変更時の速度帯など、画面側へ散らしたくない規則をここに置く。 */
export function changeFieldValue(
  profile: PartProfile,
  values: FieldValues,
  id: string,
  value: string | string[] | boolean,
): FieldValues {
  const next: FieldValues = { ...values, [id]: value };
  if (profile.id === "memory" && id === "generation") {
    const generation: Generation = value === "DDR5" ? "DDR5" : "DDR4";
    next.generation = generation;
    next.speeds = memorySpeedValues(generation);
    next.layout = layoutForGeneration(generation, stringValue(values.layout, DEFAULT_MEMORY_LAYOUT));
  }
  if (profile.id === "cpu" && id === "maker") {
    const maker: CpuMaker = value === "intel" ? "intel" : value === "amd" ? "amd" : "any";
    if (!cpuSeriesValues(maker).includes(stringValue(next.series, "all") as CpuSeries)) next.series = "all";
  }
  return next;
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

function layoutTotalGb(layout: string): number | undefined {
  const match = layout.match(/^(\d+)\s*GB\s*[×xX*]\s*(\d+)$/i);
  if (!match) return undefined;
  return Number(match[1]) * Number(match[2]);
}

/** 「32GB×2」のようなレイアウト表記から総容量を求める。 */
export function capacityForLayout(layout: string): string {
  const total = layoutTotalGb(layout);
  return total === undefined ? "" : `${total}GB`;
}

/** 世代をまたいでも総容量を下げないように、最も近いレイアウトへ寄せる。 */
function layoutKeepingCapacity(generation: Generation, layout: string): string {
  const target = layoutTotalGb(layout) ?? 0;
  const candidates = memoryLayoutValues(generation).map((value) => ({ value, total: layoutTotalGb(value) ?? 0 }));
  const totals = candidates.map((candidate) => candidate.total);
  const enough = totals.filter((total) => total >= target);
  const chosen = enough.length ? Math.min(...enough) : Math.max(...totals);
  return candidates.find((candidate) => candidate.total === chosen)!.value;
}

function layoutForGeneration(generation: Generation, layout: string): string {
  return memoryLayoutValues(generation).includes(layout) ? layout : layoutKeepingCapacity(generation, layout);
}

/** 画面の入力値から、そのプロファイルの検索条件を作る。 */
export function criteriaFromValues(profile: PartProfile, values: FieldValues): PartCriteria {
  if (profile.id === "memory") {
    const generation: Generation = stringValue(values.generation, "DDR4") === "DDR5" ? "DDR5" : "DDR4";
    const layout = layoutForGeneration(generation, stringValue(values.layout, DEFAULT_MEMORY_LAYOUT));
    const allowedSpeeds = memorySpeedValues(generation);
    return {
      profile: "memory",
      generation,
      capacity: capacityForLayout(layout),
      layout,
      speeds: listValue(values.speeds).filter((speed) => allowedSpeeds.includes(speed)),
      keyword: stringValue(values.keyword).trim(),
    };
  }
  if (profile.id === "gpu") {
    const maker = stringValue(values.maker, "any");
    return {
      profile: "gpu",
      maker: maker === "nvidia" || maker === "amd" || maker === "intel" ? maker : "any",
      boardMaker: stringValue(values.boardMaker).trim(),
      keyword: stringValue(values.keyword).trim(),
      excludeJunk: values.excludeJunk !== false,
    };
  }
  if (profile.id === "cpu") {
    const maker: CpuMaker = stringValue(values.maker, "any") === "intel" ? "intel" : stringValue(values.maker, "any") === "amd" ? "amd" : "any";
    const series = stringValue(values.series, "all") as CpuSeries;
    return {
      profile: "cpu",
      maker,
      series: cpuSeriesValues(maker).includes(series) ? series : "all",
      keyword: stringValue(values.keyword).trim(),
      excludeJunk: values.excludeJunk !== false,
    };
  }
  if (profile.id === "motherboard") {
    const socket = stringValue(values.socket, "any");
    return {
      profile: "motherboard",
      socket: socket === "LGA1700" || socket === "LGA1851" || socket === "AM5" || socket === "AM4" ? socket : "any",
      keyword: stringValue(values.keyword).trim(),
      excludeJunk: values.excludeJunk !== false,
    };
  }
  if (profile.id === "ssd") {
    const type = stringValue(values.type, "any");
    const capacity = stringValue(values.capacity, "any");
    return {
      profile: "ssd",
      type: type === "nvme" || type === "sata" ? type : "any",
      capacity: SSD_CAPACITY_PATTERNS[capacity] ? capacity : "any",
      keyword: stringValue(values.keyword).trim(),
      excludeJunk: values.excludeJunk !== false,
    };
  }
  return {
    profile: "keyword",
    keyword: stringValue(values.keyword).trim(),
    priceMin: numberValue(values.priceMin),
    priceMax: numberValue(values.priceMax),
    excludeWords: stringValue(values.excludeWords)
      .split(/[\s,、]+/)
      .map((word) => word.trim())
      .filter(Boolean),
    excludeJunk: values.excludeJunk !== false,
  };
}
