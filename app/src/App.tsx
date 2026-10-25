import { useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./CrossSearch.css";
import AppUpdater from "./AppUpdater";
import { Icon, type IconName } from "./ui/Icon";
import { importSourceCards, type ImportedListing, type RawSourceCard } from "./sources/listingModel";
import {
  changeFieldValue,
  criteriaFromValues,
  fieldsFor,
  listValue,
  profileFor,
  profileIds,
  sourcesFor,
  stringValue,
  type FieldDef,
  type FieldValues,
  type PartProfile,
  type ProfileId,
} from "./sources/partProfiles";
import { usedSources, type UsedSourceId } from "./sources/sourceCatalog";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

const partIcons: Record<ProfileId, IconName> = {
  memory: "memory",
  gpu: "gpu",
  cpu: "cpu",
  motherboard: "motherboard",
  ssd: "ssd",
  keyword: "keyword",
};

type SourceCount = { name: string; count: number };
type SearchRun = {
  phase: "idle" | "running" | "done";
  total: number;
  done: number;
  completed: number;
  failed: number;
  counts: SourceCount[];
  current?: string;
};

const emptyRun = (): SearchRun => ({ phase: "idle", total: 0, done: 0, completed: 0, failed: 0, counts: [] });

const initialValues = (): Record<ProfileId, FieldValues> => {
  const result = {} as Record<ProfileId, FieldValues>;
  for (const id of profileIds) {
    result[id] = Object.fromEntries(
      Object.entries(profileFor(id).defaults).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
    );
  }
  return result;
};

function renderField(field: FieldDef, value: unknown, onChange: (value: string | string[] | boolean) => void, disabled: boolean) {
  if (field.kind === "select") {
    return (
      <label className="field" key={field.id}>
        <span className="field-label">{field.label}</span>
        <select value={stringValue(value)} disabled={disabled || field.disabled} onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === "text") {
    return (
      <label className="field" key={field.id}>
        <span className="field-label">{field.label}</span>
        <input value={stringValue(value)} placeholder={field.placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  }
  if (field.kind === "number") {
    return (
      <label className="field" key={field.id}>
        <span className="field-label">{field.label}</span>
        <input
          type="text"
          inputMode="numeric"
          value={stringValue(value)}
          placeholder={field.placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }
  if (field.kind === "checks") {
    const selected = listValue(value);
    return (
      <fieldset className="field field-checks" key={field.id} disabled={disabled}>
        <legend className="field-label">{field.label}</legend>
        <div className="check-options">
          {field.options.map((option) => (
            <label className="check-option" key={option.value}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={(event) =>
                  onChange(event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))
                }
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="field-toggle" key={field.id}>
      <input type="checkbox" checked={value !== false} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{field.label}</span>
    </label>
  );
}

function Thumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(!src);
  return (
    <div className="thumb">
      {!failed && src ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span>
          <Icon name="package" size={22} />
          画像なし
        </span>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  tone = "normal",
  title,
  body,
  action,
}: {
  icon: IconName;
  tone?: "normal" | "error";
  title: string;
  body: string;
  action?: { label: string; icon: IconName; onClick: () => void };
}) {
  return (
    <div className={`empty ${tone}`}>
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <strong>{title}</strong>
      <span>{body}</span>
      {action && (
        <button type="button" className="empty-action" onClick={action.onClick}>
          <Icon name={action.icon} size={16} />
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );
}

function ListingRow({
  item,
  index,
  tags,
  sourceName,
}: {
  item: ImportedListing;
  index: number;
  tags: string[];
  sourceName: string;
}) {
  return (
    <article className="listing">
      <div className="rank" aria-label={`${index + 1}番目`}>
        {index + 1}
      </div>
      <Thumb src={item.imageUrl} />
      <div className="listing-body">
        <div className="listing-meta">
          <span className="source-badge" data-source={item.source}>
            {sourceName}
          </span>
          <span className="live-badge">販売中</span>
        </div>
        <h3 title={item.title || undefined}>{item.title || "商品名を取得できませんでした"}</h3>
        <div className="tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          {item.confidence === "review" && <em className="review">要確認</em>}
          {item.confidence === "unchecked" && <em className="unchecked">内容の判定なし</em>}
        </div>
        {item.confidence === "review" && item.reasons.length > 0 && <p className="reasons">{item.reasons.join(" / ")}</p>}
      </div>
      <div className="listing-price">
        <span className="price-label">商品表示価格</span>
        <strong>{yen.format(item.price)}</strong>
        <small>送料は商品ページで確認</small>
        <button
          type="button"
          className="open-button"
          onClick={() => {
            void openUrl(item.url).catch(() => {});
          }}
        >
          <Icon name="external" size={15} />
          <span>商品ページ</span>
        </button>
      </div>
    </article>
  );
}

function App() {
  const [profileId, setProfileId] = useState<ProfileId>("memory");
  const profile: PartProfile = profileFor(profileId);
  const [valuesByProfile, setValuesByProfile] = useState<Record<ProfileId, FieldValues>>(initialValues);
  const values = valuesByProfile[profileId];
  const criteria = useMemo(() => criteriaFromValues(profile, values), [profile, values]);
  const fields = useMemo(() => fieldsFor(profile, values), [profile, values]);
  const availableSources = useMemo(() => sourcesFor(profile, criteria), [profile, criteria]);
  const [selectedSources, setSelectedSources] = useState<string[]>(() => sourcesFor(profileFor("memory")).map((source) => source.id));
  const selectedTargets = useMemo(
    () => availableSources.filter((source) => selectedSources.includes(source.id)),
    [availableSources, selectedSources],
  );
  const [listings, setListings] = useState<ImportedListing[]>([]);
  const [scanned, setScanned] = useState(0);
  const [excluded, setExcluded] = useState(0);
  const [run, setRun] = useState<SearchRun>(emptyRun);
  const [includeReview, setIncludeReview] = useState(false);
  const searchSeq = useRef(0);

  const searching = run.phase === "running";
  const canSearch = profile.canSearch(criteria) && selectedTargets.length > 0;
  const sourceName = (id: UsedSourceId) => usedSources.find((source) => source.id === id)?.name ?? id;
  const sourceNote = profile.sourceNote?.(criteria);
  const allSelected = availableSources.length > 0 && availableSources.every((source) => selectedSources.includes(source.id));

  const disabledReason =
    selectedTargets.length === 0 ? "検索対象を1つ以上選んでください" : !profile.canSearch(criteria) ? profile.canSearchHint : "";

  const visibleListings = useMemo(() => {
    const usable = listings.filter((item) =>
      profile.reviewToggle ? item.confidence === "candidate" || (includeReview && item.confidence === "review") : item.confidence !== "excluded",
    );
    return [...usable].sort((a, b) => a.price - b.price || a.sourceId.localeCompare(b.sourceId));
  }, [listings, includeReview, profile]);

  const reviewCount = useMemo(() => listings.filter((item) => item.confidence === "review").length, [listings]);
  const resultTags = useMemo(() => profile.resultTags(criteria), [profile, criteria]);

  const statusText = (() => {
    if (searching) {
      const current = run.current ?? "サイト";
      return `${current}を確認中…（${Math.min(run.done + 1, run.total)}/${run.total}）`;
    }
    if (run.phase === "done") {
      if (run.completed === 0 && run.failed > 0) return `${run.failed}サイトから応答がありませんでした`;
      return run.failed > 0 ? `${run.completed}/${run.total}サイトから取得・応答なし${run.failed}` : `${run.completed}/${run.total}サイトから取得`;
    }
    return disabledReason || "条件を確認して検索してください";
  })();
  const sourceCountsText = run.phase === "done" && run.counts.length > 0 ? run.counts.map((entry) => `${entry.name} ${entry.count}件`).join(" / ") : "";
  const statusState = searching ? "running" : run.phase === "done" ? (run.completed === 0 && run.failed > 0 ? "error" : "done") : "idle";
  const progress = run.total > 0 ? Math.round((Math.min(run.done, run.total) / run.total) * 100) : 0;

  function setValue(id: string, value: string | string[] | boolean) {
    const next = changeFieldValue(profile, values, id, value);
    setValuesByProfile((current) => ({ ...current, [profileId]: next }));
  }

  function toggleAllSources() {
    setSelectedSources(allSelected ? [] : availableSources.map((source) => source.id));
  }

  function switchProfile(next: ProfileId) {
    if (next === profileId) return;
    searchSeq.current += 1;
    const nextProfile = profileFor(next);
    const nextCriteria = criteriaFromValues(nextProfile, valuesByProfile[next]);
    setProfileId(next);
    setSelectedSources(sourcesFor(nextProfile, nextCriteria).map((source) => source.id));
    setListings([]);
    setScanned(0);
    setExcluded(0);
    setRun(emptyRun());
    setIncludeReview(false);
  }

  async function search() {
    if (!canSearch || searching) return;
    const targets = selectedTargets;
    const seq = ++searchSeq.current;
    const searchCriteria = criteria;

    setRun({ phase: "running", total: targets.length, done: 0, completed: 0, failed: 0, counts: [], current: targets[0]?.name });
    setListings([]);
    setScanned(0);
    setExcluded(0);

    const collected: ImportedListing[] = [];
    const counts: SourceCount[] = [];
    let scannedCount = 0;
    let excludedCount = 0;
    let completed = 0;
    let failed = 0;

    for (const source of targets) {
      if (seq !== searchSeq.current) return;
      setRun({ phase: "running", total: targets.length, done: completed + failed, completed, failed, counts: [...counts], current: source.name });
      const binding = profile.sources[source.id];
      if (!binding) continue;
      try {
        const token = await invoke<string>("begin_source_import", { source: source.id });
        if (seq !== searchSeq.current) return;
        await invoke("open_source_webview", { source: source.id, url: binding.buildUrl(searchCriteria, token) });
        if (seq !== searchSeq.current) return;
        let received = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 600));
          if (seq !== searchSeq.current) return;
          const imported = await invoke<{ source: UsedSourceId; activeConfirmed: boolean; cards: RawSourceCard[] } | null>("take_source_import");
          if (!imported) continue;
          const all = importSourceCards(imported.source, imported.cards, searchCriteria, imported.activeConfirmed);
          const usable = all.filter((item) => item.confidence !== "excluded");
          scannedCount += imported.cards.length;
          excludedCount += all.length - usable.length;
          collected.push(...usable);
          setListings([...collected]);
          setScanned(scannedCount);
          setExcluded(excludedCount);
          completed += 1;
          counts.push({ name: source.name, count: usable.length });
          received = true;
          break;
        }
        if (!received) failed += 1;
      } catch {
        failed += 1;
      }
      if (seq !== searchSeq.current) return;
      setRun({ phase: "running", total: targets.length, done: completed + failed, completed, failed, counts: [...counts], current: source.name });
    }

    if (seq !== searchSeq.current) return;
    setRun({ phase: "done", total: targets.length, done: targets.length, completed, failed, counts });
  }

  const empty = (() => {
    if (run.phase === "idle") {
      return {
        icon: "search" as IconName,
        title: "まだ検索していません",
        body: "条件を選んで「検索」を押すと、販売中の商品を商品表示価格の安い順に表示します。",
      };
    }
    if (searching) {
      return {
        icon: "refresh" as IconName,
        title: "サイトを確認しています",
        body: statusText,
      };
    }
    if (run.completed === 0 && run.failed > 0) {
      return {
        icon: "alert" as IconName,
        tone: "error" as const,
        title: "商品を取得できませんでした",
        body: "サイトから応答がありませんでした。時間をおいて再試行してください。",
        action: { label: "再試行", icon: "refresh" as IconName, onClick: () => void search() },
      };
    }
    if (reviewCount > 0) {
      return {
        icon: "alert" as IconName,
        title: "確認が必要な候補が見つかりました",
        body: `条件を自動で確認できた商品はありません。要確認の候補が${reviewCount}件あります。`,
        action: { label: "要確認を表示", icon: "check" as IconName, onClick: () => setIncludeReview(true) },
      };
    }
    return {
      icon: "package" as IconName,
      title: "条件に合う商品はありませんでした",
      body: "条件を広げるか、検索対象のサイトを増やしてみてください。",
    };
  })();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="package" size={22} />
          </span>
          <div>
            <p>PC PARTS FINDER</p>
            <h1>中古PCパーツ横断検索</h1>
          </div>
        </div>
        <div className="header-side">
          {profile.showCurrentSpec && (
            <div className="spec-card">
              <span>現在のPC</span>
              <strong>DDR4-3200</strong>
              <small>16GB×2・空き2スロット</small>
            </div>
          )}
          <AppUpdater />
        </div>
      </header>

      <div className="workspace">
        <nav className="part-nav" aria-label="パーツの種類">
          <p className="nav-label">パーツを選ぶ</p>
          <div className="nav-items">
            {profileIds.map((id) => (
              <button key={id} type="button" aria-pressed={id === profileId} onClick={() => switchProfile(id)} title={profileFor(id).description}>
                <Icon name={partIcons[id]} size={18} />
                <span>{profileFor(id).modeLabel}</span>
              </button>
            ))}
          </div>
          <div className="nav-foot">
            <span>検索対象</span>
            <strong>
              {selectedTargets.length} / {availableSources.length}サイト
            </strong>
          </div>
        </nav>

        <div className="content">
          <section className="condition-panel" aria-labelledby="condition-heading" aria-busy={searching}>
            <div className="condition-head">
              <div>
                <p className="eyebrow">検索条件</p>
                <h2 id="condition-heading">{profile.heading}</h2>
                <p className="condition-desc">{profile.description}</p>
              </div>
            </div>

            <form
              className="search-form"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              {fields.map((field) => renderField(field, values[field.id], (value) => setValue(field.id, value), searching))}
              <button className="search-action" type="submit" disabled={searching || !canSearch}>
                <Icon name={searching ? "refresh" : "search"} size={18} />
                <span>{searching ? "検索中" : "検索"}</span>
              </button>
            </form>

            <div className="source-block">
              <div className="source-head">
                <div>
                  <h3>検索対象</h3>
                  <p>
                    {availableSources.length}サイト中{selectedTargets.length}サイトを選択
                  </p>
                </div>
                <button type="button" className="text-button" onClick={toggleAllSources} disabled={searching || availableSources.length === 0}>
                  <Icon name={allSelected ? "x" : "check"} size={14} />
                  <span>{allSelected ? "すべて解除" : "すべて選択"}</span>
                </button>
              </div>
              <div className="source-options">
                {availableSources.map((source) => (
                  <label className="source-option" key={source.id}>
                    <input
                      type="checkbox"
                      checked={selectedSources.includes(source.id)}
                      disabled={searching}
                      onChange={(event) =>
                        setSelectedSources((current) =>
                          event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id),
                        )
                      }
                    />
                    <span>
                      <b>{source.name}</b>
                      <small>{profile.sources[source.id]?.summary}</small>
                    </span>
                  </label>
                ))}
              </div>
              {sourceNote && (
                <p className="source-note">
                  <Icon name="info" size={14} />
                  <span>{sourceNote}</span>
                </p>
              )}
            </div>

            <div className={`run-status ${statusState}`} aria-live="polite">
              <span className="status-dot" aria-hidden="true" />
              <strong>{statusText}</strong>
              {sourceCountsText && <span className="status-detail">{sourceCountsText}</span>}
              {scanned > 0 && <span className="status-detail">{scanned}件確認・{excluded}件除外</span>}
              {searching && (
                <div
                  className="progress"
                  role="progressbar"
                  aria-label="検索の進捗"
                  aria-valuemin={0}
                  aria-valuemax={run.total}
                  aria-valuenow={run.done}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </section>

          <section className="results-panel" aria-labelledby="results-heading">
            <div className="results-head">
              <div className="results-title">
                <p className="eyebrow">検索結果</p>
                <h2 id="results-heading">価格の安い順</h2>
                <p className="results-sub">商品表示価格で並べています。送料は商品ページで確認してください。</p>
              </div>
              <div className="results-tools">
                {profile.reviewToggle && (
                  <label className="review-toggle" title={reviewCount === 0 ? "要確認の候補はありません" : undefined}>
                    <input
                      type="checkbox"
                      checked={includeReview}
                      disabled={reviewCount === 0}
                      onChange={(event) => setIncludeReview(event.target.checked)}
                    />
                    <span>要確認も表示</span>
                    <em>{reviewCount}</em>
                  </label>
                )}
                <div className="result-count">
                  <strong>{visibleListings.length}</strong>
                  <span>件</span>
                </div>
              </div>
            </div>

            {(profile.judgementNote || (run.phase === "done" && run.failed > 0)) && (
              <div className="notice-stack">
                {profile.judgementNote && (
                  <p className="notice">
                    <Icon name="info" size={15} />
                    <span>{profile.judgementNote}</span>
                  </p>
                )}
                {run.phase === "done" && run.failed > 0 && (
                  <p className="notice warning">
                    <Icon name="alert" size={15} />
                    <span>{run.failed}サイトから応答がありませんでした。取得できた結果だけを表示しています。</span>
                  </p>
                )}
              </div>
            )}

            <div className="results-scroll">
              {visibleListings.length > 0 ? (
                <div className="price-list">
                  {visibleListings.map((item, index) => (
                    <ListingRow key={item.sourceId} item={item} index={index} tags={resultTags} sourceName={sourceName(item.source)} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={empty.icon} tone={empty.tone} title={empty.title} body={empty.body} action={empty.action} />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;
