import { describe, expect, it } from "vitest";
import { fixtureProducts, rankProducts, totalPrice } from "./memoryCatalog";

describe("memory recommendation ranking", () => {
  it("does not show uncertain products in trusted results by default", () => {
    const results = rankProducts(fixtureProducts, "value", false, "");
    expect(results.every((product) => product.confidence === "recommended")).toBe(true);
  });

  it("never mixes sold, ended, or unknown listings into live results", () => {
    const results = rankProducts(fixtureProducts, "lowest", true, "");
    expect(results.every((product) => product.availability === "active")).toBe(true);
    expect(results.some((product) => product.lowestPrice === 22000)).toBe(false);
  });

  it("puts the cheapest delivered product first in lowest-price mode", () => {
    const results = rankProducts(fixtureProducts, "lowest", false, "");
    expect(results[0].model).toBe("TED432G2400C16DC01");
    expect(totalPrice(results[0])).toBe(10650);
  });

  it("puts the highest-likelihood product first in stability mode", () => {
    const results = rankProducts(fixtureProducts, "stability", false, "");
    expect(results[0].compatibility).toBe(96);
  });

  it("does not expose a product whose sale status is unknown", () => {
    const hidden = rankProducts(fixtureProducts, "lowest", false, "型番未記載");
    const visible = rankProducts(fixtureProducts, "lowest", true, "型番未記載");
    expect(hidden).toHaveLength(0);
    expect(visible).toHaveLength(0);
  });
});
