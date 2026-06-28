use crate::db::Db;
use crate::recorder::audio;
use crate::recorder::capture;
use crate::recorder::encoder;
use crate::recorder::recorder::RecorderManager;
use crate::recorder::settings::{load_settings, save_settings, RecorderSettings};
use crate::AppState;
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingItem {
  pub id: String,
  pub name: String,
  pub path: String,
  pub thumb_path: Option<String>,
  pub created_at: String,
  pub duration_secs: Option<f64>,
  pub width: Option<u32>,
  pub height: Option<u32>,
  pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStatus {
  pub running: bool,
  pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProbe {
  pub ffmpeg_available: bool,
  pub game_audio_available: bool,
  pub encoders: Vec<encoder::EncoderInfo>,
  pub audio_devices: Vec<audio::AudioDeviceInfo>,
  pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
  pub installed: bool,
  pub bundled: bool,
  pub audio_capable: bool,
  pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegInstallResult {
  pub path: String,
}

#[tauri::command]
pub fn recorder_ffmpeg_status() -> FfmpegStatus {
  let (installed, bundled, path) = crate::recorder::ffmpeg_install::ffmpeg_status();
  let audio_capable = path
    .as_deref()
    .map(crate::recorder::audio::ffmpeg_has_game_audio)
    .unwrap_or(false);
  FfmpegStatus {
    installed,
    bundled,
    audio_capable,
    path,
  }
}

#[tauri::command]
pub async fn recorder_install_ffmpeg(
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<FfmpegInstallResult, String> {
  let client = state.http.clone();
  match crate::recorder::ffmpeg_install::install_ffmpeg(&app, &client).await {
    Ok(path) => Ok(FfmpegInstallResult { path }),
    Err(e) => {
      crate::recorder::ffmpeg_install::emit_install_error(&app, &e);
      Err(e)
    }
  }
}

#[tauri::command]
pub fn recorder_get_settings(state: State<'_, AppState>) -> RecorderSettings {
  load_settings(&state.db)
}

#[tauri::command]
pub fn recorder_save_settings(
  state: State<'_, AppState>,
  settings: RecorderSettings,
) -> Result<(), String> {
  save_settings(&state.db, &settings)
}

#[tauri::command]
pub fn recorder_get_status(
  state: State<'_, AppState>,
) -> crate::recorder::events::RecorderStatusPayload {
  state.recorder.status_snapshot()
}

#[tauri::command]
pub async fn recorder_probe_hardware() -> HardwareProbe {
  tauri::async_runtime::spawn_blocking(|| {
    let ffmpeg = match encoder::find_ffmpeg() {
      Ok(p) => p,
      Err(e) => {
        return HardwareProbe {
          ffmpeg_available: false,
          game_audio_available: false,
          encoders: vec![],
          audio_devices: vec![],
          error: Some(e),
        };
      }
    };
    let encoders = encoder::detect_encoders_cached(&ffmpeg).unwrap_or_default();
    let audio_devices = audio::list_audio_devices(&ffmpeg).unwrap_or_default();
    let game_audio_available = audio::ffmpeg_has_game_audio(&ffmpeg);
    HardwareProbe {
      ffmpeg_available: true,
      game_audio_available,
      encoders,
      audio_devices,
      error: None,
    }
  })
  .await
  .unwrap_or_else(|_| HardwareProbe {
    ffmpeg_available: false,
    game_audio_available: false,
    encoders: vec![],
    audio_devices: vec![],
    error: Some("Detección interrumpida.".into()),
  })
}

#[tauri::command]
pub async fn recorder_detect_encoders() -> Result<Vec<encoder::EncoderInfo>, String> {
  tauri::async_runtime::spawn_blocking(|| {
    let ffmpeg = encoder::find_ffmpeg()?;
    encoder::detect_encoders(&ffmpeg)
  })
  .await
  .map_err(|e| format!("Detección de encoders interrumpida: {e}"))?
}

#[tauri::command]
pub async fn recorder_list_audio_devices() -> Result<Vec<audio::AudioDeviceInfo>, String> {
  tauri::async_runtime::spawn_blocking(|| {
    let ffmpeg = encoder::find_ffmpeg()?;
    audio::list_audio_devices(&ffmpeg)
  })
  .await
  .map_err(|e| format!("Listado de audio interrumpido: {e}"))?
}

#[tauri::command]
pub async fn recorder_list_monitors() -> Vec<capture::MonitorInfo> {
  tauri::async_runtime::spawn_blocking(capture::list_monitors)
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn recorder_find_minecraft_window() -> capture::MinecraftWindowInfo {
  tauri::async_runtime::spawn_blocking(|| capture::find_minecraft_window(crate::game::running_pid()))
    .await
    .unwrap_or_else(|_| capture::MinecraftWindowInfo {
      found: false,
      hwnd: None,
      title: None,
      width: 0,
      height: 0,
      offset_x: 0,
      offset_y: 0,
      pid: None,
    })
}

#[tauri::command]
pub fn recorder_get_game_status() -> GameStatus {
  let pid = crate::game::running_pid();
  GameStatus {
    running: pid.is_some(),
    pid,
  }
}

#[tauri::command]
pub async fn recorder_start(
  app: AppHandle,
  state: State<'_, AppState>,
  settings: Option<RecorderSettings>,
) -> Result<(), String> {
  let settings = settings.unwrap_or_else(|| load_settings(&state.db));
  let recorder = state.recorder.clone();
  tauri::async_runtime::spawn_blocking(move || recorder.start(app, settings))
    .await
    .map_err(|e| format!("Inicio de grabación interrumpido: {e}"))?
}

#[tauri::command]
pub async fn recorder_stop(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
  let recorder = state.recorder.clone();
  tauri::async_runtime::spawn_blocking(move || recorder.stop(app))
    .await
    .map_err(|e| format!("Detención interrumpida: {e}"))?
}

#[tauri::command]
pub fn recorder_pause(state: State<'_, AppState>) -> Result<(), String> {
  state.recorder.pause()
}

#[tauri::command]
pub fn recorder_resume(state: State<'_, AppState>) -> Result<(), String> {
  state.recorder.resume()
}

#[tauri::command]
pub async fn recorder_screenshot(
  state: State<'_, AppState>,
  settings: Option<RecorderSettings>,
) -> Result<String, String> {
  let settings = settings.unwrap_or_else(|| load_settings(&state.db));
  let recorder = state.recorder.clone();
  tauri::async_runtime::spawn_blocking(move || recorder.screenshot(&settings))
    .await
    .map_err(|e| format!("Captura interrumpida: {e}"))?
}

#[tauri::command]
pub async fn recorder_list_recordings(
  state: State<'_, AppState>,
) -> Result<Vec<RecordingItem>, String> {
  let settings = load_settings(&state.db);
  let dir = settings.output_dir;
  tauri::async_runtime::spawn_blocking(move || list_recordings_in_dir(&dir))
    .await
    .map_err(|e| format!("Listado interrumpido: {e}"))?
}

#[tauri::command]
pub fn recorder_delete_recording(path: String) -> Result<(), String> {
  let p = PathBuf::from(&path);
  if !p.is_file() {
    return Err("Archivo no encontrado.".into());
  }
  std::fs::remove_file(&p).map_err(|e| format!("No se pudo eliminar: {e}"))?;
  let thumb = p.with_extension("jpg");
  if thumb.is_file() {
    let _ = std::fs::remove_file(thumb);
  }
  Ok(())
}

#[tauri::command]
pub fn recorder_rename_recording(path: String, new_name: String) -> Result<String, String> {
  let p = PathBuf::from(&path);
  if !p.is_file() {
    return Err("Archivo no encontrado.".into());
  }
  let safe = sanitize_filename(&new_name);
  if safe.is_empty() {
    return Err("Nombre inválido.".into());
  }
  let ext = p
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("mp4");
  let dest = p.with_file_name(format!("{safe}.{ext}"));
  std::fs::rename(&p, &dest).map_err(|e| format!("No se pudo renombrar: {e}"))?;
  Ok(dest.to_string_lossy().into_owned())
}

pub fn list_recordings_in_dir(dir: &str) -> Result<Vec<RecordingItem>, String> {
  let root = PathBuf::from(dir);
  if !root.is_dir() {
    return Ok(vec![]);
  }
  let mut items = Vec::new();
  for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let ext = path
      .extension()
      .and_then(|e| e.to_str())
      .unwrap_or("")
      .to_lowercase();
    if !["mp4", "mkv", "webm"].contains(&ext.as_str()) {
      continue;
    }
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    let modified: DateTime<Utc> = meta.modified().map_err(|e| e.to_string())?.into();
    let name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or("grabación")
      .to_string();
    let thumb = thumb_path(&path);
    items.push(RecordingItem {
      id: path.to_string_lossy().into_owned(),
      name,
      path: path.to_string_lossy().into_owned(),
      thumb_path: if thumb.is_file() {
        Some(thumb.to_string_lossy().into_owned())
      } else {
        None
      },
      created_at: modified.to_rfc3339(),
      duration_secs: None,
      width: None,
      height: None,
      size_bytes: meta.len(),
    });
  }
  items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
  Ok(items)
}

fn thumb_path(video: &Path) -> PathBuf {
  video.with_extension("jpg")
}

fn sanitize_filename(name: &str) -> String {
  name
    .chars()
    .map(|c| match c {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
      _ => c,
    })
    .collect::<String>()
    .trim()
    .to_string()
}

pub fn stop_if_auto(app: &AppHandle, db: &Db, recorder: &Arc<RecorderManager>) {
  let settings = load_settings(db);
  if settings.auto_stop_on_exit {
    let _ = recorder.stop(app.clone());
  }
}

pub fn start_if_auto(app: &AppHandle, db: &Db, recorder: &Arc<RecorderManager>) {
  let settings = load_settings(db);
  if settings.auto_record_on_launch {
    let _ = recorder.start(app.clone(), settings);
  }
}
