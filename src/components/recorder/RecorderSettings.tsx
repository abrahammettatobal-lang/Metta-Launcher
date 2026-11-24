import { useState, type ReactNode } from "react";
import { Field, FieldSelect } from "../../ui/Field";
import { Toggle } from "../../ui/Toggle";
import {
  RECORDER_PRESETS,
  type AudioDeviceInfo,
  type EncoderInfo,
  type MonitorInfo,
  type RecorderPresetId,
  type RecorderSettings,
} from "../../services/recorder/recorderService";

interface RecorderSettingsPanelProps {
  settings: RecorderSettings;
  encoders: EncoderInfo[];
  audioDevices: AudioDeviceInfo[];
  monitors: MonitorInfo[];
  onChange: (next: RecorderSettings) => void;
  onPickFolder: () => void;
}

type TabId = "video" | "audio" | "auto" | "overlay";

const TABS: { id: TabId; label: string }[] = [
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "auto", label: "Automatización" },
  { id: "overlay", label: "Overlay y atajos" },
];

export function RecorderSettingsPanel({
  settings,
  encoders,
  audioDevices,
  monitors,
  onChange,
  onPickFolder,
}: RecorderSettingsPanelProps) {
  const [tab, setTab] = useState<TabId>("video");
  const patch = (partial: Partial<RecorderSettings>) =>
    onChange({ ...settings, ...partial });

  const mics = audioDevices.filter((d) => d.kind === "input");
  const loopbacks = audioDevices.filter((d) => d.kind === "loopback");

  const applyPreset = (id: RecorderPresetId) => {
    patch(RECORDER_PRESETS[id].patch);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          Presets rápidos
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(RECORDER_PRESETS) as RecorderPresetId[]).map((id) => {
            const preset = RECORDER_PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                className="rounded-xl border border-line/60 bg-canvas-deep/40 px-3 py-2.5 text-left transition hover:border-gold-500/35 hover:bg-gold-haze/15"
                onClick={() => applyPreset(id)}
              >
                <div className="text-[13px] font-semibold text-ink">
                  {preset.label}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-muted">
                  {preset.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line/50 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={
              tab === t.id
                ? "rounded-lg border border-gold-500/40 bg-gold-haze/25 px-3 py-1.5 text-[12px] font-semibold text-gold-100"
                : "rounded-lg border border-transparent px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
            }
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "video" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Calidad">
            <FieldSelect
              label="FPS"
              value={String(settings.fps)}
              onChange={(e) => patch({ fps: Number(e.target.value) })}
            >
              {[24, 30, 60, 120, 144].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </FieldSelect>
            <FieldSelect
              label="Resolución"
              value={settings.resolution}
              onChange={(e) => patch({ resolution: e.target.value })}
            >
              <option value="original">Original</option>
              <option value="1280x720">1280×720</option>
              <option value="1920x1080">1920×1080</option>
              <option value="2560x1440">2560×1440</option>
              <option value="3840x2160">3840×2160</option>
            </FieldSelect>
            <FieldSelect
              label="Bitrate"
              value={String(settings.bitrateMbps)}
              onChange={(e) => patch({ bitrateMbps: Number(e.target.value) })}
            >
              {[6, 10, 15, 20, 40, 60, 80].map((v) => (
                <option key={v} value={v}>
                  {v} Mbps
                </option>
              ))}
            </FieldSelect>
            <FieldSelect
              label="Calidad"
              value={settings.qualityPreset}
              onChange={(e) => patch({ qualityPreset: e.target.value })}
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="lossless">Sin pérdidas</option>
            </FieldSelect>
          </Section>

          <Section title="Codificación">
            <FieldSelect
              label="Formato"
              value={settings.format}
              onChange={(e) => patch({ format: e.target.value })}
            >
              <option value="mp4">MP4 (H.264)</option>
              <option value="mkv">MKV</option>
              <option value="webm">WEBM</option>
            </FieldSelect>
            <FieldSelect
              label="Códec"
              value={settings.codec}
              onChange={(e) => patch({ codec: e.target.value })}
            >
              <option value="h264">H.264</option>
              <option value="h265">H.265</option>
              <option value="vp9">VP9</option>
            </FieldSelect>
            <FieldSelect
              label="Encoder"
              value={settings.encoderPreference}
              onChange={(e) => patch({ encoderPreference: e.target.value })}
            >
              <option value="auto">Automático</option>
              <option value="nvenc">NVIDIA NVENC</option>
              <option value="amf">AMD AMF</option>
              <option value="qsv">Intel QuickSync</option>
              <option value="cpu">CPU</option>
            </FieldSelect>
            <EncoderList encoders={encoders} />
            <ToggleRow
              title="Variable Frame Rate (VFR)"
              checked={settings.variableFrameRate}
              onChange={(v) => patch({ variableFrameRate: v })}
            />
          </Section>
        </div>
      )}

      {tab === "audio" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Fuentes">
            <FieldSelect
              label="Modo de audio"
              value={settings.audioMode}
              onChange={(e) => patch({ audioMode: e.target.value })}
            >
              <option value="both">Juego + micrófono</option>
              <option value="game">Solo juego</option>
              <option value="mic">Solo micrófono</option>
              <option value="none">Sin audio</option>
            </FieldSelect>
            {(settings.audioMode === "mic" || settings.audioMode === "both") && (
              <FieldSelect
                label="Micrófono"
                value={settings.micDevice ?? ""}
                onChange={(e) => patch({ micDevice: e.target.value || null })}
              >
                <option value="">Predeterminado</option>
                {mics.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </FieldSelect>
            )}
            {(settings.audioMode === "game" ||
              settings.audioMode === "both") && (
              <FieldSelect
                label="Audio del sistema"
                value={settings.gameAudioDevice ?? ""}
                onChange={(e) =>
                  patch({ gameAudioDevice: e.target.value || null })
                }
              >
                <option value="">Automático (audio del juego)</option>
                {loopbacks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </FieldSelect>
            )}
          </Section>

          <Section title="Captura de pantalla">
            <FieldSelect
              label="Modo de captura"
              value={settings.captureMode}
              onChange={(e) => patch({ captureMode: e.target.value })}
            >
              <option value="window">Ventana de Minecraft</option>
              <option value="monitor">Monitor completo</option>
            </FieldSelect>
            {settings.captureMode === "monitor" && (
              <FieldSelect
                label="Monitor"
                value={String(settings.monitorIndex ?? 0)}
                onChange={(e) =>
                  patch({ monitorIndex: Number(e.target.value) || 0 })
                }
              >
                {monitors.length === 0 ? (
                  <option value="0">Monitor principal</option>
                ) : (
                  monitors.map((m) => (
                    <option key={m.index} value={m.index}>
                      {m.name} ({m.width}×{m.height})
                      {m.primary ? " · Principal" : ""}
                    </option>
                  ))
                )}
              </FieldSelect>
            )}
            <ToggleRow
              title="Grabar cursor"
              checked={settings.recordCursor}
              onChange={(v) => patch({ recordCursor: v })}
            />
          </Section>
        </div>
      )}

      {tab === "auto" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Salida">
            <div className="space-y-2">
              <Field
                label="Carpeta de destino"
                value={settings.outputDir}
                onChange={(e) => patch({ outputDir: e.target.value })}
              />
              <button type="button" className="btn" onClick={onPickFolder}>
                Elegir carpeta…
              </button>
            </div>
            <Field
              label="Cuenta regresiva (s)"
              type="number"
              min={0}
              max={10}
              value={settings.countdownSeconds}
              onChange={(e) =>
                patch({ countdownSeconds: Number(e.target.value) || 0 })
              }
            />
          </Section>
          <Section title="Con el juego">
            <ToggleRow
              title="Grabar al iniciar Minecraft"
              checked={settings.autoRecordOnLaunch}
              onChange={(v) => patch({ autoRecordOnLaunch: v })}
            />
            <ToggleRow
              title="Detener al cerrar Minecraft"
              checked={settings.autoStopOnExit}
              onChange={(v) => patch({ autoStopOnExit: v })}
            />
          </Section>
        </div>
      )}

      {tab === "overlay" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Overlay en el launcher">
            <ToggleRow
              title="Mostrar FPS"
              checked={settings.overlayFps}
              onChange={(v) => patch({ overlayFps: v })}
            />
            <ToggleRow
              title="Mostrar duración"
              checked={settings.overlayDuration}
              onChange={(v) => patch({ overlayDuration: v })}
            />
            <ToggleRow
              title="Logo Metta Launcher"
              checked={settings.overlayLogo}
              onChange={(v) => patch({ overlayLogo: v })}
            />
            <ToggleRow
              title="Mostrar fecha"
              checked={settings.overlayDate}
              onChange={(v) => patch({ overlayDate: v })}
            />
            <ToggleRow
              title="Mostrar hora"
              checked={settings.overlayTime}
              onChange={(v) => patch({ overlayTime: v })}
            />
          </Section>
          <Section title="Atajos de teclado">
            <Field
              label="Iniciar / detener"
              value={settings.hotkeyToggle}
              onChange={(e) => patch({ hotkeyToggle: e.target.value })}
              hint="Ej. F8 o Ctrl+Shift+R"
            />
            <Field
              label="Pausar / reanudar"
              value={settings.hotkeyPause}
              onChange={(e) => patch({ hotkeyPause: e.target.value })}
            />
            <Field
              label="Captura de pantalla"
              value={settings.hotkeyScreenshot}
              onChange={(e) => patch({ hotkeyScreenshot: e.target.value })}
            />
          </Section>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line/40 bg-canvas-deep/30 px-3 py-2.5">
      <span className="text-[13px] font-medium text-ink">{title}</span>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-canvas-card/40 p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-300/90">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EncoderList({ encoders }: { encoders: EncoderInfo[] }) {
  const available = encoders.filter((e) => e.available);
  return (
    <div className="rounded-xl border border-line/50 bg-canvas-deep/40 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        Encoders detectados
      </div>
      <ul className="mt-2 space-y-1">
        {available.length === 0 ? (
          <li className="text-[12px] text-ink-muted">
            Ninguno aún — pulsa «Detectar FFmpeg»
          </li>
        ) : (
          available.map((e) => (
            <li key={e.id} className="text-[12px] text-ink-soft">
              {e.label}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function MicLevelMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.max(0, level * 100));
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-faint">
        Nivel de micrófono
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-canvas-deep">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-300 transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
