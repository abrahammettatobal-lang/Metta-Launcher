use crate::db::Db;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
<<<<<<< HEAD
use std::sync::Arc;
=======
use std::sync::{Mutex, OnceLock};
>>>>>>> ebd7683 (Add sponsor badge, live logs, launch optimizations, and web sponsor section)
use tauri::AppHandle;
use tauri::Emitter;

static RUNNING_PID: AtomicU32 = AtomicU32::new(0);

fn instance_id_cell() -> &'static Mutex<String> {
  static CELL: OnceLock<Mutex<String>> = OnceLock::new();
  CELL.get_or_init(|| Mutex::new(String::new()))
}

pub fn set_current_instance_id(id: &str) {
  if let Ok(mut g) = instance_id_cell().lock() {
    *g = id.to_owned();
  }
}

fn get_current_instance_id() -> String {
  instance_id_cell()
    .lock()
    .map(|g| g.clone())
    .unwrap_or_default()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameLogPayload {
  pub instance_id: String,
  pub stream: String,
  pub line: String,
  pub timestamp: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameExitPayload {
  pub instance_id: String,
  pub code: Option<i32>,
  pub success: bool,
}

fn kill_pid(pid: u32) {
  if pid == 0 {
    return;
  }
  #[cfg(windows)]
  {
    let _ = Command::new("taskkill")
      .args(["/PID", &pid.to_string(), "/F", "/T"])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
  }
  #[cfg(unix)]
  {
    let _ = Command::new("kill")
      .args(["-9", &pid.to_string()])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
  }
}

pub fn stop_game_process() -> Result<(), String> {
  let pid = RUNNING_PID.swap(0, Ordering::SeqCst);
  kill_pid(pid);
  Ok(())
}

pub fn spawn_game_process(
  app: AppHandle,
  db: Arc<Db>,
  history_id: Option<i64>,
  java: String,
  args: Vec<String>,
  cwd: String,
  extra_env: Vec<(String, String)>,
  instance_id: String,
) -> Result<(), String> {
  if RUNNING_PID.load(Ordering::SeqCst) != 0 {
    return Err("Ya hay un proceso de juego en ejecución.".into());
  }

  set_current_instance_id(&instance_id);

  let mut cmd = Command::new(&java);
  cmd
    .args(&args)
    .current_dir(&cwd)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  for (k, v) in extra_env {
    cmd.env(k, v);
  }

  let mut child = cmd
    .spawn()
    .map_err(|e| format!("No se pudo iniciar Java ({java}): {e}"))?;

  let pid = child.id();
  RUNNING_PID.store(pid, Ordering::SeqCst);

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "No se pudo capturar stdout.".to_string())?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| "No se pudo capturar stderr.".to_string())?;

  let app_out = app.clone();
  let iid_out = instance_id.clone();
  std::thread::spawn(move || {
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
      let ts = chrono::Utc::now().to_rfc3339();
      let _ = app_out.emit(
        "game-log",
        GameLogPayload {
          instance_id: iid_out.clone(),
          stream: "stdout".into(),
          line,
          timestamp: ts,
        },
      );
    }
  });

  let app_err = app.clone();
  let iid_err = instance_id.clone();
  std::thread::spawn(move || {
    for line in BufReader::new(stderr).lines().map_while(Result::ok) {
      let ts = chrono::Utc::now().to_rfc3339();
      let _ = app_err.emit(
        "game-log",
        GameLogPayload {
          instance_id: iid_err.clone(),
          stream: "stderr".into(),
          line,
          timestamp: ts,
        },
      );
    }
  });

  let app_wait = app.clone();
  let iid_wait = instance_id.clone();
  std::thread::spawn(move || {
    let status = child.wait().ok();
    RUNNING_PID.store(0, Ordering::SeqCst);
    let code = status.as_ref().and_then(|s| s.code());
    let success = status.map(|s| s.success()).unwrap_or(false);
    if let Some(hid) = history_id {
      let _ = db.launch_history_finish(hid, code, success);
    }
    let _ = app_wait.emit(
      "game-exit",
      GameExitPayload {
        instance_id: iid_wait,
        code,
        success,
      },
    );
  });

  Ok(())
}
