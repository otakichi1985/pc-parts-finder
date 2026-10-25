import { describe, expect, it } from "vitest";
import { parseSourceCard } from "./listingModel";
import type { CpuCriteria, GpuCriteria, KeywordCriteria, MemoryCriteria, MotherboardCriteria, SsdCriteria } from "./partProfiles";

const criteria: MemoryCriteria = { profile: "memory", generation: "DDR4", capacity: "64GB", layout: "32GB×2", speeds: ["2400", "2666", "3200"], keyword: "" };

describe("cross-site listing model", () => {
  it("accepts an in-stock Janpara desktop kit", () => {
    const item = parseSourceCard("janpara", { href: "https://www.janpara.co.jp/sale/search/detail/?ITMCODE=123", text: "DDR4 32GB×2 DDR4-2666【デスクトップPC用】 2個の在庫 中古 ¥19,800～" }, criteria, true);
    expect(item?.confidence).toBe("candidate");
    expect(item?.price).toBe(19800);
  });

  it("rejects server memory even when capacity and speed match", () => {
    const item = parseSourceCard("hardoff", { href: "https://netmall.hardoff.co.jp/product/6491152/", text: "DDR4 32GB×2 DDR4-3200 RDIMM サーバー用 71,500円" }, criteria, true);
    expect(item?.confidence).toBe("excluded");
    expect(item?.reasons).toContain("サーバー用メモリ");
  });

  it("imports nothing without a confirmed active-sale state", () => {
    expect(parseSourceCard("pc-koubou", { href: "https://www.pc-koubou.jp/products/detail.php?product_id=1", text: "DDR4 32GB×2 3200 20,000円" }, criteria, false)).toBeNull();
  });

  it("treats the selected speed as a minimum, not an exact match", () => {
    const faster = parseSourceCard("hardoff", { href: "https://netmall.hardoff.co.jp/product/1/", text: "DDR4 32GB×2 DDR4-3200 デスクトップ用 20,000円" }, criteria, true);
    const slower = parseSourceCard("hardoff", { href: "https://netmall.hardoff.co.jp/product/2/", text: "DDR4 32GB×2 DDR4-2133 デスクトップ用 15,000円" }, criteria, true);
    expect(faster?.confidence).toBe("candidate");
    expect(slower?.confidence).toBe("excluded");
    expect(slower?.reasons).toContain("選択した速度帯ではない");
  });

  it("keeps 2666 and 3200 products when all speed bands are selected", () => {
    const speed2666 = parseSourceCard("hardoff", { href: "https://netmall.hardoff.co.jp/product/3/", text: "DDR4 32GB×2 DDR4-2666 デスクトップ用 18,000円" }, criteria, true);
    const speed3200 = parseSourceCard("hardoff", { href: "https://netmall.hardoff.co.jp/product/4/", text: "DDR4 32GB×2 DDR4-3200 デスクトップ用 20,000円" }, criteria, true);
    expect(speed2666?.confidence).toBe("candidate");
    expect(speed3200?.confidence).toBe("candidate");
  });

  it("normalizes fixed-price flea-market item ids", () => {
    const yahoo = parseSourceCard("yahoo-flea", { href: "https://paypayfleamarket.yahoo.co.jp/item/z525721380", text: "Crucial DDR4-3200 64GB 32GB×2 UDIMM 51,800円" }, criteria, true);
    const rakuma = parseSourceCard("rakuma", { href: "https://item.fril.jp/2b0018956077dbcd8c110b76c4c1afa3", text: "Crucial DDR4-3200 64GB 32GB×2 UDIMM ¥51,000" }, criteria, true);
    expect(yahoo?.sourceId).toBe("yahoo-flea:z525721380");
    expect(rakuma?.sourceId).toBe("rakuma:2b0018956077dbcd8c110b76c4c1afa3");
  });
});

describe("DDR5 memory listing model", () => {
  const ddr5: MemoryCriteria = { profile: "memory", generation: "DDR5", capacity: "64GB", layout: "32GB×2", speeds: ["4800", "5200", "6000"], keyword: "" };

  it("accepts a DDR5 desktop kit at a selected speed band", () => {
    const item = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m200", text: "DDR5 32GB×2 6000 デスクトップ用 メモリ ¥32,000" }, ddr5, true);
    expect(item?.confidence).toBe("candidate");
    expect(item?.price).toBe(32000);
  });

  it("excludes DDR4 listings and speeds below the selected bands", () => {
    const ddr4 = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m201", text: "DDR4 32GB×2 DDR4-3200 デスクトップ用 ¥15,000" }, ddr5, true);
    const slow = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m202", text: "DDR5 32GB×2 4800 デスクトップ用 ¥20,000" }, { ...ddr5, speeds: ["6000"] }, true);
    expect(ddr4?.confidence).toBe("excluded");
    expect(ddr4?.reasons).toContain("DDR4の出品");
    expect(slow?.confidence).toBe("excluded");
    expect(slow?.reasons).toContain("選択した速度帯ではない");
  });
});

const gpuCriteria: GpuCriteria = { profile: "gpu", maker: "nvidia", boardMaker: "ASUS", keyword: "", excludeJunk: true };

describe("graphics card listing model", () => {
  it("accepts an NVIDIA board from the selected board maker", () => {
    const item = parseSourceCard("yahoo-flea", { href: "https://paypayfleamarket.yahoo.co.jp/item/z600", text: "ASUS GeForce RTX 4070 グラフィックボード ¥80,000" }, gpuCriteria, true);
    expect(item?.confidence).toBe("candidate");
    expect(item?.reasons).toEqual([]);
  });

  it("excludes another chip maker and PC bodies", () => {
    const radeon = parseSourceCard("yahoo-flea", { href: "https://paypayfleamarket.yahoo.co.jp/item/z601", text: "ASUS Radeon RX 7800 XT グラフィックボード ¥90,000" }, gpuCriteria, true);
    const pc = parseSourceCard("yahoo-flea", { href: "https://paypayfleamarket.yahoo.co.jp/item/z602", text: "RTX 4070 搭載 ゲーミングPC本体 ¥250,000" }, gpuCriteria, true);
    expect(radeon?.confidence).toBe("excluded");
    expect(radeon?.reasons).toContain("NVIDIA製ではない");
    expect(pc?.confidence).toBe("excluded");
    expect(pc?.reasons).toContain("PC本体・ノート");
  });

  it("sends a board without maker evidence to review", () => {
    const item = parseSourceCard("yahoo-flea", { href: "https://paypayfleamarket.yahoo.co.jp/item/z603", text: "グラフィックボード 12GB ¥20,000" }, { ...gpuCriteria, boardMaker: "", keyword: "" }, true);
    expect(item?.confidence).toBe("review");
    expect(item?.reasons).toContain("メーカーを確認できない");
  });
});

const cpuCriteria: CpuCriteria = { profile: "cpu", maker: "amd", series: "ryzen-7", keyword: "", excludeJunk: true };

describe("CPU listing model", () => {
  it("accepts the selected AMD series", () => {
    const item = parseSourceCard("rakuma", { href: "https://item.fril.jp/aaaa01", text: "AMD Ryzen 7 9800X3D CPU ¥55,000" }, cpuCriteria, true);
    expect(item?.confidence).toBe("candidate");
  });

  it("excludes coolers and a different maker", () => {
    const cooler = parseSourceCard("rakuma", { href: "https://item.fril.jp/aaaa02", text: "AMD Ryzen 7 9800X3D CPUクーラー ¥5,000" }, cpuCriteria, true);
    const intel = parseSourceCard("rakuma", { href: "https://item.fril.jp/aaaa03", text: "Intel Core i7-14700K CPU ¥50,000" }, cpuCriteria, true);
    expect(cooler?.confidence).toBe("excluded");
    expect(cooler?.reasons).toContain("CPU本体ではなく冷却用品");
    expect(intel?.confidence).toBe("excluded");
    expect(intel?.reasons).toContain("AMD製ではない");
  });

  it("excludes another series of the same maker", () => {
    const item = parseSourceCard("rakuma", { href: "https://item.fril.jp/aaaa04", text: "AMD Ryzen 5 9600X CPU ¥30,000" }, cpuCriteria, true);
    expect(item?.confidence).toBe("excluded");
    expect(item?.reasons).toContain("選択したシリーズではない");
  });
});

const boardCriteria: MotherboardCriteria = { profile: "motherboard", socket: "AM5", keyword: "", excludeJunk: true };

describe("motherboard listing model", () => {
  it("accepts a board with the selected socket", () => {
    const item = parseSourceCard("janpara", { href: "https://www.janpara.co.jp/sale/search/detail/?ITMCODE=900", text: "ASUS TUF GAMING B650-PLUS AM5 マザーボード 中古 ¥20,000" }, boardCriteria, true);
    expect(item?.confidence).toBe("candidate");
  });

  it("excludes another socket and sends unclear boards to review", () => {
    const intel = parseSourceCard("janpara", { href: "https://www.janpara.co.jp/sale/search/detail/?ITMCODE=901", text: "ASUS PRIME B760M-A LGA1700 マザーボード 中古 ¥15,000" }, boardCriteria, true);
    const unclear = parseSourceCard("janpara", { href: "https://www.janpara.co.jp/sale/search/detail/?ITMCODE=902", text: "マザーボード ATX 中古 ¥10,000" }, boardCriteria, true);
    expect(intel?.confidence).toBe("excluded");
    expect(intel?.reasons).toContain("選択したソケットではない");
    expect(unclear?.confidence).toBe("review");
    expect(unclear?.reasons).toContain("ソケットを確認できない");
  });
});

const ssdCriteria: SsdCriteria = { profile: "ssd", type: "nvme", capacity: "1TB", keyword: "", excludeJunk: true };

describe("SSD listing model", () => {
  it("accepts an NVMe drive with the selected capacity", () => {
    const item = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m300", text: "WD BLACK SN850X 1TB NVMe M.2 SSD ¥12,000" }, ssdCriteria, true);
    expect(item?.confidence).toBe("candidate");
  });

  it("excludes HDDs, other interfaces and other capacities", () => {
    const hdd = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m301", text: "WD 1TB HDD 3.5インチ ¥3,000" }, ssdCriteria, true);
    const sata = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m302", text: "Crucial MX500 1TB SATA 2.5インチ SSD ¥8,000" }, ssdCriteria, true);
    const capacity = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m303", text: "Samsung 990 PRO 2TB NVMe SSD ¥20,000" }, ssdCriteria, true);
    expect(hdd?.confidence).toBe("excluded");
    expect(hdd?.reasons).toContain("HDD");
    expect(sata?.confidence).toBe("excluded");
    expect(sata?.reasons).toContain("SATAの出品");
    expect(capacity?.confidence).toBe("excluded");
    expect(capacity?.reasons).toContain("選択した容量ではない");
  });
});

const keywordCriteria: KeywordCriteria = { profile: "keyword", keyword: "Surface Pro 8", excludeWords: [], excludeJunk: true };

describe("keyword listing model", () => {
  it("does not apply memory exclusions", () => {
    const item = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m100", text: "Surface Pro 8 ノートPC用 SO-DIMM サーバー用 パソコン本体 16GB×2 ¥68,000" }, keywordCriteria, true);
    expect(item?.confidence).toBe("unchecked");
    expect(item?.reasons).toEqual([]);
    expect(item?.price).toBe(68000);
  });

  it("excludes by price range and exclude words", () => {
    const range: KeywordCriteria = { ...keywordCriteria, priceMin: 30000, priceMax: 100000, excludeWords: ["ケース", "フィルム"] };
    const inRange = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m101", text: "Surface Pro 8 本体 68,000円" }, range, true);
    const tooCheap = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m102", text: "Surface Pro 8 ケース 3,000円" }, range, true);
    const tooExpensive = parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m103", text: "Surface Pro 8 128,000円" }, range, true);
    expect(inRange?.confidence).toBe("unchecked");
    expect(tooCheap?.confidence).toBe("excluded");
    expect(tooCheap?.reasons.join(" ")).toContain("除外ワード");
    expect(tooExpensive?.confidence).toBe("excluded");
    expect(tooExpensive?.reasons.join(" ")).toContain("上限100000円超");
  });

  it("keeps junk listings only when the toggle is off", () => {
    const junk = "Surface Pro 8 ジャンク 本体 IS 20,000円";
    expect(parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m104", text: junk }, keywordCriteria, true)?.confidence).toBe("excluded");
    expect(parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m105", text: junk }, { ...keywordCriteria, excludeJunk: false }, true)?.confidence).toBe("unchecked");
  });

  it("imports nothing without a confirmed active-sale state", () => {
    expect(parseSourceCard("mercari", { href: "https://jp.mercari.com/item/m106", text: "Surface Pro 8 68,000円" }, keywordCriteria, false)).toBeNull();
  });
});
