use crate::recorder::ffmpeg_gate::run_ffmpeg_serial;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

static ENCODER_CACHE: OnceLock<Mutex<Option<Vec<EncoderInfo>>>> = OnceLock::new();

fn encoder_cache() -> &'static Mutex<Option<Vec<EncoderInfo>>> {
  ENCODER_CACHE.get_or_init(|| Mutex::new(None))
}

pub fn invalidate_encoder_cache() {
  if let Ok(mut cache) = encoder_cache().lock() {
    *cache = None;
  }
}

pub fn detect_encoders_cached(ffmpeg: &str) -> Result<Vec<EncoderInfo>, String> {
  if let Ok(cache) = encoder_cache().lock() {
    if let Some(cached) = cache.as_ref() {
      return Ok(cached.clone());
    }
  }
  let encoders = detect_encoders(ffmpeg)?;
  if let Ok(mut cache) = encoder_cache().lock() {
    *cache = Some(encoders.clone());
  }
  Ok(encoders)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncoderInfo {
  pub id: String,
  pub label: String,
  pub kind: String,
  pub available: bool,
}

#[derive(Debug, Clone)]
pub struct ResolvedEncoder {
  pub id: String,
  pub label: String,
  pub video_args: Vec<String>,
}

pub fn detect_encoders(ffmpeg: &str) -> Result<Vec<EncoderInfo>, String> {
  let out = run_ffmpeg_serial(ffmpeg, &["-hide_banner", "-encoders"], Duration::from_secs(5))?;
  let text = String::from_utf8_lossy(&out.stdout);

  let checks = [
    ("h264_nvenc", "NVIDIA NVENC (H.264)", "nvenc"),
    ("hevc_nvenc", "NVIDIA NVENC (H.265)", "nvenc"),
    ("h264_amf", "AMD AMF (H.264)", "amf"),
    ("hevc_amf", "AMD AMF (H.265)", "amf"),
    ("h264_qsv", "Intel QuickSync (H.264)", "qsv"),
    ("hevc_qsv", "Intel QuickSync (H.265)", "qsv"),
    ("libx264", "CPU H.264 (libx264)", "cpu"),
    ("libx265", "CPU H.265 (libx265)", "cpu"),
    ("libvpx-vp9", "CPU VP9 (libvpx)", "cpu"),
  ];

  let mut encoders = Vec::new();
  for (id, label, kind) in checks {
    let available = text.contains(id);
    encoders.push(EncoderInfo {
      id: id.into(),
      label: label.into(),
      kind: kind.into(),
      available,
    });
  }
  Ok(encoders)
}

pub fn resolve_encoder(
  ffmpeg: &str,
  codec: &str,
  preference: &str,
  bitrate_mbps: u32,
  quality_preset: &str,
  fps: u32,
  variable_frame_rate: bool,
) -> Result<ResolvedEncoder, String> {
  let encoders = detect_encoders_cached(ffmpeg)?;
  let available: Vec<&EncoderInfo> = encoders.iter().filter(|e| e.available).collect();

  let want: Vec<&str> = match codec {
    "h265" => vec!["hevc_nvenc", "hevc_amf", "hevc_qsv", "libx265"],
    "vp9" => vec!["libvpx-vp9"],
    _ => vec!["libx264", "h264_nvenc", "h264_amf", "h264_qsv"],
  };

  let pick = |id: &str| available.iter().find(|e| e.id == id).copied();

  let chosen = if preference != "auto" {
    match preference {
      "nvenc" => want
        .iter()
        .find(|id| id.contains("nvenc"))
        .and_then(|id| pick(id)),
      "amf" => want.iter().find(|id| id.contains("amf")).and_then(|id| pick(id)),
      "qsv" => want.iter().find(|id| id.contains("qsv")).and_then(|id| pick(id)),
      "cpu" => want
        .iter()
        .find(|id| id.starts_with("lib"))
        .and_then(|id| pick(id)),
      _ => None,
    }
  } else {
    None
  };

  let encoder = chosen.or_else(|| want.iter().find_map(|id| pick(id))).ok_or_else(|| {
    "El encoder no está disponible. Instala ffmpeg con soporte NVENC/AMF/QSV o libx264.".to_string()
  })?;

  let bitrate = format!("{}M", bitrate_mbps.max(1));
  let mut video_args = vec!["-c:v".into(), encoder.id.to_string()];

  if encoder.id.contains("nvenc") {
    let preset = match quality_preset {
      "low" => "p5",
      "medium" => "p4",
      "high" => "p3",
      "lossless" => "lossless",
      _ => "p4",
    };
    video_args.extend([
      "-preset".into(),
      preset.into(),
      "-b:v".into(),
      bitrate.clone(),
      "-maxrate".into(),
      bitrate,
      "-bufsize".into(),
      format!("{}M", bitrate_mbps.saturating_mul(2).max(2)),
    ]);
  } else if encoder.id.contains("amf") || encoder.id.contains("qsv") {
    video_args.extend(["-b:v".into(), bitrate]);
  } else if encoder.id == "libx264" {
    let crf = match quality_preset {
      "low" => "28",
      "medium" => "23",
      "high" => "18",
      "lossless" => "0",
      _ => "20",
    };
    if quality_preset == "lossless" {
      video_args.extend(["-preset".into(), "veryslow".into(), "-crf".into(), "0".into()]);
    } else {
      video_args.extend([
        "-preset".into(),
        "veryfast".into(),
        "-crf".into(),
        crf.into(),
        "-b:v".into(),
        format!("{}M", bitrate_mbps),
      ]);
    }
  } else if encoder.id == "libx265" {
    video_args.extend(["-preset".into(), "medium".into(), "-crf".into(), "22".into()]);
  } else if encoder.id == "libvpx-vp9" {
    video_args.extend([
      "-b:v".into(),
      format!("{}M", bitrate_mbps),
      "-deadline".into(),
      "good".into(),
    ]);
  }

  if !variable_frame_rate {
    video_args.extend(["-vsync".into(), "cfr".into(), "-r".into(), fps.to_string()]);
  }

  video_args.extend(["-pix_fmt".into(), "yuv420p".into()]);

  Ok(ResolvedEncoder {
    id: encoder.id.clone(),
    label: encoder.label.clone(),
    video_args,
  })
}

pub fn find_ffmpeg() -> Result<String, String> {
  let candidates = collect_ffmpeg_candidates();
  if candidates.is_empty() {
    return Err(
      "FFmpeg no encontrado. Instálalo con el botón «Instalar FFmpeg», con winget, o añádelo al PATH."
        .into(),
    );
  }

  for path in &candidates {
    if ffmpeg_supports_demuxer(path, "dshow") {
      return Ok(path.clone());
    }
  }

  Ok(candidates[0].clone())
}

fn collect_ffmpeg_candidates() -> Vec<String> {
  use std::collections::HashSet;
  let mut out = Vec::new();
  let mut seen = HashSet::new();

  let mut push = |path: PathBuf| {
    if path.is_file() {
      let s = path.to_string_lossy().into_owned();
      if seen.insert(s.clone()) {
        out.push(s);
      }
    }
  };

  if let Some(local) = dirs::data_local_dir() {
    push(local.join("MettaLauncher").join("bin").join("ffmpeg.exe"));
  }

  for path in known_ffmpeg_paths() {
    push(path);
  }

  if let Ok(path) = which_ffmpeg("ffmpeg") {
    push(PathBuf::from(path));
  }

  #[cfg(windows)]
  {
    if let Some(path) = run_where_with_winget_links("ffmpeg") {
      push(PathBuf::from(path));
    }
  }

  out
}

fn known_ffmpeg_paths() -> Vec<PathBuf> {
  let mut paths = Vec::new();

  if let Some(local) = dirs::data_local_dir() {
    paths.push(local.join("MettaLauncher").join("bin").join("ffmpeg.exe"));
    paths.push(local.join("MettaLauncher").join("bin").join("ffmpeg"));
    paths.extend(winget_ffmpeg_paths(&local));
  }

  #[cfg(windows)]
  {
    if let Ok(pf) = std::env::var("ProgramFiles") {
      paths.push(PathBuf::from(&pf).join("ffmpeg").join("bin").join("ffmpeg.exe"));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
      paths.push(
        PathBuf::from(&pf86)
          .join("ffmpeg")
          .join("bin")
          .join("ffmpeg.exe"),
      );
    }
    paths.push(PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"));
  }

  #[cfg(target_os = "macos")]
  {
    paths.push(PathBuf::from("/opt/homebrew/bin/ffmpeg"));
    paths.push(PathBuf::from("/usr/local/bin/ffmpeg"));
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    paths.push(PathBuf::from("/usr/bin/ffmpeg"));
    paths.push(PathBuf::from("/usr/local/bin/ffmpeg"));
  }

  paths
}

#[cfg(windows)]
fn winget_ffmpeg_paths(local_app_data: &Path) -> Vec<PathBuf> {
  let mut paths = vec![local_app_data
    .join("Microsoft")
    .join("WinGet")
    .join("Links")
    .join("ffmpeg.exe")];

  let packages = local_app_data
    .join("Microsoft")
    .join("WinGet")
    .join("Packages");
  if let Ok(entries) = std::fs::read_dir(packages) {
    for entry in entries.flatten() {
      let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
      if name.contains("ffmpeg") {
        if let Some(found) = find_file_recursive(&entry.path(), "ffmpeg.exe") {
          paths.push(found);
        }
      }
    }
  }

  paths
}

#[cfg(not(windows))]
fn winget_ffmpeg_paths(_local_app_data: &Path) -> Vec<PathBuf> {
  Vec::new()
}

fn find_file_recursive(root: &Path, name: &str) -> Option<PathBuf> {
  if !root.is_dir() {
    return None;
  }
  let entries = std::fs::read_dir(root).ok()?;
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      if let Some(found) = find_file_recursive(&path, name) {
        return Some(found);
      }
    } else if path.file_name().and_then(|n| n.to_str()) == Some(name) {
      return Some(path);
    }
  }
  None
}

fn which_ffmpeg(name: &str) -> Result<String, String> {
  #[cfg(windows)]
  {
    if let Ok(path) = run_where(name, None) {
      return Ok(path);
    }
    if let Some(path) = run_where_with_winget_links(name) {
      return Ok(path);
    }
  }
  #[cfg(not(windows))]
  {
    let out = Command::new("which")
      .arg(name)
      .stdout(Stdio::piped())
      .stderr(Stdio::null())
      .output()
      .map_err(|e| e.to_string())?;
    if out.status.success() {
      let line = String::from_utf8_lossy(&out.stdout).trim().to_string();
      if !line.is_empty() {
        return Ok(line);
      }
    }
  }
  Err("not found".into())
}

#[cfg(windows)]
fn run_where(name: &str, path_override: Option<&str>) -> Result<String, String> {
  let mut cmd = Command::new("where");
  cmd.arg(name).stdout(Stdio::piped()).stderr(Stdio::null());
  if let Some(path) = path_override {
    cmd.env("PATH", path);
  }
  let out = cmd.output().map_err(|e| e.to_string())?;
  if out.status.success() {
    let line = String::from_utf8_lossy(&out.stdout)
      .lines()
      .next()
      .unwrap_or("")
      .trim()
      .to_string();
    if !line.is_empty() {
      return Ok(line);
    }
  }
  Err("not found".into())
}

#[cfg(windows)]
fn run_where_with_winget_links(name: &str) -> Option<String> {
  let local = std::env::var("LOCALAPPDATA").ok()?;
  let links = PathBuf::from(&local)
    .join("Microsoft")
    .join("WinGet")
    .join("Links");
  if !links.is_dir() {
    return None;
  }
  let links_str = links.to_string_lossy();
  let path_var = std::env::var("PATH").unwrap_or_default();
  let augmented = if path_var.is_empty() {
    links_str.into_owned()
  } else {
    format!("{links_str};{path_var}")
  };
  run_where(name, Some(&augmented)).ok()
}

pub fn ffmpeg_supports_demuxer(ffmpeg: &str, demuxer: &str) -> bool {
  let Ok(out) = Command::new(ffmpeg)
    .args(["-hide_banner", "-demuxers"])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output()
  else {
    return false;
  };
  let text = format!(
    "{}{}",
    String::from_utf8_lossy(&out.stdout),
    String::from_utf8_lossy(&out.stderr)
  );
  text
    .split_whitespace()
    .any(|token| token.eq_ignore_ascii_case(demuxer))
}

pub fn output_extension(format: &str) -> &'static str {
  match format {
    "mkv" => "mkv",
    "webm" => "webm",
    _ => "mp4",
  }
}

pub fn build_output_args(format: &str, has_audio: bool) -> Vec<String> {
  let mut args = Vec::new();
  if format == "mp4" {
    args.extend([
      "-movflags".into(),
      "+frag_keyframe+empty_moov+default_base_moof".into(),
    ]);
  }
  if has_audio {
    args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()]);
  }
  args
}

pub fn generate_thumbnail(ffmpeg: &str, video: &std::path::Path, thumb: &std::path::Path) -> Result<(), String> {
  let out = Command::new(ffmpeg)
    .args([
      "-y",
      "-ss",
      "00:00:01",
      "-i",
      &video.to_string_lossy(),
      "-frames:v",
      "1",
      "-q:v",
      "2",
    ])
    .arg(thumb)
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .map_err(|e| e.to_string())?;
  if out.success() {
    Ok(())
  } else {
    Err("No se pudo generar miniatura".into())
  }
}

pub fn probe_duration(ffmpeg: &str, video: &std::path::Path) -> Option<f64> {
  let out = Command::new(ffmpeg)
    .args(["-i"])
    .arg(video)
    .stderr(Stdio::piped())
    .stdout(Stdio::null())
    .output()
    .ok()?;
  let text = String::from_utf8_lossy(&out.stderr);
  for line in text.lines() {
    if line.contains("Duration:") {
      if let Some(dur) = line.split("Duration:").nth(1)?.trim().split(',').next() {
        return parse_duration(dur.trim());
      }
    }
  }
  None
}

fn parse_duration(raw: &str) -> Option<f64> {
  let parts: Vec<&str> = raw.split(':').collect();
  if parts.len() != 3 {
    return None;
  }
  let h: f64 = parts[0].parse().ok()?;
  let m: f64 = parts[1].parse().ok()?;
  let s: f64 = parts[2].parse().ok()?;
  Some(h * 3600.0 + m * 60.0 + s)
}
