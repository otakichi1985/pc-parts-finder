export type SearchCriteria = { generation: "DDR4"; capacity: string; layout: string; speeds: string[]; keyword: string };
export type UsedSourceId = "mercari" | "yahoo-flea" | "rakuma" | "janpara" | "pc-koubou" | "hardoff";
export type UsedSource = {
  id: UsedSourceId;
  name: string;
  status: "connected" | "planned";
  filterSummary: string;
  buildSearchUrl(criteria: SearchCriteria, token?: string): string;
};

const terms = (criteria: SearchCriteria) => [criteria.generation, criteria.layout, criteria.capacity, "デスクトップ用", criteria.keyword.trim()].filter(Boolean).join(" ");

export const usedSources: UsedSource[] = [
  { id: "mercari", name: "メルカリ", status: "connected", filterSummary: "販売中のみ＋共通除外", buildSearchUrl: (c, token) => `https://jp.mercari.com/search?${new URLSearchParams({ keyword: terms(c), status: "on_sale", ...(token ? { pcpf_token: token } : {}) })}` },
  { id: "yahoo-flea", name: "Yahoo!フリマ", status: "connected", filterSummary: "販売中のみ＋共通除外", buildSearchUrl: (c, token) => `https://paypayfleamarket.yahoo.co.jp/search/${encodeURIComponent(terms(c))}?${new URLSearchParams({ open: "1", ...(token ? { pcpf_token: token } : {}) })}` },
  { id: "rakuma", name: "ラクマ", status: "connected", filterSummary: "販売中のみ＋共通除外", buildSearchUrl: (c, token) => `https://fril.jp/s?${new URLSearchParams({ query: terms(c), transaction: "selling", ...(token ? { pcpf_token: token } : {}) })}` },
  { id: "janpara", name: "じゃんぱら", status: "connected", filterSummary: "在庫あり＋デスクトップ", buildSearchUrl: (c, token) => `https://www.janpara.co.jp/sale/search/result/?${new URLSearchParams({ CHKOUTCOM: "1", KEYWORDS: `${c.generation} デスクトップ ${c.layout}`, OUTCLSCODE: "8", ORDER: "3", ...(token ? { pcpf_token: token } : {}) })}` },
  { id: "pc-koubou", name: "パソコン工房中古", status: "connected", filterSummary: "現行中古＋DDR4カテゴリ", buildSearchUrl: (_c, token) => `https://www.pc-koubou.jp/pc/used_memory_d_ddr4_32gb.php${token ? `?pcpf_token=${encodeURIComponent(token)}` : ""}` },
  { id: "hardoff", name: "ハードオフ", status: "connected", filterSummary: "販売中のみ＋DDR4カテゴリ", buildSearchUrl: (_c, token) => `https://netmall.hardoff.co.jp/cate/00010002000500090001/${token ? `?pcpf_token=${encodeURIComponent(token)}` : ""}` },
];
