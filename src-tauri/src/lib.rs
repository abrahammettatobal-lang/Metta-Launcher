#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod bedrock;
mod db;
mod download;
mod game;
mod instances;
mod java;
mod paths;
mod system;

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
  let raw = db
    .setting_get("launcherRoot")
    .ok()
    .flatten()
    .filter(|s| !s.trim().is_empty())
    .map(|s| paths::strip_extended_path_prefix(&s))
    .map(PathBuf::from)
    .unwrap_or_else(paths::default_launcher_root);
  paths::normalize_launcher_root(&raw)
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
  let _ = instances::sync_instances_from_disk(db);
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
  let root_display = dunce::simplified(&root).to_string_lossy().to_string();
  Ok(AppPaths {
    app_data_dir: app_data.to_string_lossy().to_string(),
    db_path: db_path.to_string_lossy().to_string(),
    default_launcher_root: paths::normalize_launcher_root(&paths::default_launcher_root())
      .to_string_lossy()
      .to_string(),
    launcher_root: root_display,
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
  let simple = paths::normalize_launcher_root(&p);
  state
    .db
    .setting_set("launcherRoot", &simple.to_string_lossy())
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
  db::instance_upsert(&state.db, &row)?;
  instances::write_instance_meta(&state.db, &row)
}

#[tauri::command]
fn instance_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
  let row = db::instance_get(&state.db, &id)?
    .ok_or_else(|| "Instancia no encontrada.".to_string())?;
  db::instance_delete(&state.db, &id)?;
  instances::remove_instance_files(&state.db, &row)
}

#[tauri::command]
fn instances_sync(state: State<'_, AppState>) -> Result<u32, String> {
  instances::sync_instances_from_disk(&state.db)
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
  pub xuid: String,
}

#[tauri::command]
async fn get_launch_session(
  state: State<'_, AppState>,
  account_id: String,
) -> Result<LaunchSession, String> {
  let accounts = db::accounts_list(&state.db)?;
  let acc = accounts
    .into_iter()
    .find(|a| a.id == account_id)
    .ok_or_else(|| "Cuenta no encontrada.".to_string())?;
  if acc.kind == "offline" {
    let token = acc
      .uuid
      .replace('-', "")
      .chars()
      .filter(|c| c.is_ascii_hexdigit())
      .collect::<String>();
    let access_token = if token.len() == 32 {
      token
    } else {
      auth::offline_uuid(&acc.username).as_simple().to_string()
    };
    return Ok(LaunchSession {
      access_token,
      uuid: acc.uuid,
      username: acc.username,
      user_type: "legacy".into(),
      xuid: String::new(),
    });
  }
  let secrets = auth::ensure_valid_secrets(&state.http, &state.db, &account_id).await?;
  Ok(LaunchSession {
    access_token: secrets.minecraft_access_token,
    uuid: acc.uuid,
    username: acc.username,
    user_type: "msa".into(),
    xuid: secrets.xuid.unwrap_or_default(),
  })
}

#[tauri::command]
fn account_logout(state: State<'_, AppState>, account_id: String) -> Result<(), String> {
  auth::keyring_delete_minecraft(&account_id)?;
  let accounts = db::accounts_list(&state.db)?;
  if accounts.iter().any(|a| a.id == account_id && a.is_active) {
    let others: Vec<_> = accounts.iter().filter(|a| a.id != account_id).collect();
    if let Some(next) = others.first() {
      db::account_set_active(&state.db, &next.id)?;
    }
  }
  Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn instance_touch_last_played(state: State<'_, AppState>, id: String) -> Result<(), String> {
  state.db.instance_touch_last_played(&id)
}

#[tauri::command(rename_all = "camelCase")]
fn launch_history_list(state: State<'_, AppState>, limit: i64) -> Result<Vec<system::LaunchHistoryRow>, String> {
  system::launch_history_list(&state.db, limit)
}

#[tauri::command]
async fn microsoft_device_start(
  state: State<'_, AppState>,
) -> Result<auth::DeviceCodeStart, String> {
  auth::microsoft_start_device_flow(&state.http, &state.db).await
}

#[tauri::command(rename_all = "camelCase")]
async fn microsoft_device_poll(
  state: State<'_, AppState>,
  device_code: String,
) -> Result<auth::MicrosoftAuthOutcome, String> {
  let outcome = auth::microsoft_poll_device_code(&state.http, &state.db, &device_code).await?;
  if let auth::MicrosoftAuthOutcome::Success {
    ref account_id,
    ref username,
    ref uuid,
  } = outcome
  {
    let now = Utc::now().to_rfc3339();
    let formatted_uuid = auth::format_uuid(uuid);
    let secrets = auth::keyring_get_minecraft(account_id)?
      .ok_or_else(|| "No se pudieron guardar las credenciales.".to_string())?;

    let existing = db::accounts_list(&state.db)?
      .into_iter()
      .find(|a| {
        a.kind == "microsoft"
          && a.uuid.replace('-', "") == formatted_uuid.replace('-', "")
      });

    let final_id = if let Some(acc) = existing {
      auth::keyring_store_minecraft(&acc.id, &secrets)?;
      auth::keyring_delete_minecraft(account_id)?;
      let row = AccountRow {
        id: acc.id.clone(),
        kind: "microsoft".into(),
        username: username.clone(),
        uuid: formatted_uuid,
        is_active: acc.is_active,
        created_at: acc.created_at,
        updated_at: now,
      };
      db::account_upsert(&state.db, &row)?;
      acc.id
    } else {
      let row = AccountRow {
        id: account_id.clone(),
        kind: "microsoft".into(),
        username: username.clone(),
        uuid: formatted_uuid,
        is_active: false,
        created_at: now.clone(),
        updated_at: now,
      };
      db::account_insert(&state.db, &row)?;
      account_id.clone()
    };

    let list = db::accounts_list(&state.db)?;
    if list.iter().filter(|a| a.is_active).count() == 0 {
      db::account_set_active(&state.db, &final_id)?;
    }

    return Ok(auth::MicrosoftAuthOutcome::Success {
      account_id: final_id,
      username: username.clone(),
      uuid: auth::format_uuid(uuid),
    });
  }
  Ok(outcome)
}

#[tauri::command(rename_all = "camelCase")]
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

/// Returns relative paths (under launcher root) that are missing or not regular files.
#[tauri::command]
fn missing_paths_cmd(state: State<'_, AppState>, paths: Vec<String>) -> Result<Vec<String>, String> {
  let mut missing = Vec::new();
  for path in paths {
    match resolve_under_launcher_root(&state.db, &path) {
      Ok(p) => {
        if !p.is_file() {
          missing.push(path);
        }
      }
      Err(_) => missing.push(path),
    }
  }
  Ok(missing)
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
  let root = launcher_root_path(&state.db);
  let java = java::resolve_java_executable(&root, &req.java_path)?;
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
  pub instance_id: Option<String>,
}

#[tauri::command]
fn spawn_java_game(
  app: AppHandle,
  state: State<'_, AppState>,
  req: SpawnLaunchRequest,
) -> Result<(), String> {
  let cwd = PathBuf::from(&req.cwd);
  std::fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
  let root = launcher_root_path(&state.db);
  let java = java::resolve_java_executable(&root, &req.java_path)?;
  let history_id = if let Some(ref id) = req.instance_id {
    let _ = state.db.instance_touch_last_played(id);
    state.db.launch_history_insert_start(id).ok()
  } else {
    None
  };
  game::spawn_game_process(
    app,
    state.db.clone(),
    history_id,
    java.to_string_lossy().to_string(),
    req.args,
    req.cwd,
    req.env,
    req.instance_id.clone().unwrap_or_default(),
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
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      let resolver = app.path();
      let app_data = resolver.app_data_dir().expect("app data dir");
      std::fs::create_dir_all(&app_data).expect("create app data");
      let db_path = app_data.join("metta.db");
      let db = Arc::new(Db::open(&db_path).expect("db open"));
      ensure_folders_and_defaults(&db).expect("bootstrap folders and defaults");
      let http = reqwest::Client::builder()
        .user_agent("MettaLauncher/0.4 (+https://metta-launcher.vercel.app)")
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
      instances_sync,
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
      missing_paths_cmd,
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
      bedrock_detect,
      bedrock_launch,
      bedrock_open_folder,
      bedrock_open_store,
      apply_microsoft_skin,
      reset_microsoft_skin,
      resolve_minecraft_skin,
      account_logout,
      instance_touch_last_played,
      launch_history_list,
      system_diagnose,
      network_check,
      cache_clear,
      instance_repair,
      instance_backup,
      launcher_check_update,
      recommended_java,
      mod_parse_metadata,
      backups_list,
      instance_restore_backup,
      instance_import_zip,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn system_diagnose(app: AppHandle, state: State<'_, AppState>) -> Result<system::SystemDiagnostic, String> {
  let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
  Ok(system::collect_diagnostics(&state.db, &app_data))
}

#[tauri::command]
async fn network_check(state: State<'_, AppState>) -> Result<Vec<system::NetworkEndpoint>, String> {
  Ok(system::check_network(&state.http).await)
}

#[tauri::command(rename_all = "camelCase")]
fn cache_clear(state: State<'_, AppState>, include_old_logs: bool) -> Result<system::CacheClearResult, String> {
  system::clear_cache(&state.db, include_old_logs)
}

#[tauri::command(rename_all = "camelCase")]
fn instance_repair(
  state: State<'_, AppState>,
  instance_path: String,
  minecraft_version: String,
) -> Result<system::RepairReport, String> {
  Ok(system::repair_instance(&state.db, &instance_path, &minecraft_version))
}

#[tauri::command(rename_all = "camelCase")]
fn instance_backup(
  state: State<'_, AppState>,
  instance_path: String,
  name: String,
) -> Result<system::BackupInfo, String> {
  system::create_instance_backup(&state.db, &instance_path, &name)
}

#[tauri::command]
async fn launcher_check_update(state: State<'_, AppState>) -> Result<system::LauncherUpdateInfo, String> {
  Ok(system::check_launcher_update(&state.http).await)
}

#[tauri::command(rename_all = "camelCase")]
fn recommended_java(minecraft_version: String) -> u8 {
  system::recommended_java_major(&minecraft_version)
}

#[tauri::command(rename_all = "camelCase")]
fn mod_parse_metadata(jar_path: String) -> Result<system::ModMetadata, String> {
  Ok(system::parse_mod_jar(Path::new(&jar_path)))
}

#[tauri::command]
fn backups_list(state: State<'_, AppState>) -> Result<Vec<system::BackupListItem>, String> {
  system::list_backups(&state.db)
}

#[tauri::command(rename_all = "camelCase")]
fn instance_restore_backup(
  state: State<'_, AppState>,
  zip_path: String,
  instance_path: String,
) -> Result<(), String> {
  system::restore_instance_backup(&state.db, &zip_path, &instance_path)
}

#[tauri::command(rename_all = "camelCase")]
fn instance_import_zip(
  state: State<'_, AppState>,
  zip_path: String,
  folder_name: String,
) -> Result<String, String> {
  system::import_instance_zip(&state.db, &zip_path, &folder_name)
}

// ─── Bedrock (Windows-only at runtime; commands are always registered so the
// frontend can show a clear "platform not supported" message on other OSes).
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn bedrock_detect() -> Result<bedrock::BedrockInstallation, String> {
  tokio::task::spawn_blocking(bedrock::detect)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn bedrock_launch() -> Result<(), String> {
  tokio::task::spawn_blocking(bedrock::launch)
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "camelCase")]
async fn bedrock_open_folder(kind: String) -> Result<String, String> {
  tokio::task::spawn_blocking(move || bedrock::open_folder(&kind))
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn bedrock_open_store() -> Result<(), String> {
  tokio::task::spawn_blocking(bedrock::open_store)
    .await
    .map_err(|e| e.to_string())?
}

// ─── Skin (Microsoft accounts → Mojang Services API) ────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSkin {
  pub uuid: String,
  pub name: String,
  pub skin_url: String,
  pub model: String,
  pub skin_bytes: Vec<u8>,
}

#[tauri::command(rename_all = "camelCase")]
async fn resolve_minecraft_skin(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResolvedSkin, String> {
  use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

  let trimmed = username.trim();
  if trimmed.is_empty() {
    return Err("Nombre vacío.".into());
  }

  let lookup_url = format!(
    "https://api.mojang.com/users/profiles/minecraft/{}",
    urlencoding::encode(trimmed)
  );
  let lookup_res = state
    .http
    .get(&lookup_url)
    .header("User-Agent", "MettaLauncher/0.4")
    .send()
    .await
    .map_err(|e| format!("Mojang lookup: {e}"))?;
  if lookup_res.status() == 204 || lookup_res.status() == 404 {
    return Err(format!("El jugador \"{trimmed}\" no existe en Mojang."));
  }
  let lookup_json: serde_json::Value = lookup_res
    .error_for_status()
    .map_err(|e| format!("Mojang lookup: {e}"))?
    .json()
    .await
    .map_err(|e| e.to_string())?;
  let uuid = lookup_json
    .get("id")
    .and_then(|v| v.as_str())
    .ok_or("Respuesta inválida del API de Mojang.")?
    .to_string();
  let real_name = lookup_json
    .get("name")
    .and_then(|v| v.as_str())
    .unwrap_or(trimmed)
    .to_string();

  let profile_url = format!(
    "https://sessionserver.mojang.com/session/minecraft/profile/{}?unsigned=true",
    uuid
  );
  let profile: serde_json::Value = state
    .http
    .get(&profile_url)
    .header("User-Agent", "MettaLauncher/0.4")
    .send()
    .await
    .map_err(|e| format!("Mojang session: {e}"))?
    .error_for_status()
    .map_err(|e| format!("Mojang session: {e}"))?
    .json()
    .await
    .map_err(|e| e.to_string())?;

  let properties = profile
    .get("properties")
    .and_then(|v| v.as_array())
    .ok_or("Perfil sin propiedades de textura.")?;
  let textures_prop = properties
    .iter()
    .find(|p| p.get("name").and_then(|n| n.as_str()) == Some("textures"))
    .ok_or("El perfil no tiene textura de skin.")?;
  let value_b64 = textures_prop
    .get("value")
    .and_then(|v| v.as_str())
    .ok_or("Textura sin payload base64.")?;
  let decoded_bytes = B64
    .decode(value_b64)
    .map_err(|e| format!("base64: {e}"))?;
  let decoded: serde_json::Value =
    serde_json::from_slice(&decoded_bytes).map_err(|e| e.to_string())?;

  let skin = decoded
    .pointer("/textures/SKIN")
    .ok_or("El jugador no tiene skin personalizada (usa la skin por defecto).")?;
  let skin_url = skin
    .get("url")
    .and_then(|v| v.as_str())
    .ok_or("Skin sin URL.")?
    .to_string();
  let model = skin
    .pointer("/metadata/model")
    .and_then(|v| v.as_str())
    .unwrap_or("classic");
  let model = if model == "slim" { "slim" } else { "classic" };

  let bytes = state
    .http
    .get(&skin_url)
    .header("User-Agent", "MettaLauncher/0.4")
    .send()
    .await
    .map_err(|e| format!("Descarga de skin: {e}"))?
    .error_for_status()
    .map_err(|e| format!("Descarga de skin: {e}"))?
    .bytes()
    .await
    .map_err(|e| format!("Descarga de skin: {e}"))?
    .to_vec();

  Ok(ResolvedSkin {
    uuid,
    name: real_name,
    skin_url,
    model: model.to_string(),
    skin_bytes: bytes,
  })
}

#[tauri::command(rename_all = "camelCase")]
async fn apply_microsoft_skin(
  state: State<'_, AppState>,
  account_id: String,
  skin_url: String,
  variant: String,
) -> Result<(), String> {
  let secrets = auth::ensure_valid_secrets(&state.http, &state.db, &account_id).await?;

  let variant = match variant.to_lowercase().as_str() {
    "slim" => "slim",
    _ => "classic",
  };

  let bytes = state
    .http
    .get(&skin_url)
    .header("User-Agent", "MettaLauncher/0.4")
    .send()
    .await
    .map_err(|e| format!("Descarga de skin: {e}"))?
    .error_for_status()
    .map_err(|e| format!("Descarga de skin: {e}"))?
    .bytes()
    .await
    .map_err(|e| format!("Descarga de skin: {e}"))?;

  let part = reqwest::multipart::Part::bytes(bytes.to_vec())
    .file_name("skin.png")
    .mime_str("image/png")
    .map_err(|e| e.to_string())?;
  let form = reqwest::multipart::Form::new()
    .text("variant", variant.to_string())
    .part("file", part);

  let res = state
    .http
    .post("https://api.minecraftservices.com/minecraft/profile/skins")
    .bearer_auth(&secrets.minecraft_access_token)
    .multipart(form)
    .send()
    .await
    .map_err(|e| format!("Mojang API: {e}"))?;

  let status = res.status();
  if !status.is_success() {
    let body = res.text().await.unwrap_or_default();
    return Err(format!("Mojang API {status}: {body}"));
  }
  Ok(())
}

#[tauri::command(rename_all = "camelCase")]
async fn reset_microsoft_skin(
  state: State<'_, AppState>,
  account_id: String,
) -> Result<(), String> {
  let secrets = auth::ensure_valid_secrets(&state.http, &state.db, &account_id).await?;

  let res = state
    .http
    .delete("https://api.minecraftservices.com/minecraft/profile/skins/active")
    .bearer_auth(&secrets.minecraft_access_token)
    .send()
    .await
    .map_err(|e| format!("Mojang API: {e}"))?;

  let status = res.status();
  if !status.is_success() {
    let body = res.text().await.unwrap_or_default();
    return Err(format!("Mojang API {status}: {body}"));
  }
  Ok(())
}
