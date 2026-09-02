import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./CrossSearch.css";
import AppUpdater from "./AppUpdater";
import { importSourceCards, type ImportedListing, type RawSourceCard } from "./sources/listingModel";
import { usedSources, type SearchCriteria } from "./sources/sourceCatalog";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function App() {
  const [layout, setLayout] = useState("32GB×2");
  const [selectedSpeeds, setSelectedSpeeds] = useState(["2400", "2666", "3200"]);
  const [keyword, setKeyword] = useState("");
  const [includeReview, setIncludeReview] = useState(false);
  const [status, setStatus] = useState("条件を確認して検索してください");
  const [scanned, setScanned] = useState(0);
  const [excluded, setExcluded] = useState(0);
  const [listings, setListings] = useState<ImportedListing[]>([]);
  const [searching, setSearching] = useState(false);
  const searchableSources = useMemo(() => usedSources.filter((source) => source.status === "connected"), []);
  const [selectedSources, setSelectedSources] = useState(() => searchableSources.map((source) => source.id));
  const [hasSearched, setHasSearched] = useState(false);
  const sourceName = (id: ImportedListing["source"]) => usedSources.find((source) => source.id === id)?.name ?? id;
  const capacity = layout === "32GB×2" ? "64GB" : layout === "16GB×2" ? "32GB" : "16GB";

  const visibleListings = useMemo(() => [...listings]
    .filter((item) => includeReview || item.confidence === "candidate")
    .sort((a, b) => a.price - b.price), [listings, includeReview]);

  async function searchUsedMemory() {
    if (selectedSources.length === 0 || selectedSpeeds.length === 0) return;
    setSearching(true);
    setHasSearched(true);
    setStatus(`${selectedSources.length}サイトの販売中商品を順番に確認しています…`);
    setListings([]);
    setScanned(0);
    setExcluded(0);
    try {
      const criteria: SearchCriteria = { generation: "DDR4", capacity, layout, speeds: selectedSpeeds, keyword };
      const connected = searchableSources.filter((source) => selectedSources.includes(source.id));
      const collected: ImportedListing[] = [];
      let scannedCount = 0;
      let excludedCount = 0;
      let completed = 0;
      let failed = 0;
      const sourceCounts: string[] = [];
      for (const source of connected) {
        setStatus(`${source.name}を確認中…（${completed + failed + 1}/${connected.length}）`);
        try {
          const token = await invoke<string>("begin_source_import", { source: source.id });
          await invoke("open_source_webview", { source: source.id, url: source.buildSearchUrl(criteria, token) });
          let received = false;
          for (let attempt = 0; attempt < 20; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 600));
            const imported = await invoke<{ source: ImportedListing["source"]; activeConfirmed: boolean; cards: RawSourceCard[] } | null>("take_source_import");
            if (!imported) continue;
            const all = importSourceCards(imported.source, imported.cards, criteria, imported.activeConfirmed);
            const usable = all.filter((item) => item.confidence !== "excluded");
            scannedCount += imported.cards.length;
            excludedCount += all.length - usable.length;
            collected.push(...usable);
            setListings([...collected]);
            setScanned(scannedCount);
            setExcluded(excludedCount);
            completed += 1;
            sourceCounts.push(`${source.name} ${usable.length}件`);
            received = true;
            break;
          }
          if (!received) failed += 1;
        } catch {
          failed += 1;
        }
      }
      setStatus(`${completed}/${connected.length}サイト取得・${sourceCounts.join(" / ")}${failed ? ` / 応答なし${failed}` : ""}`);
    } catch {
      setStatus("検索を開始できませんでした");
    }
    setSearching(false);
  }

  return <main className="cross-app">
    <AppUpdater />
    <header className="cross-header">
      <div><p>PC PARTS FINDER</p><h1>中古メモリ横断検索</h1><span>条件に合わない出品を除き、安い順に比較する。</span></div>
      <div className="current-spec"><small>現在のPC</small><strong>DDR4-3200 16GB×2</strong><span>空き2スロット</span></div>
    </header>

    <section className="search-panel" aria-label="検索条件">
      <div className="search-heading"><span>SEARCH CONDITION</span><h2>欲しいメモリ</h2></div>
      <label><span>規格</span><select disabled><option>DDR4</option></select></label>
      <label><span>容量・枚数</span><select value={layout} onChange={(event) => setLayout(event.target.value)}><option>32GB×2</option><option>16GB×2</option><option>8GB×2</option></select></label>
      <div className="speed-field"><span>速度帯（複数選択可）</span><div className="speed-options">{[["2400", "2400"], ["2666", "2666～3000"], ["3200", "3200以上"]].map(([value, label]) => <label className="speed-option" key={value}><input type="checkbox" checked={selectedSpeeds.includes(value)} onChange={(event) => setSelectedSpeeds((current) => event.target.checked ? [...current, value] : current.filter((speed) => speed !== value))} /><b>{label}</b></label>)}</div></div>
      <label className="keyword-field"><span>メーカー・型番（任意）</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="例：Crucial" /></label>
      <button className="search-action" type="button" onClick={searchUsedMemory} disabled={searching || selectedSources.length === 0 || selectedSpeeds.length === 0}>{searching ? "検索中…" : "中古価格を横断検索"}</button>
    </section>

    <section className="source-panel" aria-label="検索対象サイト">
      <div className="source-title"><b>検索対象</b><span>価格を比べたいサイトを選択</span></div>
      <div className="source-options">{searchableSources.map((source) => <label className="source-option" key={source.id}>
        <input type="checkbox" checked={selectedSources.includes(source.id)} onChange={(event) => setSelectedSources((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))} />
        <span><b>{source.name}</b><small>{source.filterSummary}</small></span>
      </label>)}</div>
      <div className="search-status"><strong>{selectedSources.length === 0 ? "検索対象を1つ以上選んでください" : status}</strong>{scanned > 0 && <span>{scanned}件確認・{excluded}件除外</span>}</div>
    </section>

    <section className="result-panel">
      <div className="result-header"><div><p>SEARCH RESULTS</p><h2>価格の安い順</h2></div><div className="result-tools"><label><input type="checkbox" checked={includeReview} onChange={(event) => setIncludeReview(event.target.checked)} /> 要確認も含める</label><strong>{visibleListings.length}件</strong></div></div>
      <div className="shipping-notice">現在は商品表示価格での暫定順です。送料込み総額の確定は商品詳細取得の接続後に行います。</div>
      {visibleListings.length > 0 ? <div className="price-list">{visibleListings.map((item, index) => <article className="price-row" key={item.sourceId}>
        <div className="position">{index + 1}</div>
        <div className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span>画像なし</span>}</div>
        <div className="item-detail"><span className="market">{sourceName(item.source)}・販売中</span><h3>{item.title}</h3><div className="tags"><span>DDR4</span><span>{layout}</span><span>デスクトップ用</span>{item.confidence === "review" && <em>要確認</em>}</div>{item.reasons.length > 0 && <small>{item.reasons.join(" / ")}</small>}</div>
        <div className="price-cell"><span>商品表示価格</span><strong>{yen.format(item.price)}</strong><small>送料確認中</small><button type="button" onClick={() => openUrl(item.url)}>商品ページを開く</button></div>
      </article>)}</div> : <div className="empty-results"><strong>{hasSearched && !searching ? "条件に合う販売中商品はありません" : "まだ検索していません"}</strong><span>{hasSearched && !searching ? `${layout}・選択した速度帯で確認しました。` : "上の条件を確認して「中古価格を横断検索」を押してください。"}</span></div>}
    </section>
  </main>;
}

export default App;
