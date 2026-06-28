use crate::db::Db;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

pub const SETTINGS_KEY: &str = "recorderSettings";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderSettings {
  pub output_dir: String,
  pub fps: u32,
  pub resolution: String,
  pub bitrate_mbps: u32,
  pub quality_preset: String,
  pub format: String,
  pub codec: String,
  pub audio_mode: String,
  pub mic_device: Option<String>,
  pub game_audio_device: Option<String>,
  pub capture_mode: String,
  pub record_cursor: bool,
  pub variable_frame_rate: bool,
  pub encoder_preference: String,
  pub overlay_fps: bool,
  pub overlay_duration: bool,
  pub overlay_logo: bool,
  pub overlay_date: bool,
  pub overlay_time: bool,
  pub auto_record_on_launch: bool,
  pub auto_stop_on_exit: bool,
  pub countdown_seconds: u32,
  pub split_size_gb: Option<f32>,
  pub max_file_size_gb: Option<f32>,
  pub hotkey_toggle: String,
  pub hotkey_pause: String,
  pub hotkey_screenshot: String,
}

impl Default for RecorderSettings {
  fn default() -> Self {
    Self {
      output_dir: default_output_dir(),
      fps: 30,
      resolution: "original".into(),
      bitrate_mbps: 20,
      quality_preset: "high".into(),
      format: "mp4".into(),
      codec: "h264".into(),
      audio_mode: "game".into(),
      mic_device: None,
      game_audio_device: None,
      capture_mode: "window".into(),
      record_cursor: true,
      variable_frame_rate: false,
      encoder_preference: "cpu".into(),
      overlay_fps: false,
      overlay_duration: true,
      overlay_logo: false,
      overlay_date: false,
      overlay_time: false,
      auto_record_on_launch: false,
      auto_stop_on_exit: true,
      countdown_seconds: 3,
      split_size_gb: None,
      max_file_size_gb: None,
      hotkey_toggle: "F8".into(),
      hotkey_pause: "F9".into(),
      hotkey_screenshot: "F10".into(),
    }
  }
}

pub fn default_output_dir() -> String {
  if let Some(videos) = dirs::video_dir() {
    let p = videos.join("Metta Launcher");
    return p.to_string_lossy().into_owned();
  }
  dirs::home_dir()
    .map(|h| h.join("Videos").join("Metta Launcher").to_string_lossy().into_owned())
    .unwrap_or_else(|| "Videos/Metta Launcher".into())
}

pub fn load_settings(db: &Db) -> RecorderSettings {
  match db.setting_get(SETTINGS_KEY) {
    Ok(Some(raw)) => serde_json::from_str(&raw).unwrap_or_default(),
    _ => RecorderSettings::default(),
  }
}

pub fn save_settings(db: &Db, settings: &RecorderSettings) -> Result<(), String> {
  let raw = serde_json::to_string(settings).map_err(|e| e.to_string())?;
  db.setting_set(SETTINGS_KEY, &raw).map_err(|e| e.to_string())
}

pub fn ensure_output_dir(settings: &RecorderSettings) -> Result<PathBuf, String> {
  let p = PathBuf::from(&settings.output_dir);
  std::fs::create_dir_all(&p).map_err(|e| format!("No se pudo crear carpeta de grabación: {e}"))?;
  Ok(p)
}

pub fn settings_from_db(db: Arc<Db>) -> RecorderSettings {
  load_settings(db.as_ref())
}
