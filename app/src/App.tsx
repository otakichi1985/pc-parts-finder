import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./CrossSearch.css";
import AppUpdater from "./AppUpdater";
import { importSourceCards, type ImportedListing, type RawSourceCard } from "./sources/listingModel";
import { criteriaFromValues, listValue, profileFor, profileIds, sourcesFor, stringValue, type FieldDef, type FieldValues, type PartProfile, type ProfileId } from "./sources/partProfiles";
import { usedSources } from "./sources/sourceCatalog";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const initialValues = (): Record<ProfileId, FieldValues> => ({
  memory: profileFor("memory").defaults,
  keyword: profileFor("keyword").defaults,
});
const initialStatus = "条件を確認して検索してください";

function renderField(field: FieldDef, value: unknown, onChange: (value: string | string[] | boolean) => void) {
  if (field.kind === "select") {
    return <label key={field.id}><span>{field.label}</span><select value={stringValue(value)} disabled={field.disabled} onChange={(event) => onChange(event.target.value)}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }
  if (field.kind === "text") {
    return <label key={field.id} className="keyword-field"><span>{field.label}</span><input value={stringValue(value)} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
  }
  if (field.kind === "number") {
    return <label key={field.id} className="keyword-field"><span>{field.label}</span><input type="text" inputMode="numeric" value={stringValue(value)} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
  }
  if (field.kind === "checks") {
    const selected = listValue(value);
    return <div key={field.id} className="speed-field"><span>{field.label}</span><div className="speed-options">{field.options.map((option) => <label className="speed-option" key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))} /><b>{option.label}</b></label>)}</div></div>;
  }
  return <label key={field.id} className="toggle-field"><input type="checkbox" checked={value !== false} onChange={(event) => onChange(event.target.checked)} /><b>{field.label}</b></label>;
}

function App() {
  const [profileId, setProfileId] = useState<ProfileId>("memory");
  const profile: PartProfile = profileFor(profileId);
  const [valuesByProfile, setValuesByProfile] = useState<Record<ProfileId, FieldValues>>(initialValues);
  const values = valuesByProfile[profileId];
  const availableSources = useMemo(() => sourcesFor(profile), [profile]);
  const [selectedSources, setSelectedSources] = useState<string[]>(() => sourcesFor(profileFor("memory")).map((source) => source.id));
  const [status, setStatus] = useState(initialStatus);
  const [scanned, setScanned] = useState(0);
  const [excluded, setExcluded] = useState(0);
  const [listings, setListings] = useState<ImportedListing[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [includeReview, setIncludeReview] = useState(false);

  const criteria = useMemo(() => criteriaFromValues(profile, values), [profile, values]);
  const canSearch = profile.canSearch(criteria) && selectedSources.length > 0;
  const sourceName = (id: ImportedListing["source"]) => usedSources.find((source) => source.id === id)?.name ?? id;

  const visibleListings = useMemo(() => {
    const usable = listings.filter((item) => (profile.id === "memory" ? includeReview || item.confidence === "candidate" : item.confidence !== "excluded"));
    return [...usable].sort((a, b) => a.price - b.price);
  }, [listings, includeReview, profile.id]);

  function setValue(id: string, value: string | string[] | boolean) {
    setValuesByProfile((current) => ({ ...current, [profileId]: { ...current[profileId], [id]: value } }));
  }

  function switchProfile(next: ProfileId) {
    if (next === profileId) return;
    setProfileId(next);
    setSelectedSources(sourcesFor(profileFor(next)).map((source) => source.id));
    setListings([]);
    setScanned(0);
    setExcluded(0);
    setHasSearched(false);
    setSearching(false);
    setStatus(initialStatus);
  }

  async function search() {
    if (!canSearch) return;
    const targets = availableSources.filter((source) => selectedSources.includes(source.id));
    setSearching(true);
    setHasSearched(true);
    setStatus(`${targets.length}サイトの販売中商品を順番に確認しています…`);
    setListings([]);
    setScanned(0);
    setExcluded(0);
    try {
      const collected: ImportedListing[] = [];
      let scannedCount = 0;
      let excludedCount = 0;
      let completed = 0;
      let failed = 0;
      const sourceCounts: string[] = [];
      for (const source of targets) {
        const binding = profile.sources[source.id];
        if (!binding) continue;
        setStatus(`${source.name}を確認中…（${completed + failed + 1}/${targets.length}）`);
        try {
          const token = await invoke<string>("begin_source_import", { source: source.id });
          await invoke("open_source_webview", { source: source.id, url: binding.buildUrl(criteria, token) });
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
      setStatus(`${completed}/${targets.length}サイト取得・${sourceCounts.join(" / ")}${failed ? ` / 応答なし${failed}` : ""}`);
    } catch {
      setStatus("検索を開始できませんでした");
    }
    setSearching(false);
  }

  return <main className="cross-app">
    <AppUpdater />
    <header className="cross-header">
      <div><p>PC PARTS FINDER</p><h1>{profile.title}</h1><span>{profile.description}</span></div>
      {profile.showCurrentSpec && <div className="current-spec"><small>現在のPC</small><strong>DDR4-3200 16GB×2</strong><span>空き2スロット</span></div>}
    </header>

    <section className="search-panel" aria-label="検索条件">
      <div className="search-heading">
        <span>SEARCH CONDITION</span>
        <h2>{profile.heading}</h2>
        <div className="mode-switch" role="group" aria-label="検索モード">
          {profileIds.map((id) => <button key={id} type="button" aria-pressed={id === profileId} onClick={() => switchProfile(id)}>{profileFor(id).modeLabel}</button>)}
        </div>
      </div>
      <div className={`search-fields ${profile.id}`}>
        {profile.fields.map((field) => renderField(field, values[field.id], (value) => setValue(field.id, value)))}
        <button className="search-action" type="button" onClick={search} disabled={searching || !canSearch}>{searching ? "検索中…" : "中古価格を横断検索"}</button>
      </div>
    </section>

    <section className="source-panel" aria-label="検索対象サイト">
      <div className="source-title"><b>検索対象</b><span>価格を比べたいサイトを選択</span></div>
      <div className="source-options">{availableSources.map((source) => <label className="source-option" key={source.id}>
        <input type="checkbox" checked={selectedSources.includes(source.id)} onChange={(event) => setSelectedSources((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))} />
        <span><b>{source.name}</b><small>{profile.sources[source.id]?.summary}</small></span>
      </label>)}</div>
      <div className="search-status"><strong>{selectedSources.length === 0 ? "検索対象を1つ以上選んでください" : status}</strong>{scanned > 0 && <span>{scanned}件確認・{excluded}件除外</span>}</div>
    </section>

    <section className="result-panel">
      <div className="result-header"><div><p>SEARCH RESULTS</p><h2>価格の安い順</h2></div><div className="result-tools">{profile.id === "memory" && <label><input type="checkbox" checked={includeReview} onChange={(event) => setIncludeReview(event.target.checked)} /> 要確認も含める</label>}<strong>{visibleListings.length}件</strong></div></div>
      {profile.id === "keyword" && <div className="judgement-notice">内容の判定はしていません。キーワードに一致した販売中の出品を価格の安い順に並べています。</div>}
      <div className="shipping-notice">現在は商品表示価格での暫定順です。送料込み総額の確定は商品詳細取得の接続後に行います。</div>
      {visibleListings.length > 0 ? <div className="price-list">{visibleListings.map((item, index) => <article className="price-row" key={item.sourceId}>
        <div className="position">{index + 1}</div>
        <div className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span>画像なし</span>}</div>
        <div className="item-detail"><span className="market">{sourceName(item.source)}・販売中</span><h3>{item.title}</h3><div className="tags">{profile.resultTags(criteria).map((tag) => <span key={tag}>{tag}</span>)}{item.confidence === "review" && <em>要確認</em>}{item.confidence === "unchecked" && <em>内容の判定なし</em>}</div>{item.confidence === "review" && item.reasons.length > 0 && <small>{item.reasons.join(" / ")}</small>}</div>
        <div className="price-cell"><span>商品表示価格</span><strong>{yen.format(item.price)}</strong><small>送料確認中</small><button type="button" onClick={() => openUrl(item.url)}>商品ページを開く</button></div>
      </article>)}</div> : <div className="empty-results"><strong>{hasSearched && !searching ? "条件に合う販売中商品はありません" : "まだ検索していません"}</strong><span>{hasSearched && !searching ? (profile.id === "memory" ? `${stringValue(criteria.profile === "memory" ? criteria.layout : "")}・選択した速度帯で確認しました。` : `「${criteria.profile === "keyword" ? criteria.keyword : ""}」で確認しました。`) : "上の条件を確認して「中古価格を横断検索」を押してください。"}</span></div>}
    </section>
  </main>;
}

export default App;
