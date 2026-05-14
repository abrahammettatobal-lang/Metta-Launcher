#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod db;
mod download;
mod game;
mod java;
mod paths;

use chrono::Utc;
use db::{AccountRow, Db, InstanceRow, LogRow};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

pub struct AppState {
  pub db: Arc<Db>,
  pub http: reqwest::Client,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
  pub app_data_dir: String,
  pub db_path: String,
  pub default_launcher_root: String,
  pub launcher_root: String,
}

fn launcher_root_path(db: &Db) -> PathBuf {
  db.setting_get("launcherRoot")
    .ok()
    .flatten()
    .filter(|s| !s.trim().is_empty())
    .map(PathBuf::from)
    .unwrap_or_else(paths::default_launcher_root)
}

const DEFAULT_JVM_ARGS: &str = "-XX:+UnlockExperimentalVMOptions\n-XX:+UseG1GC\n-XX:G1NewSizePercent=20\n-XX:G1ReservePercent=20\n-XX:MaxGCPauseMillis=50\n-XX:G1HeapRegionSize=16M";

fn ensure_folders_and_defaults(db: &Db) -> Result<(), String> {
  let root = launcher_root_path(db);
  std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
  for sub in [
    "shared/assets/indexes",
    "shared/assets/objects",
    "shared/libraries",
    "shared/versions",
    "shared/version_profiles",
    "shared/forge_runs",
    "shared/neoforge_runs",
    "shared/logs",
    "instances",
  ] {
    std::fs::create_dir_all(root.join(sub)).map_err(|e| e.to_string())?;
  }
  let jvm = db.setting_get("globalJvmArgs")?;
  if jvm.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
    db.setting_set("globalJvmArgs", DEFAULT_JVM_ARGS)?;
  }
  let jp = db.setting_get("javaPath")?;
  if jp.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
    let cand = java::detect_java_candidates();
    if let Some(f) = cand.first() {
      db.setting_set("javaPath", &f.path)?;
    }
  }
  Ok(())
}

fn resolve_under_launcher_root(db: &Db, raw: &str) -> Result<PathBuf, String> {
  let root = launcher_root_path(db);
  std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
  let candidate = Path::new(raw);
  let full = if candidate.is_absolute() {
    candidate.to_path_buf()
  } else {
    root.join(candidate)
  };
  paths::ensure_path_under_root(&root, &full)
}

fn du_dir(path: &Path) -> Result<u64, String> {
  let mut total = 0u64;
  if path.is_file() {
    return Ok(path.metadata().map(|m| m.len()).unwrap_or(0));
  }
  for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let p = entry.path();
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    if meta.is_dir() {
      total += du_dir(&p)?;
    } else {
      total += meta.len();
    }
  }
  Ok(total)
}

#[tauri::command]
fn app_paths(app: AppHandle, state: State<'_, AppState>) -> Result<AppPaths, String> {
  let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
  let db_path = app_data.join("metta.db");
  let root = launcher_root_path(&state.db);
  Ok(AppPaths {
    app_data_dir: app_data.to_string_lossy().to_string(),
    db_path: db_path.to_string_lossy().to_string(),
    default_launcher_root: paths::default_launcher_root()
      .to_string_lossy()
      .to_string(),
    launcher_root: root.to_string_lossy().to_string(),
  })
}

#[tauri::command]
fn setting_get(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
  state.db.setting_get(&key)
}

#[tauri::command]
fn setting_set(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
  state.db.setting_set(&key, &value)
}

#[tauri::command]
fn launcher_set_root(state: State<'_, AppState>, path: String) -> Result<(), String> {
  let p = PathBuf::from(&path);
  std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
  let canon = p.canonicalize().map_err(|e| e.to_string())?;
  state
    .db
    .setting_set("launcherRoot", &canon.to_string_lossy())
}

#[tauri::command]
fn log_append(
  state: State<'_, AppState>,
  source: String,
  instance_id: Option<String>,
  level: String,
  message: String,
) -> Result<(), String> {
  state.db.log_insert(&source, instance_id.as_deref(), &level, &message)
}

#[tauri::command]
fn logs_query(
  state: State<'_, AppState>,
  limit: i64,
  level: Option<String>,
  source: Option<String>,
) -> Result<Vec<LogRow>, String> {
  state
    .db
    .logs_query(limit, level.as_deref(), source.as_deref())
}

#[tauri::command]
fn logs_clear(state: State<'_, AppState>) -> Result<(), String> {
  state.db.logs_clear()
}

#[tauri::command]
fn instances_list(state: State<'_, AppState>) -> Result<Vec<InstanceRow>, String> {
  db::instances_list(&state.db)
}

#[tauri::command]
fn instance_get(state: State<'_, AppState>, id: String) -> Result<Option<InstanceRow>, String> {
  db::instance_get(&state.db, &id)
}

#[tauri::command]
fn instance_save(state: State<'_, AppState>, row: InstanceRow) -> Result<(), String> {
  db::instance_upsert(&state.db, &row)
}

#[tauri::command]
fn instance_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
  db::instance_delete(&state.db, &id)
}

#[tauri::command]
fn accounts_list(state: State<'_, AppState>) -> Result<Vec<AccountRow>, String> {
  db::accounts_list(&state.db)
}

#[tauri::command]
fn account_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
  auth::keyring_delete_minecraft(&id)?;
  db::account_delete(&state.db, &id)
}

#[tauri::command]
fn account_set_active(state: State<'_, AppState>, id: String) -> Result<(), String> {
  db::account_set_active(&state.db, &id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineAccountRequest {
  pub username: String,
}

#[tauri::command]
fn account_add_offline(
  state: State<'_, AppState>,
  payload: OfflineAccountRequest,
) -> Result<AccountRow, String> {
  let name = paths::sanitize_instance_name(&payload.username)?;
  let session = auth::offline_session(&name);
  let id = Uuid::new_v4().to_string();
  let now = Utc::now().to_rfc3339();
  let row = AccountRow {
    id: id.clone(),
    kind: "offline".into(),
    username: session.username.clone(),
    uuid: session.uuid.clone(),
    is_active: false,
    created_at: now.clone(),
    updated_at: now,
  };
  db::account_insert(&state.db, &row)?;
  let list = db::accounts_list(&state.db)?;
  if list.len() == 1 {
    db::account_set_active(&state.db, &id)?;
  }
  Ok(db::accounts_list(&state.db)?
    .into_iter()
    .find(|a| a.id == id)
    .unwrap())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSession {
  pub access_token: String,
  pub uuid: String,
  pub username: String,
  pub user_type: String,
}

#[tauri::command]
fn get_launch_session(state: State<'_, AppState>, account_id: String) -> Result<LaunchSession, String> {
  let accounts = db::accounts_list(&state.db)?;
  let acc = accounts
    .into_iter()
    .find(|a| a.id == account_id)
    .ok_or_else(|| "Cuenta no encontrada.".to_string())?;
  if acc.kind == "offline" {
    return Ok(LaunchSession {
      access_token: "-".into(),
      uuid: acc.uuid,
      username: acc.username,
      user_type: "legacy".into(),
    });
  }
  let secrets = auth::keyring_get_minecraft(&account_id)?
    .ok_or_else(|| "No hay credenciales de Microsoft guardadas para esta cuenta.".to_string())?;
  Ok(LaunchSession {
    access_token: secrets.minecraft_access_token,
    uuid: acc.uuid,
    username: acc.username,
    user_type: "msa".into(),
  })
}

#[tauri::command]
async fn microsoft_device_start(
  state: State<'_, AppState>,
) -> Result<auth::DeviceCodeStart, String> {
  auth::microsoft_start_device_flow(&state.http).await
}

#[tauri::command]
async fn microsoft_device_poll(
  state: State<'_, AppState>,
  device_code: String,
) -> Result<auth::MicrosoftAuthOutcome, String> {
  let outcome = auth::microsoft_poll_device_code(&state.http, &device_code).await?;
  if let auth::MicrosoftAuthOutcome::Success {
    ref account_id,
    ref username,
    ref uuid,
  } = outcome
  {
    let now = Utc::now().to_rfc3339();
    let row = AccountRow {
      id: account_id.clone(),
      kind: "microsoft".into(),
      username: username.clone(),
      uuid: uuid.clone(),
      is_active: false,
      created_at: now.clone(),
      updated_at: now,
    };
    db::account_insert(&state.db, &row)?;
    let list = db::accounts_list(&state.db)?;
    if list.len() == 1 {
      db::account_set_active(&state.db, account_id)?;
    }
  }
  Ok(outcome)
}

#[tauri::command]
async fn download_file_cmd(
  app: AppHandle,
  state: State<'_, AppState>,
  id: String,
  url: String,
  dest_path: String,
  sha1: Option<String>,
) -> Result<(), String> {
  let dest = resolve_under_launcher_root(&state.db, &dest_path)?;
  download::download_to_path(&app, &state.http, &id, &url, &dest, sha1.as_deref()).await?;
  Ok(())
}

#[tauri::command]
fn read_text_file(state: State<'_, AppState>, path: String) -> Result<String, String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  std::fs::read_to_string(&p).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(state: State<'_, AppState>, path: String, content: String) -> Result<(), String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  if let Some(parent) = p.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  std::fs::write(&p, content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(state: State<'_, AppState>, path: String, data: Vec<u8>) -> Result<(), String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  if let Some(parent) = p.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  std::fs::write(&p, &data).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(state: State<'_, AppState>, path: String) -> Result<bool, String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  Ok(p.exists())
}

#[tauri::command]
fn mkdir_all_cmd(state: State<'_, AppState>, path: String) -> Result<(), String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  std::fs::create_dir_all(&p).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_file_cmd(state: State<'_, AppState>, path: String) -> Result<(), String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  std::fs::remove_file(&p).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_path_cmd(state: State<'_, AppState>, from: String, to: String) -> Result<(), String> {
  let a = resolve_under_launcher_root(&state.db, &from)?;
  let b = resolve_under_launcher_root(&state.db, &to)?;
  std::fs::rename(&a, &b).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
  pub name: String,
  pub path: String,
  pub is_dir: bool,
  pub size: Option<u64>,
}

#[tauri::command]
fn list_dir_cmd(state: State<'_, AppState>, path: String) -> Result<Vec<DirEntryInfo>, String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  let mut out = Vec::new();
  for entry in std::fs::read_dir(&p).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    let name = entry.file_name().to_string_lossy().to_string();
    let full = entry.path();
    out.push(DirEntryInfo {
      path: full.to_string_lossy().to_string(),
      name,
      is_dir: meta.is_dir(),
      size: if meta.is_file() {
        Some(meta.len())
      } else {
        None
      },
    });
  }
  out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  Ok(out)
}

#[tauri::command]
fn dir_disk_usage(state: State<'_, AppState>, path: String) -> Result<u64, String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  du_dir(&p)
}

#[tauri::command]
fn sha1_file_cmd(state: State<'_, AppState>, path: String) -> Result<String, String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  download::sha1_file_hex(&p)
}

#[tauri::command]
fn extract_zip_cmd(state: State<'_, AppState>, zip_path: String, dest_dir: String) -> Result<(), String> {
  let zip_p = resolve_under_launcher_root(&state.db, &zip_path)?;
  let dest = resolve_under_launcher_root(&state.db, &dest_dir)?;
  extract_zip_file(&zip_p, &dest)
}

fn extract_zip_file(zip_path: &Path, out_dir: &Path) -> Result<(), String> {
  let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
  let mut archive =
    zip::ZipArchive::new(std::io::BufReader::new(file)).map_err(|e| e.to_string())?;
  for i in 0..archive.len() {
    let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
    let outpath = match file.enclosed_name() {
      Some(p) => out_dir.join(p),
      None => continue,
    };
    if file.name().ends_with('/') {
      std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
    } else {
      if let Some(parent) = outpath.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
      }
      let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
      std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunJavaRequest {
  pub java_path: String,
  pub jar_path: String,
  pub work_dir: String,
  pub args: Vec<String>,
}

#[tauri::command]
fn run_java_jar(state: State<'_, AppState>, req: RunJavaRequest) -> Result<String, String> {
  let jar = resolve_under_launcher_root(&state.db, &req.jar_path)?;
  let cwd = resolve_under_launcher_root(&state.db, &req.work_dir)?;
  let java = req.java_path;
  let mut cmd = Command::new(&java);
  cmd
    .arg("-jar")
    .arg(&jar)
    .args(&req.args)
    .current_dir(&cwd)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  let out = cmd.output().map_err(|e| format!("Fallo al ejecutar instalador: {e}"))?;
  let mut merged = String::new();
  merged.push_str(&String::from_utf8_lossy(&out.stdout));
  merged.push_str(&String::from_utf8_lossy(&out.stderr));
  if !out.status.success() {
    return Err(format!(
      "El instalador terminó con error ({}): {}",
      out.status,
      merged.trim()
    ));
  }
  Ok(merged)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnLaunchRequest {
  pub java_path: String,
  pub cwd: String,
  pub args: Vec<String>,
  pub env: Vec<(String, String)>,
}

#[tauri::command]
fn spawn_java_game(app: AppHandle, req: SpawnLaunchRequest) -> Result<(), String> {
  let cwd = PathBuf::from(&req.cwd);
  std::fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
  game::spawn_game_process(
    app,
    req.java_path,
    req.args,
    req.cwd,
    req.env,
  )
}

#[tauri::command]
fn stop_java_game() -> Result<(), String> {
  game::stop_game_process()
}

#[tauri::command]
fn java_detect() -> Result<Vec<java::JavaCandidate>, String> {
  Ok(java::detect_java_candidates())
}

#[tauri::command]
fn remove_dir_recursive(state: State<'_, AppState>, path: String) -> Result<(), String> {
  let p = resolve_under_launcher_root(&state.db, &path)?;
  std::fs::remove_dir_all(&p).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let resolver = app.path();
      let app_data = resolver.app_data_dir().expect("app data dir");
      std::fs::create_dir_all(&app_data).expect("create app data");
      let db_path = app_data.join("metta.db");
      let db = Arc::new(Db::open(&db_path).expect("db open"));
      ensure_folders_and_defaults(&db).expect("bootstrap folders and defaults");
      let http = reqwest::Client::builder()
        .user_agent("MettaLauncher/0.1 (+https://localhost)")
        .build()
        .expect("http client");
      app.manage(AppState { db, http });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      app_paths,
      setting_get,
      setting_set,
      launcher_set_root,
      log_append,
      logs_query,
      logs_clear,
      instances_list,
      instance_get,
      instance_save,
      instance_delete,
      accounts_list,
      account_delete,
      account_set_active,
      account_add_offline,
      get_launch_session,
      microsoft_device_start,
      microsoft_device_poll,
      download_file_cmd,
      read_text_file,
      write_text_file,
      write_binary_file,
      path_exists,
      mkdir_all_cmd,
      remove_file_cmd,
      move_path_cmd,
      remove_dir_recursive,
      list_dir_cmd,
      dir_disk_usage,
      sha1_file_cmd,
      extract_zip_cmd,
      run_java_jar,
      spawn_java_game,
      stop_java_game,
      java_detect,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
