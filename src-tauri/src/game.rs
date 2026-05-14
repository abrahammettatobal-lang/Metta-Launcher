use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::AppHandle;
use tauri::Emitter;

static RUNNING_PID: AtomicU32 = AtomicU32::new(0);

#[derive(Serialize, Clone)]
pub struct GameExitPayload {
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
  java: String,
  args: Vec<String>,
  cwd: String,
  extra_env: Vec<(String, String)>,
) -> Result<(), String> {
  if RUNNING_PID.load(Ordering::SeqCst) != 0 {
    return Err("Ya hay un proceso de juego en ejecución.".into());
  }

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
  std::thread::spawn(move || {
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
      let _ = app_out.emit(
        "game-log",
        serde_json::json!({ "stream": "stdout", "line": line }),
      );
    }
  });

  let app_err = app.clone();
  std::thread::spawn(move || {
    for line in BufReader::new(stderr).lines().map_while(Result::ok) {
      let _ = app_err.emit(
        "game-log",
        serde_json::json!({ "stream": "stderr", "line": line }),
      );
    }
  });

  let app_wait = app.clone();
  std::thread::spawn(move || {
    let status = child.wait().ok();
    RUNNING_PID.store(0, Ordering::SeqCst);
    let code = status.as_ref().and_then(|s| s.code());
    let success = status.map(|s| s.success()).unwrap_or(false);
    let _ = app_wait.emit(
      "game-exit",
      GameExitPayload {
        code,
        success,
      },
    );
  });

  Ok(())
}
