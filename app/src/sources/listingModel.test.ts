import { describe, expect, it } from "vitest";
import { parseSourceCard } from "./listingModel";
import type { KeywordCriteria, MemoryCriteria } from "./partProfiles";

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
