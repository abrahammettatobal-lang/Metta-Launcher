use std::path::{Component, Path, PathBuf};

pub fn sanitize_instance_name(name: &str) -> Result<String, String> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err("El nombre no puede estar vacío.".into());
  }
  if trimmed.len() > 64 {
    return Err("El nombre es demasiado largo.".into());
  }
  let mut out = String::new();
  for ch in trimmed.chars() {
    match ch {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => {
        return Err("El nombre contiene caracteres no permitidos.".into());
      }
      '\u{0000}'..='\u{001f}' => {
        return Err("El nombre contiene caracteres de control.".into());
      }
      _ => out.push(ch),
    }
  }
  Ok(out)
}

pub fn normalize_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
  let rel = Path::new(relative);
  if rel.is_absolute() {
    return Err("La ruta relativa no puede ser absoluta.".into());
  }
  for c in rel.components() {
    if matches!(c, Component::ParentDir) {
      return Err("La ruta no puede ascender con '..'.".into());
    }
  }
  Ok(root.join(rel))
}

/// Comprueba que `candidate` (ruta absoluta bajo el launcher) quede dentro de `root`,
/// sin fallar en Windows por mezclar `\\?\...\` y `C:\...` al usar `canonicalize` solo en parte del camino.
pub fn ensure_path_under_root(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
  let root_canon = dunce::canonicalize(root).map_err(|e| {
    format!("No se pudo resolver el directorio del launcher: {e}")
  })?;
  let root_cmp = dunce::simplified(&root_canon);

  let resolved = if candidate.exists() {
    dunce::canonicalize(candidate).map_err(|e| format!("No se pudo resolver la ruta: {e}"))?
  } else {
    let mut stack: Vec<std::ffi::OsString> = Vec::new();
    let mut cur = candidate;
    while !cur.exists() {
      stack.push(
        cur.file_name()
          .ok_or_else(|| "Ruta inválida.".to_string())?
          .to_os_string(),
      );
      cur = cur
        .parent()
        .ok_or_else(|| "Ruta inválida.".to_string())?;
    }
    let mut base = dunce::canonicalize(cur).map_err(|e| format!("No se pudo resolver la ruta: {e}"))?;
    while let Some(name) = stack.pop() {
      base.push(name);
    }
    base
  };

  let cand_cmp = dunce::simplified(&resolved);
  if !cand_cmp.starts_with(root_cmp) {
    return Err("La ruta queda fuera del directorio permitido.".into());
  }

  Ok(candidate.to_path_buf())
}

pub fn default_launcher_root() -> PathBuf {
  dirs::data_dir()
    .or_else(dirs::home_dir)
    .unwrap_or_else(|| PathBuf::from("."))
    .join("MettaLauncher")
}
