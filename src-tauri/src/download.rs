use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::path::Path;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressPayload {
  pub id: String,
  pub url: String,
  pub dest_path: String,
  pub received: u64,
  pub total: Option<u64>,
  pub state: String,
  pub error: Option<String>,
}

pub async fn download_to_path(
  app: &AppHandle,
  client: &Client,
  id: &str,
  url: &str,
  dest: &Path,
  expected_sha1_hex: Option<&str>,
) -> Result<(), String> {
  if dest.is_file() {
    if let Some(expected) = expected_sha1_hex {
      if let Ok(actual) = sha1_file_hex(dest) {
        if actual.eq_ignore_ascii_case(expected) {
          return Ok(());
        }
      }
    } else if dest.metadata().map(|m| m.len() > 0).unwrap_or(false) {
      return Ok(());
    }
  }

  let parent = dest
    .parent()
    .ok_or_else(|| "Destino inválido.".to_string())?;
  std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

  let tmp = dest.with_extension("part");
  if tmp.exists() {
    let _ = std::fs::remove_file(&tmp);
  }

  app
    .emit(
      "download://progress",
      DownloadProgressPayload {
        id: id.to_string(),
        url: url.to_string(),
        dest_path: dest.to_string_lossy().to_string(),
        received: 0,
        total: None,
        state: "downloading".into(),
        error: None,
      },
    )
    .ok();

  let mut attempt = 0u32;
  loop {
    attempt += 1;
    match download_once(client, app, id, url, &tmp, dest, expected_sha1_hex).await {
      Ok(()) => {
        let len = dest.metadata().map(|m| m.len()).unwrap_or(0);
        app
          .emit(
            "download://progress",
            DownloadProgressPayload {
              id: id.to_string(),
              url: url.to_string(),
              dest_path: dest.to_string_lossy().to_string(),
              received: len,
              total: Some(len),
              state: "completed".into(),
              error: None,
            },
          )
          .ok();
        return Ok(());
      }
      Err(e) => {
        if attempt >= 5 {
          app
            .emit(
              "download://progress",
              DownloadProgressPayload {
                id: id.to_string(),
                url: url.to_string(),
                dest_path: dest.to_string_lossy().to_string(),
                received: 0,
                total: None,
                state: "failed".into(),
                error: Some(e.clone()),
              },
            )
            .ok();
          return Err(e);
        }
        tokio::time::sleep(std::time::Duration::from_millis(400 * attempt as u64)).await;
      }
    }
  }
}

async fn download_once(
  client: &Client,
  app: &AppHandle,
  id: &str,
  url: &str,
  tmp: &Path,
  dest: &Path,
  expected_sha1_hex: Option<&str>,
) -> Result<(), String> {
  let res = client
    .get(url)
    .send()
    .await
    .map_err(|e| format!("Red: {e}"))?;
  if !res.status().is_success() {
    let status = res.status();
    let msg = match status.as_u16() {
      404 => format!(
        "Error 404: el archivo de FFmpeg no está disponible en el servidor.\n{url}"
      ),
      403 => format!("Error 403: acceso denegado al descargar FFmpeg.\n{url}"),
      500..=599 => format!(
        "Error {}: el servidor de descarga no responde correctamente.\n{url}",
        status.as_u16()
      ),
      _ => format!("Error HTTP {} al descargar FFmpeg.\n{url}", status.as_u16()),
    };
    return Err(msg);
  }
  let total = res.content_length();
  let mut stream = res.bytes_stream();
  let mut file = tokio::fs::File::create(tmp)
    .await
    .map_err(|e| format!("No se pudo crear archivo temporal: {e}"))?;
  let mut received: u64 = 0;
  let mut hasher = Sha1::new();
  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|e| format!("Lectura de red: {e}"))?;
    hasher.update(&chunk);
    file
      .write_all(&chunk)
      .await
      .map_err(|e| format!("Escritura en disco: {e}"))?;
    received += chunk.len() as u64;
    if received % (256 * 1024) < chunk.len() as u64 {
      app
        .emit(
          "download://progress",
          DownloadProgressPayload {
            id: id.to_string(),
            url: url.to_string(),
            dest_path: dest.to_string_lossy().to_string(),
            received,
            total,
            state: "downloading".into(),
            error: None,
          },
        )
        .ok();
    }
  }
  file.flush().await.map_err(|e| e.to_string())?;
  drop(file);

  if let Some(expected) = expected_sha1_hex {
    let digest = hasher.finalize();
    let hex = hex::encode(digest);
    if !hex.eq_ignore_ascii_case(expected) {
      let _ = std::fs::remove_file(tmp);
      return Err(format!(
        "SHA1 incorrecto. Esperado {expected}, obtenido {hex}"
      ));
    }
  }

  if dest.exists() {
    let _ = std::fs::remove_file(dest);
  }
  std::fs::rename(tmp, dest).map_err(|e| format!("No se pudo finalizar la descarga: {e}"))?;
  Ok(())
}

pub fn sha1_file_hex(path: &Path) -> Result<String, String> {
  let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
  let mut hasher = Sha1::new();
  hasher.update(&bytes);
  Ok(hex::encode(hasher.finalize()))
}
