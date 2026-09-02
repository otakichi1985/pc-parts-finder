import { describe, expect, it } from "vitest";
import { importMercariSearch, isConfirmedOnSaleSearch, parseMercariSearchCard } from "./mercariSearchAdapter";

describe("Mercari search adapter", () => {
  it("requires both the on-sale URL and checked UI filter", () => {
    expect(isConfirmedOnSaleSearch("https://jp.mercari.com/search?status=on_sale", true)).toBe(true);
    expect(isConfirmedOnSaleSearch("https://jp.mercari.com/search", true)).toBe(false);
    expect(isConfirmedOnSaleSearch("https://jp.mercari.com/search?status=on_sale", false)).toBe(false);
  });
  it("accepts an active desktop 32GB by 2 listing", () => {
    const result = parseMercariSearchCard({ href: "/item/m30169940383", text: "¥52,300【新品】DDR4 32GB x2枚(64GB) 3200MHz デスクトップ用" }, true);
    expect(result?.confidence).toBe("candidate"); expect(result?.price).toBe(52300);
  });
  it.each([
    ["¥40,000 Team DDR4-3200 64GB（32GB×2） ノートPC用メモリ", "ノート用SO-DIMM"],
    ["¥24,000 corsair vengeance rt DDR4 3200hz 16gb 2枚 箱付き", "32GB×2を確認できない"],
    ["¥119,800 ゲーミングPC RTX3070 DDR4 メモリ64GB Ryzen 7 5800X", "メモリ単体ではなくPC本体"],
  ])("excludes search noise: %s", (text, reason) => {
    const result = parseMercariSearchCard({ href: "/item/m12345678901", text }, true);
    expect(result?.confidence).toBe("excluded"); expect(result?.reasons).toContain(reason);
  });
  it("keeps an auction current price out of trusted candidates", () => {
    const result = parseMercariSearchCard({ href: "/item/m49565430048", text: "現在 ¥600 TEAMGROUP ELITE DDR4 64GB 3200MHz UDIMM 32GB×2" }, true);
    expect(result?.confidence).toBe("review"); expect(result?.reasons).toContain("現在価格であり購入額が未確定");
  });
  it("imports nothing when sale status cannot be confirmed", () => {
    const cards = [{ href: "/item/m30169940383", text: "¥52,300 DDR4 32GB×2 デスクトップ用" }];
    expect(importMercariSearch(cards, "https://jp.mercari.com/search", true)).toHaveLength(0);
  });
});
