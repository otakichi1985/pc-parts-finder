export type UsedSourceId = "mercari" | "yahoo-flea" | "rakuma" | "janpara" | "pc-koubou" | "hardoff";

export type UsedSource = {
  id: UsedSourceId;
  name: string;
  status: "connected" | "planned";
};

export const usedSources: UsedSource[] = [
  { id: "mercari", name: "メルカリ", status: "connected" },
  { id: "yahoo-flea", name: "Yahoo!フリマ", status: "connected" },
  { id: "rakuma", name: "ラクマ", status: "connected" },
  { id: "janpara", name: "じゃんぱら", status: "connected" },
  { id: "pc-koubou", name: "パソコン工房中古", status: "connected" },
  { id: "hardoff", name: "ハードオフ", status: "connected" },
];
