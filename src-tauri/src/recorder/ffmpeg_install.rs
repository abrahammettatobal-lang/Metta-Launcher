use crate::download::download_to_path;
use crate::recorder::encoder;
use crate::recorder::events::{FfmpegInstallPayload, EVENT_FFMPEG_INSTALL};
use reqwest::Client;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
const FFMPEG_DOWNLOAD_FALLBACKS: &[&str] = &[
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
];

#[cfg(target_os = "macos")]
const FFMPEG_DOWNLOAD_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/zip";

#[cfg(all(unix, not(target_os = "macos")))]
const FFMPEG_DOWNLOAD_URL: &str =
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz";

pub fn bundled_bin_dir() -> PathBuf {
  dirs::data_local_dir()
    .map(|d| d.join("MettaLauncher").join("bin"))
    .unwrap_or_else(|| PathBuf::from("MettaLauncher/bin"))
}

fn emit(app: &AppHandle, phase: &str, message: &str, progress: u64, total: Option<u64>) {
  let _ = app.emit(
    EVENT_FFMPEG_INSTALL,
    FfmpegInstallPayload {
      phase: phase.into(),
      message: message.into(),
      progress,
      total,
    },
  );
}

pub fn emit_install_error(app: &AppHandle, message: &str) {
  emit(app, "error", message, 0, None);
}

pub async fn install_ffmpeg(app: &AppHandle, client: &Client) -> Result<String, String> {
  if let Some(bundled) = bundled_ffmpeg_path() {
    let path = bundled.to_string_lossy().into_owned();
    verify_ffmpeg(&path)?;
    return Ok(path);
  }

  let bin_dir = bundled_bin_dir();
  fs::create_dir_all(&bin_dir).map_err(|e| format!("No se pudo crear carpeta bin: {e}"))?;

  let work = std::env::temp_dir().join("metta-ffmpeg-install");
  if work.exists() {
    let _ = fs::remove_dir_all(&work);
  }
  fs::create_dir_all(&work).map_err(|e| e.to_string())?;

  emit(app, "downloading", "Descargando FFmpeg…", 0, None);

  #[cfg(windows)]
  {
    let zip_path = work.join("ffmpeg.zip");
    download_ffmpeg_zip(app, client, &zip_path).await?;

    emit(app, "extracting", "Extrayendo FFmpeg…", 0, None);
    let extract_dir = work.join("extract");
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;
    extract_zip(&zip_path, &extract_dir)?;

    let src_ffmpeg = find_file_recursive(&extract_dir, "ffmpeg.exe")
      .ok_or_else(|| "ffmpeg.exe no encontrado en el archivo.".to_string())?;
    let dest_ffmpeg = bin_dir.join("ffmpeg.exe");
    copy_binary(&src_ffmpeg, &dest_ffmpeg)?;

    if let Some(src_probe) = find_file_recursive(&extract_dir, "ffprobe.exe") {
      let _ = copy_binary(&src_probe, &bin_dir.join("ffprobe.exe"));
    }
  }

  #[cfg(target_os = "macos")]
  {
    let zip_path = work.join("ffmpeg.zip");
    download_to_path(
      app,
      client,
      "ffmpeg-install",
      FFMPEG_DOWNLOAD_URL,
      &zip_path,
      None,
    )
    .await?;

    emit(app, "extracting", "Extrayendo FFmpeg…", 0, None);
    let extract_dir = work.join("extract");
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;
    extract_zip(&zip_path, &extract_dir)?;

    let src = find_file_recursive(&extract_dir, "ffmpeg")
      .ok_or_else(|| "ffmpeg no encontrado en el archivo.".to_string())?;
    let dest = bin_dir.join("ffmpeg");
    copy_binary(&src, &dest)?;
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      fs::set_permissions(&dest, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let archive = work.join("ffmpeg.tar.xz");
    download_to_path(
      app,
      client,
      "ffmpeg-install",
      FFMPEG_DOWNLOAD_URL,
      &archive,
      None,
    )
    .await?;

    emit(app, "extracting", "Extrayendo FFmpeg…", 0, None);
    let extract_dir = work.join("extract");
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;
    extract_tar_xz(&archive, &extract_dir)?;

    let src = find_file_recursive(&extract_dir, "ffmpeg")
      .ok_or_else(|| "ffmpeg no encontrado en el archivo.".to_string())?;
    let dest = bin_dir.join("ffmpeg");
    copy_binary(&src, &dest)?;
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(&dest, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
  }

  #[cfg(not(any(windows, target_os = "macos", all(unix, not(target_os = "macos")))))]
  {
    let _ = (&app, &client, &work, &bin_dir);
    return Err("Instalación automática de FFmpeg no disponible en esta plataforma.".into());
  }

  let final_path = bundled_ffmpeg_path()
    .map(|p| p.to_string_lossy().into_owned())
    .or_else(|| encoder::find_ffmpeg().ok())
    .ok_or_else(|| "FFmpeg instalado pero no se pudo localizar.".to_string())?;
  verify_ffmpeg(&final_path)?;

  let _ = fs::remove_dir_all(&work);
  emit(app, "done", "FFmpeg instalado correctamente.", 100, Some(100));
  Ok(final_path)
}

fn verify_ffmpeg(path: &str) -> Result<(), String> {
  use std::process::Command;
  let out = Command::new(path)
    .arg("-version")
    .output()
    .map_err(|e| format!("FFmpeg instalado pero no ejecutable: {e}"))?;
  if !out.status.success() {
    return Err("FFmpeg instalado pero falló la verificación.".into());
  }
  Ok(())
}

#[cfg(windows)]
async fn download_ffmpeg_zip(
  app: &AppHandle,
  client: &Client,
  dest: &Path,
) -> Result<(), String> {
  let mut urls = resolve_windows_ffmpeg_download_urls(client).await;
  if urls.is_empty() {
    urls.extend(
      FFMPEG_DOWNLOAD_FALLBACKS
        .iter()
        .map(|url| (*url).to_string()),
    );
  }

  let mut last_err = String::from("No hay URLs de descarga de FFmpeg configuradas.");
  for url in urls {
    match download_to_path(app, client, "ffmpeg-install", &url, dest, None).await {
      Ok(()) => return Ok(()),
      Err(e) => last_err = e,
    }
  }
  Err(last_err)
}

#[cfg(windows)]
async fn resolve_windows_ffmpeg_download_urls(client: &Client) -> Vec<String> {
  const GH_API: &str = "https://api.github.com/repos/GyanD/codexffmpeg/releases/latest";
  let Ok(resp) = client
    .get(GH_API)
    .header("User-Agent", "MettaLauncher")
    .send()
    .await
  else {
    return Vec::new();
  };
  if !resp.status().is_success() {
    return Vec::new();
  }
  let Ok(json) = resp.json::<serde_json::Value>().await else {
    return Vec::new();
  };
  let Some(assets) = json.get("assets").and_then(|a| a.as_array()) else {
    return Vec::new();
  };
  for asset in assets {
    let Some(name) = asset.get("name").and_then(|n| n.as_str()) else {
      continue;
    };
    if !name.ends_with("-full_build.zip") {
      continue;
    }
    if let Some(url) = asset.get("browser_download_url").and_then(|u| u.as_str()) {
      return vec![url.to_string()];
    }
  }
  Vec::new()
}

fn copy_binary(src: &Path, dest: &Path) -> Result<(), String> {
  fs::copy(src, dest).map_err(|e| format!("No se pudo copiar {src:?}: {e}"))?;
  Ok(())
}

fn find_file_recursive(root: &Path, name: &str) -> Option<PathBuf> {
  if !root.is_dir() {
    return None;
  }
  let entries = fs::read_dir(root).ok()?;
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

fn extract_zip(zip_path: &Path, out_dir: &Path) -> Result<(), String> {
  let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
  let mut archive =
    zip::ZipArchive::new(std::io::BufReader::new(file)).map_err(|e| e.to_string())?;
  for i in 0..archive.len() {
    let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
    let outpath = match file.enclosed_name() {
      Some(p) => out_dir.join(p),
      None => continue,
    };
    if file.name().ends_with('/') {
      fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
    } else {
      if let Some(parent) = outpath.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
      }
      let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
      std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn extract_tar_xz(archive: &Path, out_dir: &Path) -> Result<(), String> {
  use std::process::Command;
  let status = Command::new("tar")
    .args(["-xJf"])
    .arg(archive)
    .arg("-C")
    .arg(out_dir)
    .status()
    .map_err(|e| format!("No se pudo ejecutar tar: {e}"))?;
  if status.success() {
    Ok(())
  } else {
    Err("Fallo al extraer FFmpeg (tar).".into())
  }
}

pub fn bundled_ffmpeg_path() -> Option<PathBuf> {
  let bin_dir = bundled_bin_dir();
  #[cfg(windows)]
  {
    let exe = bin_dir.join("ffmpeg.exe");
    if exe.is_file() {
      return Some(exe);
    }
  }
  #[cfg(not(windows))]
  {
    let bin = bin_dir.join("ffmpeg");
    if bin.is_file() {
      return Some(bin);
    }
  }
  None
}

pub fn ffmpeg_status() -> (bool, bool, Option<String>) {
  if let Some(path) = bundled_ffmpeg_path() {
    return (true, true, Some(path.to_string_lossy().into_owned()));
  }
  match encoder::find_ffmpeg() {
    Ok(p) => (true, false, Some(p)),
    Err(_) => (false, false, None),
  }
}
