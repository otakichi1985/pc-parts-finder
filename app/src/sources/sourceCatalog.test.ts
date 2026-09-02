import { describe, expect, it } from "vitest";
import { usedSources, type SearchCriteria } from "./sourceCatalog";

const criteria: SearchCriteria = { generation: "DDR4", capacity: "64GB", layout: "32GB×2", speeds: ["2400", "2666", "3200"], keyword: "Crucial" };

describe("used source catalog", () => {
  it("contains only fixed-price marketplaces and used shops", () => {
    expect(usedSources.map((source) => source.id)).toEqual(["mercari", "yahoo-flea", "rakuma", "janpara", "pc-koubou", "hardoff"]);
    expect(usedSources.some((source) => /auction|オークション/i.test(source.id + source.name))).toBe(false);
  });
  it("builds site-specific searches from the same memory criteria", () => {
    const urls = usedSources.map((source) => source.buildSearchUrl(criteria, "token"));
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
});
