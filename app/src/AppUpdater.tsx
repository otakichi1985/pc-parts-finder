import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./AppUpdater.css";

interface UpdateInfo {
  currentVersion: string;
  version: string;
  notes: string;
  publishedAt: string;
  assetUrl: string;
  assetSize: number;
}

interface UpdateProgress {
  stage: "downloading" | "preparing" | "restarting";
  downloaded: number;
  total: number | null;
}

type Status = "idle" | "checking" | "downloading" | "preparing" | "restarting" | "uptodate" | "error";

const RELEASE_PAGE = "https://github.com/otakichi1985/pc-parts-finder/releases/tag/v";

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function formatNotes(notes: string): string {
  const cleaned = notes.replace(/\s+/g, " ").trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 160)}…` : cleaned || "リリースノートは公開されていません。";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function AppUpdater() {
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [message, setMessage] = useState("");
  const started = useRef(false);

  const busy = status === "checking" || status === "downloading" || status === "preparing" || status === "restarting";

  async function runCheck(interactive: boolean) {
    if (busy) return;
    setStatus("checking");
    setMessage("");
    try {
      const found = await invoke<UpdateInfo | null>("check_for_update");
      if (found) {
        setUpdate(found);
        setStatus("idle");
      } else {
        setUpdate(null);
        if (interactive) {
          setStatus("uptodate");
          setMessage(`最新版（v${version}）です`);
        } else {
          setStatus("idle");
        }
      }
    } catch (error) {
      setUpdate(null);
      if (interactive) {
        setStatus("error");
        setMessage(String(error));
      } else {
        setStatus("idle");
      }
    }
  }

  async function applyUpdate(target: UpdateInfo) {
    if (busy) return;
    setStatus("downloading");
    setMessage("");
    try {
      await invoke("download_and_apply_update", { url: target.assetUrl });
      setStatus("restarting");
    } catch (error) {
      setStatus("error");
      setMessage(String(error));
    }
  }

  useEffect(() => {
    if (!inTauri()) return;
    let unlisten: UnlistenFn | undefined;
    (async () => {
      try {
        setVersion(await invoke<string>("get_app_version"));
      } catch {
        setVersion("");
      }
      try {
        unlisten = await listen<UpdateProgress>("pcpf-update-progress", (event) => {
          setProgress(event.payload);
          if (event.payload.stage === "restarting") setStatus("restarting");
          else if (event.payload.stage === "preparing") setStatus("preparing");
          else setStatus("downloading");
        });
      } catch {
        unlisten = undefined;
      }
      if (started.current) return;
      started.current = true;
      const auto = await invoke<boolean>("auto_update_requested").catch(() => false);
      if (auto) {
        setStatus("checking");
        try {
          const found = await invoke<UpdateInfo | null>("check_for_update");
          if (found) {
            setUpdate(found);
            await applyUpdate(found);
          } else {
            setStatus("idle");
          }
        } catch {
          setStatus("idle");
        }
      } else {
        await runCheck(false);
      }
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  if (!inTauri()) return null;

  const percent = progress && progress.total
    ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
    : null;

  return (
    <div className="updater">
      <div className="updater-line">
        <span className="updater-version">PC Parts Finder v{version || "—"}</span>
        {status === "checking" && <span className="updater-note">更新を確認中…</span>}
        {status === "uptodate" && <span className="updater-note">{message}</span>}
        {status === "error" && <span className="updater-note updater-error">{message}</span>}
        {status === "downloading" && <span className="updater-note">更新ファイルをダウンロード中…{percent !== null ? ` ${percent}%` : ""}</span>}
        {status === "preparing" && <span className="updater-note">更新の準備中…</span>}
        {status === "restarting" && <span className="updater-note">再起動して更新を適用します…</span>}
        <button type="button" className="updater-check" onClick={() => runCheck(true)} disabled={busy}>
          更新を確認
        </button>
      </div>
      {update && (
        <div className="updater-banner">
          <div className="updater-banner-text">
            <strong>新しいバージョン v{update.version} があります（現在 v{version}）</strong>
            <span>{formatNotes(update.notes)}</span>
            {update.assetSize > 0 && <small>ダウンロードサイズ: 約{formatBytes(update.assetSize)}</small>}
          </div>
          <div className="updater-banner-actions">
            <button type="button" onClick={() => openUrl(`${RELEASE_PAGE}${update.version}`)}>リリースノートを見る</button>
            <button type="button" className="updater-primary" onClick={() => applyUpdate(update)} disabled={busy}>
              {busy ? "更新中…" : "今すぐ更新して再起動"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppUpdater;