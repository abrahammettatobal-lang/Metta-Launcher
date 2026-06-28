use crate::db::Db;
use crate::java;
use crate::paths;
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
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
  /// Last lines from stdout+stderr for crash diagnosis (Minecraft logs mostly to stdout).
  pub log_tail: Vec<String>,
  #[serde(default)]
  pub stderr_tail: Vec<String>,
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

pub fn running_pid() -> Option<u32> {
  let pid = RUNNING_PID.load(Ordering::SeqCst);
  if pid == 0 { None } else { Some(pid) }
}

fn push_log_tail(tail: &Arc<Mutex<Vec<String>>>, line: String) {
  if let Ok(mut buf) = tail.lock() {
    buf.push(line);
    if buf.len() > 96 {
      let drop = buf.len() - 96;
      buf.drain(0..drop);
    }
  }
}

fn stream_game_output(
  app: AppHandle,
  instance_id: String,
  stream: &str,
  reader: impl BufRead + Send + 'static,
  log_tail: Arc<Mutex<Vec<String>>>,
) {
  for line in reader.lines().map_while(Result::ok) {
    push_log_tail(&log_tail, line.clone());
    let ts = chrono::Utc::now().to_rfc3339();
    let _ = app.emit(
      "game-log",
      GameLogPayload {
        instance_id: instance_id.clone(),
        stream: stream.to_string(),
        line,
        timestamp: ts,
      },
    );
  }
}

fn write_java_arg_file(cwd: &Path, args: &[String]) -> Result<PathBuf, String> {
  let path = cwd.join(".metta-java-args.txt");
  let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
  for arg in args {
    let arg = paths::strip_extended_path_prefix(arg);
    if arg.contains([' ', '\t', '"']) {
      let esc = arg.replace('\\', "\\\\").replace('"', "\\\"");
      writeln!(file, "\"{esc}\"").map_err(|e| e.to_string())?;
    } else {
      writeln!(file, "{arg}").map_err(|e| e.to_string())?;
    }
  }
  Ok(path)
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

  let cwd_path = PathBuf::from(&cwd);
  std::fs::create_dir_all(&cwd_path).map_err(|e| e.to_string())?;
  let arg_file = write_java_arg_file(&cwd_path, &args)?;
  let arg_flag = format!("@{}", arg_file.display());

  let mut cmd = Command::new(&java);
  cmd
    .arg(&arg_flag)
    .current_dir(&cwd_path)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  for (k, v) in extra_env {
    cmd.env(k, v);
  }

  let mut child = cmd
    .spawn()
    .map_err(|e| java::map_java_spawn_error(&java, e))?;

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

  let log_tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

  let app_out = app.clone();
  let iid_out = instance_id.clone();
  let tail_out = Arc::clone(&log_tail);
  let stdout_handle = std::thread::spawn(move || {
    stream_game_output(app_out, iid_out, "stdout", BufReader::new(stdout), tail_out);
  });

  let app_err = app.clone();
  let iid_err = instance_id.clone();
  let tail_err = Arc::clone(&log_tail);
  let stderr_handle = std::thread::spawn(move || {
    stream_game_output(app_err, iid_err, "stderr", BufReader::new(stderr), tail_err);
  });

  let app_wait = app.clone();
  let iid_wait = instance_id.clone();
  std::thread::spawn(move || {
    let status = child.wait().ok();
    let _ = stdout_handle.join();
    let _ = stderr_handle.join();
    RUNNING_PID.store(0, Ordering::SeqCst);
    let code = status.as_ref().and_then(|s| s.code());
    let success = status.map(|s| s.success()).unwrap_or(false);
    if let Some(hid) = history_id {
      let _ = db.launch_history_finish(hid, code, success);
    }
    let tail = log_tail.lock().map(|v| v.clone()).unwrap_or_default();
    let stderr_only: Vec<String> = tail
      .iter()
      .filter(|l| {
        l.contains("Exception")
          || l.contains("Error")
          || l.to_lowercase().contains("error:")
      })
      .cloned()
      .collect();
    let _ = app_wait.emit(
      "game-exit",
      GameExitPayload {
        instance_id: iid_wait,
        code,
        success,
        log_tail: tail,
        stderr_tail: stderr_only,
      },
    );
  });

  Ok(())
}
