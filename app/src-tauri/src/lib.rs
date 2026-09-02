use serde_json::Value;
use tauri::Manager;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub mod update;

const BRIDGE_ADDRESS: &str = "127.0.0.1:38491";
const MAX_REQUEST_BYTES: usize = 1_000_000;
const SOURCE_CAPTURE_SCRIPT: &str = include_str!("source_capture.js");

#[derive(Default)]
struct BridgeState {
    active_token: Mutex<Option<String>>,
    active_source: Mutex<Option<String>>,
    latest_import: Mutex<Option<Value>>,
}

#[tauri::command]
fn begin_source_import(state: tauri::State<'_, Arc<BridgeState>>, source: String) -> Result<String, String> {
    if !matches!(source.as_str(), "mercari" | "yahoo-flea" | "rakuma" | "janpara" | "pc-koubou" | "hardoff") {
        return Err("未接続の検索元です".into());
    }
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let token = format!("{}-{nonce:x}", std::process::id());
    *state.active_token.lock().expect("token lock poisoned") = Some(token.clone());
    *state.active_source.lock().expect("source lock poisoned") = Some(source);
    *state.latest_import.lock().expect("import lock poisoned") = None;
    Ok(token)
}

#[tauri::command]
fn take_source_import(state: tauri::State<'_, Arc<BridgeState>>) -> Option<Value> {
    state.latest_import.lock().expect("import lock poisoned").take()
}

#[tauri::command]
fn open_source_webview(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<BridgeState>>,
    url: String,
    source: String,
) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|_| "検索URLが不正です")?;
    let valid_target = parsed.scheme() == "https" && match source.as_str() {
        "mercari" => parsed.host_str() == Some("jp.mercari.com") && parsed.path() == "/search" && parsed.query_pairs().any(|(key, value)| key == "status" && value == "on_sale"),
        "yahoo-flea" => parsed.host_str() == Some("paypayfleamarket.yahoo.co.jp") && parsed.path().starts_with("/search/") && parsed.query_pairs().any(|(key, value)| key == "open" && value == "1"),
        "rakuma" => parsed.host_str() == Some("fril.jp") && parsed.path() == "/s" && parsed.query_pairs().any(|(key, value)| key == "transaction" && value == "selling"),
        "janpara" => parsed.host_str() == Some("www.janpara.co.jp") && parsed.path() == "/sale/search/result/" && parsed.query_pairs().any(|(key, value)| key == "CHKOUTCOM" && value == "1"),
        "pc-koubou" => parsed.host_str() == Some("www.pc-koubou.jp") && parsed.path() == "/pc/used_memory_d_ddr4_32gb.php",
        "hardoff" => parsed.host_str() == Some("netmall.hardoff.co.jp") && parsed.path() == "/cate/00010002000500090001/",
        _ => false,
    };
    let received_token = parsed.query_pairs().find_map(|(key, value)| (key == "pcpf_token").then(|| value.into_owned()));
    let active_token = state.active_token.lock().map_err(|_| "検索状態を取得できません")?.clone();
    let active_source = state.active_source.lock().map_err(|_| "検索状態を取得できません")?.clone();
    if !valid_target || received_token.is_none() || received_token != active_token || active_source.as_deref() != Some(source.as_str()) {
        return Err("許可されていない検索URLです".into());
    }
    let webview = app.get_webview_window("mercari-search").ok_or("内蔵ブラウザを取得できません")?;
    webview.navigate(parsed).map_err(|error| format!("検索サイトへ移動できません: {error}"))?;
    Ok(())
}

fn response(stream: &mut TcpStream, status: &str, body: &str) {
    let payload = format!(
        "HTTP/1.1 {status}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(payload.as_bytes());
}

fn handle_connection(mut stream: TcpStream, state: &BridgeState) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 8192];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => {
                bytes.extend_from_slice(&chunk[..count]);
                if bytes.len() > MAX_REQUEST_BYTES {
                    response(&mut stream, "413 Payload Too Large", "{\"ok\":false}");
                    return;
                }
                if let Some(header_end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..header_end]);
                    let length = headers.lines().find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    }).unwrap_or(0);
                    if bytes.len() >= header_end + 4 + length { break; }
                }
            }
            Err(_) => break,
        }
    }
    let request = String::from_utf8_lossy(&bytes);
    let request_line = request.lines().next().unwrap_or_default();
    if request_line.starts_with("OPTIONS ") {
        response(&mut stream, "204 No Content", "");
        return;
    }
    if !request_line.starts_with("POST /imports/source ") {
        response(&mut stream, "404 Not Found", "{\"ok\":false}");
        return;
    }
    let Some(body_start) = bytes.windows(4).position(|window| window == b"\r\n\r\n").map(|index| index + 4) else {
        response(&mut stream, "400 Bad Request", "{\"ok\":false}"); return;
    };
    let Ok(payload) = serde_json::from_slice::<Value>(&bytes[body_start..]) else {
        response(&mut stream, "400 Bad Request", "{\"ok\":false}"); return;
    };
    let received = payload.get("token").and_then(Value::as_str);
    let received_source = payload.get("source").and_then(Value::as_str);
    let active = state.active_token.lock().expect("token lock poisoned").clone();
    let active_source = state.active_source.lock().expect("source lock poisoned").clone();
    if received.is_none() || received != active.as_deref() || received_source.is_none() || received_source != active_source.as_deref() {
        response(&mut stream, "403 Forbidden", "{\"ok\":false}"); return;
    }
    *state.latest_import.lock().expect("import lock poisoned") = Some(payload);
    *state.active_token.lock().expect("token lock poisoned") = None;
    *state.active_source.lock().expect("source lock poisoned") = None;
    response(&mut stream, "200 OK", "{\"ok\":true}");
}

fn start_bridge(state: Arc<BridgeState>) {
    thread::spawn(move || {
        let Ok(listener) = TcpListener::bind(BRIDGE_ADDRESS) else { return; };
        for stream in listener.incoming().flatten() {
            handle_connection(stream, &state);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bridge_state = Arc::new(BridgeState::default());
    start_bridge(bridge_state.clone());
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(bridge_state)
        .invoke_handler(tauri::generate_handler![
            begin_source_import,
            take_source_import,
            open_source_webview,
            update::get_app_version,
            update::auto_update_requested,
            update::check_for_update,
            update::download_and_apply_update
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "mercari-search" && matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = webview.eval(SOURCE_CAPTURE_SCRIPT);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
