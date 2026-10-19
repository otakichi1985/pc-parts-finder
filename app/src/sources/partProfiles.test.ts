import { describe, expect, it } from "vitest";
import { criteriaFromValues, keywordProfile, memoryProfile, profileIds, sourcesFor, type KeywordCriteria, type MemoryCriteria, type SourceUrlShape } from "./partProfiles";
import { usedSources } from "./sourceCatalog";

const memoryCriteria: MemoryCriteria = { profile: "memory", generation: "DDR4", capacity: "64GB", layout: "32GB×2", speeds: ["2400", "2666", "3200"], keyword: "Crucial" };
const keywordCriteria: KeywordCriteria = { profile: "keyword", keyword: "Surface Pro 8", excludeWords: [], excludeJunk: true };

function expectShape(url: string, shape: SourceUrlShape, token?: string) {
  const parsed = new URL(url);
  expect(parsed.protocol).toBe("https:");
  expect(parsed.host).toBe(shape.host);
  if (typeof shape.path === "string") expect(parsed.pathname).toBe(shape.path);
  else expect(parsed.pathname).toMatch(shape.path);
  for (const [key, value] of shape.required) expect(parsed.searchParams.get(key)).toBe(value);
  if (token) expect(parsed.searchParams.get("pcpf_token")).toBe(token);
}

describe("part profiles", () => {
  it("registers the searchable profiles", () => {
    expect(profileIds).toEqual(["memory", "keyword"]);
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

  it("searches the four fixed-price sites by keyword", () => {
    const ids = sourcesFor(keywordProfile).map((source) => source.id);
    expect(ids).toEqual(["mercari", "yahoo-flea", "rakuma", "janpara"]);
    const urls = ids.map((id) => keywordProfile.sources[id]!.buildUrl(keywordCriteria, "token"));
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
    const keyword = criteriaFromValues(keywordProfile, { keyword: " Surface Pro 8 ", priceMin: "30,000", priceMax: "", excludeWords: "ケース フィルム", excludeJunk: false });
    expect(keyword).toEqual({ profile: "keyword", keyword: "Surface Pro 8", priceMin: 30000, priceMax: undefined, excludeWords: ["ケース", "フィルム"], excludeJunk: false });
  });

  it("requires a searchable value for each profile", () => {
    expect(memoryProfile.canSearch(memoryCriteria)).toBe(true);
    expect(memoryProfile.canSearch({ ...memoryCriteria, speeds: [] })).toBe(false);
    expect(keywordProfile.canSearch(keywordCriteria)).toBe(true);
    expect(keywordProfile.canSearch({ ...keywordCriteria, keyword: "   " })).toBe(false);
  });
});
