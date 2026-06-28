use std::io::Read;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(8);

pub fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Result<Output, String> {
  cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
  let mut child = cmd
    .spawn()
    .map_err(|e| format!("No se pudo ejecutar proceso: {e}"))?;

  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  let out_handle = thread::spawn(move || {
    stdout
      .map(|mut s| {
        let mut buf = Vec::new();
        let _ = s.read_to_end(&mut buf);
        buf
      })
      .unwrap_or_default()
  });
  let err_handle = thread::spawn(move || {
    stderr
      .map(|mut s| {
        let mut buf = Vec::new();
        let _ = s.read_to_end(&mut buf);
        buf
      })
      .unwrap_or_default()
  });

  let started = Instant::now();
  loop {
    match child.try_wait() {
      Ok(Some(status)) => {
        let stdout = out_handle.join().unwrap_or_default();
        let stderr = err_handle.join().unwrap_or_default();
        return Ok(Output {
          status,
          stdout,
          stderr,
        });
      }
      Ok(None) => {
        if started.elapsed() >= timeout {
          let _ = child.kill();
          let _ = child.wait();
          return Err(format!(
            "La operación tardó demasiado (>{timeout:?}). Comprueba FFmpeg o reinicia el launcher."
          ));
        }
        thread::sleep(Duration::from_millis(40));
      }
      Err(e) => return Err(format!("Error esperando proceso: {e}")),
    }
  }
}

pub fn run_ffmpeg_with_timeout(ffmpeg: &str, args: &[&str], timeout: Duration) -> Result<Output, String> {
  let mut cmd = Command::new(ffmpeg);
  cmd.args(args);
  run_with_timeout(cmd, timeout)
}

pub fn run_ffmpeg_default(ffmpeg: &str, args: &[&str]) -> Result<Output, String> {
  run_ffmpeg_with_timeout(ffmpeg, args, DEFAULT_TIMEOUT)
}
