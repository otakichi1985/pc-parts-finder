import { describe, expect, it } from "vitest";
import { usedSources } from "./sourceCatalog";

describe("used source catalog", () => {
  it("contains only fixed-price marketplaces and used shops", () => {
    expect(usedSources.map((source) => source.id)).toEqual(["mercari", "yahoo-flea", "rakuma", "janpara", "pc-koubou", "hardoff"]);
    expect(usedSources.some((source) => /auction|オークション/i.test(source.id + source.name))).toBe(false);
  });
});
