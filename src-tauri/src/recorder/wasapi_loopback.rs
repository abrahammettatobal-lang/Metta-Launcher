use std::collections::VecDeque;
use std::io::Write;
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: u16 = 2;

pub struct LoopbackCapture {
  stop: Arc<AtomicBool>,
  thread: Option<JoinHandle<()>>,
}

impl LoopbackCapture {
  pub fn start(process_id: u32) -> Result<(Self, u16), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Audio TCP: {e}"))?;
    listener
      .set_nonblocking(true)
      .map_err(|e| format!("Audio TCP: {e}"))?;
    let port = listener
      .local_addr()
      .map_err(|e| format!("Audio TCP: {e}"))?
      .port();
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = Arc::clone(&stop);
    let thread = thread::Builder::new()
      .name("metta-audio-loopback".into())
      .spawn(move || capture_thread(listener, process_id, stop_flag))
      .map_err(|e| format!("No se pudo iniciar captura de audio: {e}"))?;
    Ok((
      Self {
        stop,
        thread: Some(thread),
      },
      port,
    ))
  }

  pub fn stop(mut self) {
    self.stop.store(true, Ordering::SeqCst);
    if let Some(handle) = self.thread.take() {
      let _ = handle.join();
    }
  }
}

fn capture_thread(listener: TcpListener, process_id: u32, stop: Arc<AtomicBool>) {
  let stream = match wait_for_ffmpeg(&listener, &stop) {
    Some(s) => s,
    None => return,
  };

  if stop.load(Ordering::SeqCst) {
    return;
  }

  if let Err(e) = run_wasapi_capture(stream, process_id, &stop) {
    eprintln!("[metta-recorder] captura WASAPI: {e}");
  }
}

fn wait_for_ffmpeg(listener: &TcpListener, stop: &Arc<AtomicBool>) -> Option<std::net::TcpStream> {
  let deadline = std::time::Instant::now() + Duration::from_secs(20);
  while !stop.load(Ordering::SeqCst) {
    match listener.accept() {
      Ok((stream, _)) => return Some(stream),
      Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
        if std::time::Instant::now() >= deadline {
          return None;
        }
        thread::sleep(Duration::from_millis(20));
      }
      Err(_) => return None,
    }
  }
  None
}

fn run_wasapi_capture(
  mut stream: std::net::TcpStream,
  process_id: u32,
  stop: &Arc<AtomicBool>,
) -> Result<(), String> {
  use wasapi::*;

  initialize_mta()
    .ok()
    .map_err(|e| format!("COM audio: {e:?}"))?;

  let desired_format = WaveFormat::new(
    32,
    32,
    &SampleType::Float,
    SAMPLE_RATE as usize,
    CHANNELS as usize,
    None,
  );
  let blockalign = desired_format.get_blockalign() as usize;
  let mut audio_client =
    AudioClient::new_application_loopback_client(process_id, true).map_err(|e| {
      format!(
        "No se pudo capturar audio del juego (PID {process_id}). ¿Minecraft sigue abierto? ({e})"
      )
    })?;
  let mode = StreamMode::EventsShared {
    autoconvert: true,
    buffer_duration_hns: 0,
  };
  audio_client
    .initialize_client(&desired_format, &Direction::Capture, &mode)
    .map_err(|e| format!("Inicializar audio del juego: {e}"))?;
  let h_event = audio_client
    .set_get_eventhandle()
    .map_err(|e| format!("Evento audio: {e}"))?;
  let capture_client = audio_client
    .get_audiocaptureclient()
    .map_err(|e| format!("Cliente audio: {e}"))?;
  audio_client
    .start_stream()
    .map_err(|e| format!("Iniciar stream de audio: {e}"))?;

  let mut sample_queue: VecDeque<u8> = VecDeque::new();
  let mut out_chunk = vec![0u8; blockalign];

  while !stop.load(Ordering::SeqCst) {
    while sample_queue.len() >= blockalign {
      for (idx, byte) in sample_queue.drain(..blockalign).enumerate() {
        out_chunk[idx] = byte;
      }
      write_f32le_as_s16le(&mut stream, &out_chunk)?;
    }

    let new_frames = capture_client
      .get_next_packet_size()
      .map_err(|e| format!("Leer audio: {e}"))?
      .unwrap_or(0);
    if new_frames > 0 {
      let additional = new_frames as usize * blockalign;
      sample_queue.reserve(additional);
      capture_client
        .read_from_device_to_deque(&mut sample_queue)
        .map_err(|e| format!("Leer audio: {e}"))?;
    }

    if h_event.wait_for_event(500).is_err() && stop.load(Ordering::SeqCst) {
      break;
    }
  }

  let _ = audio_client.stop_stream();
  Ok(())
}

fn write_f32le_as_s16le(stream: &mut std::net::TcpStream, bytes: &[u8]) -> Result<(), String> {
  let mut pcm = Vec::with_capacity(bytes.len() / 2);
  for chunk in bytes.chunks_exact(4) {
    let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
    let clipped = sample.clamp(-1.0, 1.0);
    let int_sample = (clipped * i16::MAX as f32) as i16;
    pcm.extend_from_slice(&int_sample.to_le_bytes());
  }
  stream
    .write_all(&pcm)
    .map_err(|e| format!("Enviar audio a FFmpeg: {e}"))
}

pub fn tcp_input_url(port: u16) -> String {
  format!("tcp://127.0.0.1:{port}")
}
