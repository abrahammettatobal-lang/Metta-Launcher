use serde::Serialize;

pub const EVENT_STATUS: &str = "recorder://status";
pub const EVENT_STARTED: &str = "recorder://started";
pub const EVENT_STOPPED: &str = "recorder://stopped";
pub const EVENT_ERROR: &str = "recorder://error";
pub const EVENT_COUNTDOWN: &str = "recorder://countdown";
pub const EVENT_FFMPEG_INSTALL: &str = "recorder://ffmpeg-install";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderStatusPayload {
  pub phase: String,
  pub elapsed_secs: u64,
  pub file_size_bytes: u64,
  pub file_path: String,
  pub fps: u32,
  pub target_fps: u32,
  pub bitrate_kbps: u32,
  pub encoder: String,
  pub resolution: String,
  pub dropped_frames: u64,
  pub cpu_usage_pct: f32,
  pub gpu_usage_pct: f32,
  pub disk_free_bytes: u64,
  pub mic_level: f32,
  pub capture_mode: String,
  pub window_title: Option<String>,
  pub estimated_final_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderStartedPayload {
  pub file_path: String,
  pub encoder: String,
  pub capture_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderStoppedPayload {
  pub file_path: String,
  pub duration_secs: u64,
  pub file_size_bytes: u64,
  pub success: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderErrorPayload {
  pub code: String,
  pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderCountdownPayload {
  pub seconds_left: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegInstallPayload {
  pub phase: String,
  pub message: String,
  pub progress: u64,
  pub total: Option<u64>,
}
