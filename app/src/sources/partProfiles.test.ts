import { describe, expect, it } from "vitest";
import {
  capacityForLayout,
  changeFieldValue,
  cpuProfile,
  criteriaFromValues,
  fieldsFor,
  gpuProfile,
  hasWorkingEvidence,
  keywordProfile,
  matchesModelKeyword,
  memoryProfile,
  motherboardProfile,
  profileIds,
  sourcesFor,
  ssdProfile,
  type CpuCriteria,
  type GpuCriteria,
  type KeywordCriteria,
  type MemoryCriteria,
  type MotherboardCriteria,
  type SourceUrlShape,
  type SsdCriteria,
} from "./partProfiles";
import { usedSources } from "./sourceCatalog";

const memoryCriteria: MemoryCriteria = { profile: "memory", generation: "DDR4", capacity: "64GB", layout: "32GB×2", speeds: ["2400", "2666", "3200"], keyword: "Crucial" };
const memoryDdr5: MemoryCriteria = { profile: "memory", generation: "DDR5", capacity: "64GB", layout: "32GB×2", speeds: ["4800", "5200", "6000"], keyword: "Crucial" };
const keywordCriteria: KeywordCriteria = { profile: "keyword", keyword: "Surface Pro 8", excludeWords: [], excludeJunk: true };

const gpuCriteria: GpuCriteria = { profile: "gpu", maker: "nvidia", boardMaker: "ASUS", keyword: "RTX 4070", excludeJunk: true };
const cpuCriteria: CpuCriteria = { profile: "cpu", maker: "amd", series: "ryzen-7", keyword: "9800X3D", excludeJunk: true };
const motherboardCriteria: MotherboardCriteria = { profile: "motherboard", socket: "AM5", keyword: "B650", excludeJunk: true };
const ssdCriteria: SsdCriteria = { profile: "ssd", type: "nvme", capacity: "1TB", keyword: "SN850X", excludeJunk: true };

function readable(url: string) {
  return decodeURIComponent(url.replace(/\+/g, " "));
}

function expectShape(url: string, shape: SourceUrlShape, token?: string) {
  const parsed = new URL(url);
  expect(parsed.protocol).toBe("https:");
  expect(parsed.host).toBe(shape.host);
  if (typeof shape.path === "string") expect(parsed.pathname).toBe(shape.path);
  else expect(parsed.pathname).toMatch(shape.path);
  for (const [key, value] of shape.required) expect(parsed.searchParams.get(key)).toBe(value);
  if (token) expect(parsed.searchParams.get("pcpf_token")).toBe(token);
}

function expectUrlsInsideRules(profile: { sources: Record<string, { buildUrl(criteria: never, token?: string): string; shape: SourceUrlShape } | undefined> }, criteria: never) {
  for (const source of usedSources) {
    const binding = profile.sources[source.id];
    if (!binding) continue;
    expectShape(binding.buildUrl(criteria, "token"), binding.shape, "token");
    expectShape(binding.buildUrl(criteria), binding.shape);
  }
}

describe("part profiles", () => {
  it("registers the searchable profiles in navigation order", () => {
    expect(profileIds).toEqual(["memory", "gpu", "cpu", "motherboard", "ssd", "keyword"]);
  });

  it("builds site-specific searches from the same memory criteria", () => {
    const urls = usedSources.map((source) => {
      const binding = memoryProfile.sources[source.id];
      expect(binding).toBeDefined();
      return binding!.buildUrl(memoryCriteria, "token");
    });
    expect(urls[0]).toContain("status=on_sale");
    expect(decodeURIComponent(urls[1])).toContain("32GB×2");
    expect(urls[1]).toContain("open=1");
    expect(urls[2]).toContain("query=");
    expect(urls[2]).toContain("transaction=selling");
    expect(urls[3]).toContain("CHKOUTCOM=1");
    expect(urls[4]).toContain("used_memory_d_ddr4_32gb");
    expect(urls[5]).toContain("00010002000500090001");
    expect(decodeURIComponent(urls[0])).not.toContain("DDR4-2400");
  });

  it("keeps every memory URL inside the app's URL rules", () => {
    for (const source of usedSources) {
      const binding = memoryProfile.sources[source.id]!;
      expectShape(binding.buildUrl(memoryCriteria, "token"), binding.shape, "token");
      expectShape(binding.buildUrl(memoryCriteria), binding.shape);
    }
  });

  it("searches DDR5 with the four keyword-capable sites and memory category", () => {
    const ids = sourcesFor(memoryProfile, memoryDdr5).map((source) => source.id);
    expect(ids).toEqual(["mercari", "yahoo-flea", "rakuma", "janpara"]);
    const urls = ids.map((id) => memoryProfile.sources[id as keyof typeof memoryProfile.sources]!.buildUrl(memoryDdr5, "token"));
    expect(readable(urls[0])).toContain("DDR5 32GB×2 64GB");
    expect(urls[0]).toContain("status=on_sale");
    expect(readable(urls[1])).toContain("DDR5");
    expect(urls[2]).toContain("transaction=selling");
    expect(urls[3]).toContain("OUTCLSCODE=8");
    expect(readable(urls[3])).toContain("DDR5 デスクトップ 32GB×2");
  });

  it("hides fixed-category shops when the memory layout or generation does not match", () => {
    expect(sourcesFor(memoryProfile, memoryCriteria).map((source) => source.id)).toContain("pc-koubou");
    expect(sourcesFor(memoryProfile, { ...memoryCriteria, layout: "16GB×2" }).map((source) => source.id)).not.toContain("pc-koubou");
    expect(sourcesFor(memoryProfile, memoryDdr5).map((source) => source.id)).not.toContain("hardoff");
  });

  it("keeps every DDR5 memory URL inside the app's URL rules", () => {
    for (const source of sourcesFor(memoryProfile, memoryDdr5)) {
      const binding = memoryProfile.sources[source.id]!;
      expectShape(binding.buildUrl(memoryDdr5, "token"), binding.shape, "token");
      expectShape(binding.buildUrl(memoryDdr5), binding.shape);
    }
  });

  it("switches memory speed bands with the generation", () => {
    const ddr5Fields = fieldsFor(memoryProfile, { generation: "DDR5" });
    const speedField = ddr5Fields.find((field) => field.id === "speeds");
    expect(speedField?.kind).toBe("checks");
    if (speedField?.kind === "checks") expect(speedField.options.map((option) => option.value)).toEqual(["4800", "5200", "6000"]);
    const ddr4Fields = fieldsFor(memoryProfile, { generation: "DDR4" });
    const ddr4SpeedField = ddr4Fields.find((field) => field.id === "speeds");
    if (ddr4SpeedField?.kind === "checks") expect(ddr4SpeedField.options.map((option) => option.value)).toEqual(["2400", "2666", "3200"]);

    const changed = changeFieldValue(memoryProfile, { generation: "DDR4", speeds: ["3200"] }, "generation", "DDR5");
    expect(changed.speeds).toEqual(["4800", "5200", "6000"]);
  });

  it("offers 64GB and larger memory layouts with the total capacity in the label", () => {
    const ddr4 = fieldsFor(memoryProfile, { generation: "DDR4" }).find((field) => field.id === "layout");
    expect(ddr4?.kind).toBe("select");
    if (ddr4?.kind === "select") {
      expect(ddr4.options.map((option) => option.value)).toEqual(["64GB×2", "32GB×4", "32GB×2", "16GB×2", "8GB×2"]);
      expect(ddr4.options[0].label).toBe("64GB×2（128GB）");
    }
    const ddr5 = fieldsFor(memoryProfile, { generation: "DDR5" }).find((field) => field.id === "layout");
    expect(ddr5?.kind).toBe("select");
    if (ddr5?.kind === "select") {
      expect(ddr5.options.map((option) => option.value)).toEqual(["64GB×4", "64GB×2", "32GB×4", "48GB×2", "32GB×2", "16GB×2", "8GB×2"]);
      expect(ddr5.options[0].label).toBe("64GB×4（256GB）");
      expect(ddr5.options[3].label).toBe("48GB×2（96GB）");
    }
  });

  it("computes the total memory capacity from module size and stick count", () => {
    expect(capacityForLayout("64GB×4")).toBe("256GB");
    expect(capacityForLayout("48GB×2")).toBe("96GB");
    expect(capacityForLayout("32GB×4")).toBe("128GB");
    expect(capacityForLayout("16GB×2")).toBe("32GB");
  });

  it("keeps or raises the memory capacity when the generation or layout changes", () => {
    const ddr5 = criteriaFromValues(memoryProfile, { generation: "DDR5", layout: "64GB×4", speeds: ["6000"], keyword: "" });
    expect(ddr5).toMatchObject({ layout: "64GB×4", capacity: "256GB" });
    const url = memoryProfile.sources.mercari!.buildUrl(ddr5);
    expect(readable(url)).toContain("DDR5 64GB×4 256GB");

    const switched = changeFieldValue(memoryProfile, { generation: "DDR4", layout: "32GB×2", speeds: ["3200"] }, "generation", "DDR5");
    expect(switched).toMatchObject({ generation: "DDR5", layout: "32GB×2", speeds: ["4800", "5200", "6000"] });

    const down = changeFieldValue(memoryProfile, { generation: "DDR5", layout: "64GB×4", speeds: ["6000"] }, "generation", "DDR4");
    expect(down.layout).toBe("64GB×2");
    expect(capacityForLayout(String(down.layout))).toBe("128GB");

    const corrected = criteriaFromValues(memoryProfile, { generation: "DDR4", layout: "48GB×2", speeds: ["3200"], keyword: "" });
    expect(corrected).toMatchObject({ generation: "DDR4", layout: "64GB×2", capacity: "128GB" });
  });

  it("keeps desktop memory described as for a gaming PC", () => {
    const memory = memoryProfile.classify("Crucial DDR4-3200 32GB×2 ゲーミングPC用 デスクトップ用メモリ 15,000円", 15000, memoryCriteria);
    expect(memory.confidence).toBe("candidate");
    expect(memory.reasons).not.toContain("メモリ単体ではなくPC本体");
  });

  it("builds the same URL rules for graphics cards, CPU, motherboards and SSD", () => {
    expectUrlsInsideRules(gpuProfile, gpuCriteria as never);
    expectUrlsInsideRules(cpuProfile, cpuCriteria as never);
    expectUrlsInsideRules(motherboardProfile, motherboardCriteria as never);
    expectUrlsInsideRules(ssdProfile, ssdCriteria as never);
  });

  it("turns the selected part fields into query terms", () => {
    expect(gpuProfile.queryTerms(gpuCriteria)).toBe("GeForce ASUS RTX 4070");
    expect(cpuProfile.queryTerms(cpuCriteria)).toBe("Ryzen 7 9800X3D");
    expect(motherboardProfile.queryTerms(motherboardCriteria)).toBe("AM5 マザーボード B650");
    expect(ssdProfile.queryTerms(ssdCriteria)).toBe("NVMe SSD 1TB SN850X");
  });

  it("classifies graphics cards by maker without dropping unknown listings", () => {
    expect(gpuProfile.classify("ASUS GeForce RTX 4070 Ti グラフィックボード 120,000円", 120000, gpuCriteria).confidence).toBe("candidate");
    const amd = gpuProfile.classify("AMD Radeon RX 7900 XTX グラフィックボード 100,000円", 100000, gpuCriteria);
    expect(amd.confidence).toBe("excluded");
    expect(amd.reasons).toContain("NVIDIA製ではない");
    expect(gpuProfile.classify("グラフィックボード 30,000円", 30000, { ...gpuCriteria, maker: "intel", boardMaker: "", keyword: "" }).confidence).toBe("review");
    expect(gpuProfile.classify("RTX 4060 ノートPC用 80,000円", 80000, gpuCriteria).confidence).toBe("excluded");
    expect(gpuProfile.classify("グラフィックボード ジャンク 10,000円", 10000, gpuCriteria).confidence).toBe("excluded");
    expect(gpuProfile.classify("ASUS GeForce RTX 4060 グラフィックボード 50,000円", 50000, gpuCriteria).confidence).toBe("excluded");
    expect(gpuProfile.classify("ASUS GeForce RTX 4060 グラフィックボード 50,000円", 50000, gpuCriteria).reasons).toContain("型番「RTX 4070」ではない");
  });

  it("classifies CPU series and excludes coolers and other makers", () => {
    expect(cpuProfile.classify("AMD Ryzen 7 9800X3D 60,000円", 60000, cpuCriteria).confidence).toBe("candidate");
    const intel = cpuProfile.classify("Intel Core i7-14700K 50,000円", 50000, cpuCriteria);
    expect(intel.confidence).toBe("excluded");
    expect(intel.reasons).toContain("AMD製ではない");
    const lowerSeries = cpuProfile.classify("AMD Ryzen 5 7600 25,000円", 25000, cpuCriteria);
    expect(lowerSeries.confidence).toBe("excluded");
    expect(lowerSeries.reasons).toContain("選択したシリーズではない");
    expect(cpuProfile.classify("CPUクーラー 5,000円", 5000, cpuCriteria).confidence).toBe("excluded");
    expect(cpuProfile.classify("CPU 10,000円", 10000, { ...cpuCriteria, keyword: "" }).confidence).toBe("review");
  });

  it("classifies motherboards by socket", () => {
    expect(motherboardProfile.classify("ASUS B650M マザーボード AM5 DDR5 20,000円", 20000, motherboardCriteria).confidence).toBe("candidate");
    const intel = motherboardProfile.classify("MSI B760M マザーボード LGA1700 15,000円", 15000, motherboardCriteria);
    expect(intel.confidence).toBe("excluded");
    expect(intel.reasons).toContain("選択したソケットではない");
    expect(motherboardProfile.classify("マザーボード 10,000円", 10000, { ...motherboardCriteria, keyword: "" }).confidence).toBe("review");
    const model = motherboardProfile.classify("ASUS B760M マザーボード LGA1700 15,000円", 15000, motherboardCriteria);
    expect(model.confidence).toBe("excluded");
    expect(model.reasons).toContain("型番「B650」ではない");
  });

  it("classifies SSD type and capacity", () => {
    expect(ssdProfile.classify("WD Black SN850X 1TB NVMe M.2 SSD 15,000円", 15000, ssdCriteria).confidence).toBe("candidate");
    const sata = ssdProfile.classify("Crucial MX500 1TB SATA 2.5インチ SSD 8,000円", 8000, ssdCriteria);
    expect(sata.confidence).toBe("excluded");
    expect(sata.reasons).toContain("SATAの出品");
    const small = ssdProfile.classify("WD SN850X 500GB NVMe SSD 10,000円", 10000, ssdCriteria);
    expect(small.confidence).toBe("excluded");
    expect(small.reasons).toContain("選択した容量ではない");
    expect(ssdProfile.classify("SSD 1TB 10,000円", 10000, { ...ssdCriteria, keyword: "" }).confidence).toBe("review");
    expect(ssdProfile.classify("HDD 1TB 3,000円", 3000, ssdCriteria).confidence).toBe("excluded");
    const model = ssdProfile.classify("WD SN770 1TB NVMe M.2 SSD 10,000円", 10000, ssdCriteria);
    expect(model.confidence).toBe("excluded");
    expect(model.reasons).toContain("型番「SN850X」ではない");
  });

  it("searches the four fixed-price sites by keyword", () => {
    const ids = sourcesFor(keywordProfile).map((source) => source.id);
    expect(ids).toEqual(["mercari", "yahoo-flea", "rakuma", "janpara"]);
    const urls = ids.map((id) => keywordProfile.sources[id as keyof typeof keywordProfile.sources]!.buildUrl(keywordCriteria, "token"));
    expect(urls[0]).toContain("status=on_sale");
    expect(decodeURIComponent(urls[1])).toContain("Surface Pro 8");
    expect(urls[1]).toContain("open=1");
    expect(urls[2]).toContain("transaction=selling");
    expect(urls[3]).toContain("CHKOUTCOM=1");
    expect(urls[3]).not.toContain("OUTCLSCODE");
  });

  it("keeps every keyword URL inside the app's URL rules", () => {
    for (const source of sourcesFor(keywordProfile)) {
      const binding = keywordProfile.sources[source.id]!;
      expectShape(binding.buildUrl(keywordCriteria, "token"), binding.shape, "token");
      expectShape(binding.buildUrl(keywordCriteria), binding.shape);
    }
  });

  it("builds criteria from screen values", () => {
    const memory = criteriaFromValues(memoryProfile, { layout: "16GB×2", speeds: ["3200"], keyword: "  Crucial  " });
    expect(memory).toEqual({ profile: "memory", generation: "DDR4", capacity: "32GB", layout: "16GB×2", speeds: ["3200"], keyword: "Crucial" });
    const ddr5 = criteriaFromValues(memoryProfile, { generation: "DDR5", layout: "32GB×2", speeds: ["4800", "5200", "6000"], keyword: "" });
    expect(ddr5).toEqual({ profile: "memory", generation: "DDR5", capacity: "64GB", layout: "32GB×2", speeds: ["4800", "5200", "6000"], keyword: "" });
    const keyword = criteriaFromValues(keywordProfile, { keyword: " Surface Pro 8 ", priceMin: "30,000", priceMax: "", excludeWords: "ケース フィルム", excludeJunk: false });
    expect(keyword).toEqual({ profile: "keyword", keyword: "Surface Pro 8", priceMin: 30000, priceMax: undefined, excludeWords: ["ケース", "フィルム"], excludeJunk: false });
  });

  it("keeps CPU series valid when the maker changes", () => {
    const intel = changeFieldValue(cpuProfile, { maker: "amd", series: "ryzen-7" }, "maker", "intel");
    expect(intel.series).toBe("all");
    const criteria = criteriaFromValues(cpuProfile, { maker: "amd", series: "core-i7", keyword: "" });
    expect(criteria).toMatchObject({ profile: "cpu", maker: "amd", series: "all" });
  });

  it("matches model numbers by alphanumeric sequence and ignores prices", () => {
    expect(matchesModelKeyword("Intel Core i7-12700F 35,000円", "12700")).toBe(true);
    expect(matchesModelKeyword("Intel Core i7-7700 ¥12,700", "12700")).toBe(false);
    expect(matchesModelKeyword("512700", "12700")).toBe(false);
    expect(matchesModelKeyword("12700F", "12700")).toBe(true);
    expect(matchesModelKeyword("ASUS GeForce RTX4070 Ti", "RTX 4070")).toBe(true);
    expect(matchesModelKeyword("DDR5-6000 32GB", "DDR5 6000")).toBe(true);
    expect(matchesModelKeyword("DDR5-5600 32GB", "DDR5 6000")).toBe(false);
    expect(matchesModelKeyword("WD Black SN850X 1TB", "SN850X")).toBe(true);
    expect(matchesModelKeyword("ASUS B650M マザーボード", "B650")).toBe(true);
    expect(matchesModelKeyword("ASUS B650 マザーボード", "B650M")).toBe(false);
    expect(matchesModelKeyword("Surface Pro 8", "Surface Pro 8")).toBe(true);
  });

  it("excludes PC bodies, laptops, bundles and mobile CPUs, but keeps CPU-only listings", () => {
    const criteria: CpuCriteria = { profile: "cpu", maker: "intel", series: "core-i7", keyword: "12700", excludeJunk: true };
    const gamingPc = cpuProfile.classify("ゲーミングPC Intel Core i7-12700F RTX3060 115,000円", 115000, criteria);
    expect(gamingPc.confidence).toBe("excluded");
    expect(gamingPc.reasons).toContain("PC本体・ノート");
    const laptop = cpuProfile.classify("ASUS Vivobook X1403ZA 第12世代 Core i7 16GB 512GB 65,500円", 65500, criteria);
    expect(laptop.confidence).toBe("excluded");
    expect(laptop.reasons).toContain("PC本体・ノート");
    const bundle = cpuProfile.classify("MSI MAG Z690 CARBON WIFI + Intel Core i7 12700 54,800円", 54800, criteria);
    expect(bundle.confidence).toBe("excluded");
    expect(bundle.reasons).toContain("マザーボード・セット品");
    const mobile = cpuProfile.classify("Intel Core i7-12700H 2.3GHz 86,500円", 86500, criteria);
    expect(mobile.confidence).toBe("excluded");
    expect(mobile.reasons).toContain("モバイルCPU");
    const cpuOnly = cpuProfile.classify("Intel Core i7-12700F CPU 本体 動作確認済み 31,800円", 31800, criteria);
    expect(cpuOnly.confidence).toBe("candidate");
    const compatible = cpuProfile.classify("Intel Core i7-12700K マザーボード対応 35,000円", 35000, criteria);
    expect(compatible.confidence).toBe("candidate");
    const gamingFor = cpuProfile.classify("Intel Core i7-12700K ゲーミングPC向け 35,000円", 35000, criteria);
    expect(gamingFor.confidence).toBe("candidate");
  });

  it("excludes accessory-only listings across part profiles", () => {
    const memory = memoryProfile.classify("Crucial DDR4-3200 32GB×2 箱のみ 5,000円", 5000, memoryCriteria);
    expect(memory.confidence).toBe("excluded");
    expect(memory.reasons).toContain("付属品・箱のみ");
    const gpu = gpuProfile.classify("ASUS GeForce RTX 4070 箱のみ 10,000円", 10000, gpuCriteria);
    expect(gpu.confidence).toBe("excluded");
    expect(gpu.reasons).toContain("付属品・箱のみ");
    const gpuWithBox = gpuProfile.classify("ASUS GeForce RTX 4070 箱付き 80,000円", 80000, gpuCriteria);
    expect(gpuWithBox.confidence).toBe("candidate");
    const motherboard = motherboardProfile.classify("ASUS B650M マザーボード AM5 箱のみ 5,000円", 5000, motherboardCriteria);
    expect(motherboard.confidence).toBe("excluded");
    expect(motherboard.reasons).toContain("付属品・箱のみ");
    const ssd = ssdProfile.classify("WD SN850X 1TB NVMe SSD 箱のみ 5,000円", 5000, ssdCriteria);
    expect(ssd.confidence).toBe("excluded");
    expect(ssd.reasons).toContain("付属品・箱のみ");
  });

  it("excludes box-only, accessory-only and cooler-only listings, but keeps CPU-only", () => {
    const criteria: CpuCriteria = { profile: "cpu", maker: "intel", series: "core-i7", keyword: "12700", excludeJunk: true };
    const boxOnly = cpuProfile.classify("Intel Core i7-12700K 箱のみ 10,000円", 10000, criteria);
    expect(boxOnly.confidence).toBe("excluded");
    expect(boxOnly.reasons).toContain("付属品・箱のみ");
    const emptyBox = cpuProfile.classify("Intel Core i7-12700K 空箱 8,000円", 8000, criteria);
    expect(emptyBox.confidence).toBe("excluded");
    const coolerOnly = cpuProfile.classify("Intel Core i7-12700K クーラーのみ 3,000円", 3000, criteria);
    expect(coolerOnly.confidence).toBe("excluded");
    expect(coolerOnly.reasons).toContain("付属品・箱のみ");
    const manualOnly = cpuProfile.classify("Intel Core i7-12700K 説明書と箱のみ 2,000円", 2000, criteria);
    expect(manualOnly.confidence).toBe("excluded");
    const noCpu = cpuProfile.classify("Intel Core i7-12700K CPUは付属しません 8,000円", 8000, criteria);
    expect(noCpu.confidence).toBe("excluded");
    expect(noCpu.reasons).toContain("CPUなし");
    const withCooler = cpuProfile.classify("Intel Core i7-12700K クーラー付き 35,000円", 35000, criteria);
    expect(withCooler.confidence).toBe("candidate");
    const withFan = cpuProfile.classify("Intel Core i7-12700K CPUファン付き 35,000円", 35000, criteria);
    expect(withFan.confidence).toBe("candidate");
    const withoutCooler = cpuProfile.classify("Intel Core i7-12700K クーラーなし 35,000円", 35000, criteria);
    expect(withoutCooler.confidence).toBe("candidate");
    const bodyOnly = cpuProfile.classify("Intel Core i7-12700K 本体のみ 35,000円", 35000, criteria);
    expect(bodyOnly.confidence).toBe("candidate");
    const boxMissing = cpuProfile.classify("Intel Core i7-12700K 箱のみ欠品 35,000円", 35000, criteria);
    expect(boxMissing.confidence).toBe("candidate");
    const coolerMissing = cpuProfile.classify("Intel Core i7-12700K クーラーのみ欠品 35,000円", 35000, criteria);
    expect(coolerMissing.confidence).toBe("candidate");
  });

  it("excludes non-working junk and keeps no-defect listings", () => {
    const junk = cpuProfile.classify("AMD Ryzen 7 9800X3D 動作しません ジャンク 20,000円", 20000, cpuCriteria);
    expect(junk.confidence).toBe("excluded");
    expect(junk.reasons).toContain("ジャンク・動作未確認");
    const noBoot = cpuProfile.classify("AMD Ryzen 7 9800X3D 起動できません 20,000円", 20000, cpuCriteria);
    expect(noBoot.confidence).toBe("excluded");
    expect(noBoot.reasons).toContain("ジャンク・動作未確認");
    const noDefect = cpuProfile.classify("AMD Ryzen 7 9800X3D 不良なし 60,000円", 60000, cpuCriteria);
    expect(noDefect.confidence).toBe("candidate");
    const noFault = cpuProfile.classify("AMD Ryzen 7 9800X3D 故障なし 60,000円", 60000, cpuCriteria);
    expect(noFault.confidence).toBe("candidate");
    expect(hasWorkingEvidence("cpu", "動作確認済み")).toBe(true);
    expect(hasWorkingEvidence("cpu", "通電確認済み")).toBe(false);
    expect(hasWorkingEvidence("gpu", "映像出力確認済み")).toBe(true);
    expect(hasWorkingEvidence("memory", "MemTest済み")).toBe(true);
    expect(hasWorkingEvidence("motherboard", "BIOS起動確認")).toBe(true);
    expect(hasWorkingEvidence("motherboard", "通電確認済み")).toBe(true);
    expect(hasWorkingEvidence("ssd", "CrystalDiskInfo 健康状態良好")).toBe(true);
    expect(hasWorkingEvidence("gpu", "外観のみ")).toBe(false);
  });

  it("requires a searchable value for each profile", () => {
    expect(memoryProfile.canSearch(memoryCriteria)).toBe(true);
    expect(memoryProfile.canSearch({ ...memoryCriteria, speeds: [] })).toBe(false);
    expect(keywordProfile.canSearch(keywordCriteria)).toBe(true);
    expect(keywordProfile.canSearch({ ...keywordCriteria, keyword: "   " })).toBe(false);
    expect(gpuProfile.canSearch(gpuCriteria)).toBe(true);
    expect(cpuProfile.canSearch(cpuCriteria)).toBe(true);
    expect(motherboardProfile.canSearch(motherboardCriteria)).toBe(true);
    expect(ssdProfile.canSearch(ssdCriteria)).toBe(true);
  });
});
