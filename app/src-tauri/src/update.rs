use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use tauri::{AppHandle, Emitter};

const DEFAULT_API_BASE: &str = "https://api.github.com";
const GH_REPO: &str = "otakichi1985/pc-parts-finder";
const ASSET_NAME: &str = "PC-Parts-Finder.exe";
const STAGING_DIR_NAME: &str = ".pc-parts-finder-staging";
const PROGRESS_EVENT: &str = "pcpf-update-progress";

const UPDATE_API_ENV: &str = "PC_PARTS_FINDER_UPDATE_API";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub version: String,
    pub notes: String,
    pub published_at: String,
    pub asset_url: String,
    pub asset_size: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub stage: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GhAsset>,
}

fn api_base() -> String {
    std::env::var(UPDATE_API_ENV).unwrap_or_else(|_| DEFAULT_API_BASE.to_string())
}

fn latest_release_url() -> String {
    format!("{}/repos/{}/releases/latest", api_base(), GH_REPO)
}

fn current_app_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
struct Version {
    parts: [u32; 3],
}

fn parse_version(input: &str) -> Option<Version> {
    let trimmed = input.trim();
    let core = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    let core = core.split(['-', '+']).next().unwrap_or(core);
    let mut numbers = core.split('.').map(|part| part.parse::<u32>().ok());
    let mut parts = [0_u32; 3];
    for slot in parts.iter_mut() {
        *slot = numbers.next().flatten()?;
    }
    Some(Version { parts })
}

impl Version {
    fn is_newer_than(&self, other: &Version) -> bool {
        self.parts > other.parts
    }
}

fn build_update_info(current: &str, release: GhRelease) -> Result<Option<UpdateInfo>, String> {
    let tag_version = parse_version(&release.tag_name)
        .ok_or_else(|| format!("リリースのバージョン表記が不正です: {}", release.tag_name))?;
    let current_version = parse_version(current).ok_or_else(|| "現在のバージョン表記が不正です".to_string())?;
    if !tag_version.is_newer_than(&current_version) {
        return Ok(None);
    }
    let asset = release
        .assets
        .into_iter()
        .find(|asset| asset.name == ASSET_NAME)
        .ok_or_else(|| "新しいリリースに更新用ファイルがありません".to_string())?;
    let version = release
        .tag_name
        .trim_start_matches(['v', 'V'])
        .to_string();
    Ok(Some(UpdateInfo {
        current_version: current.to_string(),
        version,
        notes: release.body.unwrap_or_default(),
        published_at: release.published_at.unwrap_or_default(),
        asset_url: asset.browser_download_url,
        asset_size: asset.size,
    }))
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    current_app_version(&app)
}

#[tauri::command]
pub fn auto_update_requested() -> bool {
    if std::env::args().any(|arg| arg == "--pcpf-skip-auto-update") {
        return false;
    }
    std::env::var("PC_PARTS_FINDER_AUTO_UPDATE").map(|value| value == "1").unwrap_or(false)
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let client = http_client()?;
    let response = client
        .get(latest_release_url())
        .send()
        .await
        .map_err(|error| format!("更新を確認できませんでした（{}）", friendly_http_error(&error)))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("更新の確認に失敗しました（HTTP {}）", response.status().as_u16()));
    }
    let release: GhRelease = response
        .json()
        .await
        .map_err(|_| "更新情報を読み取れませんでした".to_string())?;
    build_update_info(&current_app_version(&app), release)
}

fn friendly_http_error(error: &reqwest::Error) -> &str {
    if error.is_timeout() || error.is_connect() {
        "インターネット接続を確認してください"
    } else {
        "サーバーに接続できません"
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("PC-Parts-Finder-Updater/1.0")
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "通信機能を初期化できませんでした".to_string())
}

fn staging_dir(exe_dir: &Path) -> PathBuf {
    exe_dir.join(STAGING_DIR_NAME)
}

#[tauri::command]
pub async fn download_and_apply_update(app: AppHandle, url: String) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|_| "現在の実行ファイルの場所を取得できませんでした".to_string())?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| "実行ファイルのフォルダを特定できませんでした".to_string())?;
    let staging = staging_dir(exe_dir);
    fs::create_dir_all(&staging).map_err(|_| {
        format!(
            "更新用の一時フォルダを作れませんでした。{} に書き込み権限があるか確認してください。",
            exe_dir.display()
        )
    })?;
    let new_exe = staging.join("new-version.exe");
    let _ = fs::remove_file(&new_exe);

    emit_progress(&app, "downloading", 0, None);

    let client = http_client()?;
    let mut response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("更新ファイルを取得できませんでした（{}）", friendly_http_error(&error)))?;
    if !response.status().is_success() {
        return Err(format!("更新ファイルの取得に失敗しました（HTTP {}）", response.status().as_u16()));
    }
    let total = response.content_length();
    let mut file = fs::File::create(&new_exe).map_err(|_| "更新ファイルを作成できませんでした".to_string())?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = response.chunk().await.map_err(|_| "更新ファイルの途中で通信が切れました".to_string())? {
        file.write_all(&chunk).map_err(|_| "更新ファイルの保存に失敗しました".to_string())?;
        downloaded += chunk.len() as u64;
        emit_progress(&app, "downloading", downloaded, total);
    }
    file.flush().map_err(|_| "更新ファイルの保存に失敗しました".to_string())?;
    drop(file);

    if !is_executable(&new_exe) {
        let _ = fs::remove_file(&new_exe);
        return Err("取得したファイルが実行ファイルとして正しくありません".to_string());
    }

    emit_progress(&app, "preparing", 0, total);

    let wait_pid = std::process::id();
    let spawn_result = Command::new(&new_exe)
        .arg("--pcpf-updater")
        .arg("--pcpf-target")
        .arg(&current_exe)
        .arg("--pcpf-source")
        .arg(&new_exe)
        .arg("--pcpf-wait-pid")
        .arg(wait_pid.to_string())
        .arg("--pcpf-cleanup")
        .arg(&staging)
        .spawn();

    if spawn_result.is_err() {
        let _ = fs::remove_file(&new_exe);
        return Err("更新を開始できませんでした。もう一度お試しください。".to_string());
    }

    emit_progress(&app, "restarting", 0, total);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(700));
        handle.exit(0);
    });
    Ok(())
}

fn emit_progress(app: &AppHandle, stage: &str, downloaded: u64, total: Option<u64>) {
    let _ = app.emit(PROGRESS_EVENT, UpdateProgress { stage: stage.to_string(), downloaded, total });
}

fn is_executable(path: &Path) -> bool {
    match fs::read(path) {
        Ok(bytes) => bytes.starts_with(b"MZ"),
        Err(_) => false,
    }
}

/// 起動直後に呼ぶ。更新役として起動された場合は差し替え処理を実行して終了する。
/// 通常起動に `--pcpf-cleanup` が付いていた場合は残骸を掃除して通常起動へ進める。
pub fn handle_update_argv() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if !args.iter().any(|arg| arg == "--pcpf-updater") {
        let cleanup_dir = flag_value(&args, "--pcpf-cleanup");
        let cleanup_old = flag_value(&args, "--pcpf-cleanup-old");
        if cleanup_dir.is_some() || cleanup_old.is_some() {
            if let Some(dir) = cleanup_dir {
                remove_retry(Path::new(&dir), true);
            }
            if let Some(old) = cleanup_old {
                remove_retry(Path::new(&old), false);
            }
        }
        return false;
    }

    let exit_code = updater_role(&args);
    std::process::exit(exit_code);
}

fn flag_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|arg| arg == flag)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

fn updater_role(args: &[String]) -> i32 {
    let target = flag_value(args, "--pcpf-target");
    let source = flag_value(args, "--pcpf-source");
    let wait_pid = flag_value(args, "--pcpf-wait-pid").and_then(|value| value.parse::<u32>().ok());
    let cleanup = flag_value(args, "--pcpf-cleanup");
    let (Some(target), Some(source), Some(wait_pid)) = (target, source, wait_pid) else {
        return 1;
    };
    match updater_execute(Path::new(&target), Path::new(&source), cleanup.as_deref(), wait_pid) {
        Ok(()) => 0,
        Err(error) => {
            if let Some(dir) = cleanup {
                let _ = fs::write(Path::new(&dir).join("update-error.log"), error.clone());
            }
            eprintln!("{error}");
            1
        }
    }
}

fn updater_execute(target: &Path, source: &Path, cleanup: Option<&str>, wait_pid: u32) -> Result<(), String> {
    wait_for_process_exit(wait_pid)?;

    let mut old_path = target.as_os_str().to_owned();
    old_path.push(".old");
    let old_path = PathBuf::from(old_path);
    let _ = remove_retry(&old_path, false);

    fs::rename(target, &old_path)
        .map_err(|error| format!("現在のアプリを退避できませんでした（{error}）"))?;

    if let Err(error) = fs::rename(source, target) {
        let _ = fs::rename(&old_path, target);
        return Err(format!("新しいアプリを配置できませんでした（{error}）"));
    }

    let mut command = Command::new(target);
    if let Some(cleanup) = cleanup {
        command.arg("--pcpf-cleanup").arg(cleanup);
    }
    command
        .arg("--pcpf-cleanup-old")
        .arg(&old_path)
        .arg("--pcpf-skip-auto-update");
    command
        .spawn()
        .map_err(|error| format!("更新後のアプリを起動できませんでした（{error}）"))?;

    remove_retry(&old_path, false);
    Ok(())
}

fn remove_retry(path: &Path, directory: bool) -> bool {
    for _ in 0..10 {
        let result = if directory { fs::remove_dir_all(path) } else { fs::remove_file(path) };
        if result.is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

#[cfg(target_os = "windows")]
fn wait_for_process_exit(pid: u32) -> Result<(), String> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        Storage::FileSystem::SYNCHRONIZE,
        System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION},
    };
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid);
        if handle.is_null() {
            return Ok(());
        }
        let result = WaitForSingleObject(handle, 90_000);
        CloseHandle(handle);
        if result == WAIT_OBJECT_0 {
            Ok(())
        } else {
            Err("更新の準備が完了しませんでした".to_string())
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn wait_for_process_exit(_pid: u32) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ver(value: &str) -> Version {
        parse_version(value).expect("valid version")
    }

    #[test]
    fn parses_common_tag_and_version_forms() {
        assert_eq!(ver("v0.2.0").parts, [0, 2, 0]);
        assert_eq!(ver("1.0.0").parts, [1, 0, 0]);
        assert_eq!(ver("v1.2.3-beta.1").parts, [1, 2, 3]);
    }

    #[test]
    fn rejects_unparseable_versions() {
        assert!(parse_version("abc").is_none());
        assert!(parse_version("1.2").is_none());
    }

    #[test]
    fn compares_newer_versions() {
        assert!(ver("0.2.0").is_newer_than(&ver("0.1.0")));
        assert!(ver("0.10.0").is_newer_than(&ver("0.9.9")));
        assert!(!ver("0.1.0").is_newer_than(&ver("0.1.0")));
        assert!(!ver("0.1.0").is_newer_than(&ver("0.2.0")));
    }

    #[test]
    fn build_update_info_rejects_equal_or_older() {
        let release = GhRelease {
            tag_name: "v0.1.0".into(),
            body: None,
            published_at: None,
            assets: vec![GhAsset { name: ASSET_NAME.into(), browser_download_url: "https://example.test/file".into(), size: 10 }],
        };
        assert!(build_update_info("0.1.0", release).unwrap().is_none());
    }

    #[test]
    fn build_update_info_requires_matching_asset() {
        let release = GhRelease {
            tag_name: "v0.2.0".into(),
            body: None,
            published_at: None,
            assets: vec![GhAsset { name: "PC-Parts-Finder-setup.exe".into(), browser_download_url: "https://example.test/file".into(), size: 10 }],
        };
        assert!(build_update_info("0.1.0", release).is_err());
    }

    #[test]
    fn build_update_info_selects_portable_exe_asset() {
        let release = GhRelease {
            tag_name: "v0.2.0".into(),
            body: Some("修正内容".into()),
            published_at: Some("2026-09-02T00:00:00Z".into()),
            assets: vec![
                GhAsset { name: "PC-Parts-Finder-setup.exe".into(), browser_download_url: "https://example.test/setup".into(), size: 10 },
                GhAsset { name: ASSET_NAME.into(), browser_download_url: "https://example.test/portable".into(), size: 10 },
            ],
        };
        let info = build_update_info("0.1.0", release).unwrap().expect("update available");
        assert_eq!(info.version, "0.2.0");
        assert_eq!(info.asset_url, "https://example.test/portable");
    }
}
