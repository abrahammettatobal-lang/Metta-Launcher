import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { motion } from "framer-motion";
import {
  appPaths,
  instanceSave,
  logAppend,
  settingGet,
} from "../services/bridge";
import type { InstanceRow, LoaderType } from "../services/bridge";
import {
  listForgeVersions,
  listNeoForgeVersions,
  prepareNewInstancePaths,
} from "../services/launchInstance";
import { fetchFabricLoaderVersionsForMc } from "../services/minecraft/fabricMeta";
import {
  defaultVersionId,
  fetchVersionCatalog,
  type VersionCatalog,
} from "../services/minecraft/versionCatalogService";
import { VersionSelector } from "../components/minecraft/VersionSelector";
import {
  ModpackImportProgressBar,
  useModpackImport,
} from "../components/modpack/ModpackImport";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Field, FieldSelect } from "../ui/Field";
import { tap } from "../utils/tap";
import { cx } from "../ui/cx";
import { IconBolt, IconCheck, IconCubes, IconRam } from "../ui/icons";

const LOADERS: { id: LoaderType; label: string; description: string }[] = [
  {
    id: "vanilla",
    label: "Vanilla",
    description: "Minecraft puro, sin mods.",
  },
  {
    id: "fabric",
    label: "Fabric",
    description: "Loader ligero, ideal para mods modernos.",
  },
  {
    id: "forge",
    label: "Forge",
    description: "El loader clásico con compatibilidad extensa.",
  },
  {
    id: "neoforge",
    label: "NeoForge",
    description: "El fork moderno de Forge para 1.20+.",
  },
  {
    id: "custom",
    label: "Client modificado",
    description: "Tu propio client.jar; no se descarga ni verifica.",
  },
];

export function CreateInstancePage() {
  const nav = useNavigate();
  const [name, setName] = useState("Nueva instancia");
  const [mc, setMc] = useState("");
  const [catalog, setCatalog] = useState<VersionCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const modpackImport = useModpackImport();
  const [loader, setLoader] = useState<LoaderType>("vanilla");
  const [lv, setLv] = useState("");
  const [forgeList, setForgeList] = useState<string[]>([]);
  const [neoList, setNeoList] = useState<string[]>([]);
  const [fabList, setFabList] = useState<string[]>([]);
  const [customJar, setCustomJar] = useState("");
  const [ramMin, setRamMin] = useState(1024);
  const [ramMax, setRamMax] = useState(4096);

  useEffect(() => {
    setCatalogLoading(true);
    void fetchVersionCatalog()
      .then((c) => {
        setCatalog(c);
        setMc((prev) => prev || defaultVersionId(c));
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  // Apply user defaults from Settings.
  useEffect(() => {
    void (async () => {
      const [gmin, gmax] = await Promise.all([
        settingGet("globalMinRamMb"),
        settingGet("globalMaxRamMb"),
      ]);
      const n1 = Number(gmin);
      const n2 = Number(gmax);
      if (Number.isFinite(n1) && n1 > 0) setRamMin(n1);
      if (Number.isFinite(n2) && n2 > 0) setRamMax(n2);
    })();
  }, []);

  useEffect(() => {
    if (!mc) return;
    if (loader === "forge")
      void listForgeVersions(mc)
        .then(setForgeList)
        .catch(() => setForgeList([]));
    if (loader === "neoforge")
      void listNeoForgeVersions(mc)
        .then(setNeoList)
        .catch((e) => {
          console.error("[neoforge] versions", e);
          setNeoList([]);
        });
    if (loader === "fabric")
      void fetchFabricLoaderVersionsForMc(mc)
        .then(setFabList)
        .catch(() => setFabList([]));
  }, [mc, loader]);

  const loaderVersions = useMemo(() => {
    if (loader === "forge") return forgeList;
    if (loader === "neoforge") return neoList;
    if (loader === "fabric") return fabList;
    return [];
  }, [loader, forgeList, neoList, fabList]);

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Crear"
        title="Nueva instancia"
        subtitle="Configura versión, mod loader y memoria. Los archivos se descargan al jugar."
      />

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card eyebrow="Detalles" title="Identidad y versión" className="space-y-4">
          <Field
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <VersionSelector
            catalog={catalog}
            value={mc}
            onChange={setMc}
            loading={catalogLoading}
          />

          <div>
            <span className="field-label">Mod loader</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {LOADERS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    setLoader(l.id);
                    setLv("");
                    if (l.id !== "custom") setCustomJar("");
                  }}
                  className={cx(
                    "group flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition-all duration-200 ease-soft",
                    loader === l.id
                      ? "border-gold-500/55 bg-gold-haze shadow-gold-soft"
                      : "border-line bg-canvas-raised/60 hover:border-line-strong hover:bg-canvas-card/80",
                  )}
                >
                  <span className="flex w-full items-center justify-between text-[12.5px] font-semibold tracking-tight text-ink">
                    {l.label}
                    {loader === l.id && (
                      <IconCheck className="text-gold-300" width={14} height={14} />
                    )}
                  </span>
                  <span className="text-[11px] leading-snug text-ink-faint">
                    {l.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {loader === "custom" && (
            <div className="space-y-2">
              <Field
                label="Ruta del client.jar"
                placeholder="shared/versions/26.2/26.2.jar o ruta absoluta"
                value={customJar}
                onChange={(e) => setCustomJar(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void open({
                    multiple: false,
                    filters: [{ name: "JAR", extensions: ["jar"] }],
                  }).then((sel) => {
                    if (typeof sel === "string") setCustomJar(sel);
                  })
                }
              >
                Examinar…
              </button>
              <p className="text-[11px] leading-snug text-ink-muted">
                El launcher descargará librerías y assets de la versión de Minecraft
                elegida, pero usará tu JAR tal cual (sin comprobar SHA1 ni volver a
                descargarlo). Si el JAR tiene estructura{" "}
                <code className="text-[10px]">26.2/net/minecraft/...</code> (bundle de
                NeoForge), se reempaqueta automáticamente para lanzarlo sin sustituirlo
                por el oficial.
              </p>
            </div>
          )}

          {loader !== "vanilla" && loader !== "custom" && (
            <FieldSelect
              label="Versión del loader"
              value={lv}
              onChange={(e) => setLv(e.target.value)}
            >
              <option value="" className="bg-canvas-deep">
                Selecciona…
              </option>
              {loaderVersions.map((x) => (
                <option key={x} value={x} className="bg-canvas-deep">
                  {x}
                </option>
              ))}
            </FieldSelect>
          )}
        </Card>

        <Card eyebrow="Recursos" title="Memoria" className="space-y-4">
          <RamSlider
            label="RAM máxima"
            value={ramMax}
            min={1024}
            max={16384}
            step={512}
            onChange={setRamMax}
          />
          <RamSlider
            label="RAM mínima"
            value={ramMin}
            min={512}
            max={8192}
            step={256}
            onChange={(v) => setRamMin(Math.min(v, ramMax))}
          />
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-canvas-deep/40 p-3">
            <Hint
              icon={<IconRam width={13} height={13} />}
              text="Asigna no más del 60% de tu RAM total."
            />
            <Hint
              icon={<IconBolt width={13} height={13} />}
              text="4–6 GB son suficientes para la mayoría de modpacks."
            />
          </div>
        </Card>
      </div>

      <Card eyebrow="Modpack" title="Importar modpack CurseForge">
        <p className="mb-3 text-[12px] text-ink-muted">
          Importa un modpack desde carpeta extraída o archivo ZIP (p. ej. Prominence
          II). Necesitas una API key de CurseForge en Ajustes.
        </p>
        <ModpackImportProgressBar
          progress={modpackImport.progress}
          error={modpackImport.error}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={modpackImport.busy}
            onClick={() => void modpackImport.pickFolder()}
          >
            Carpeta del modpack
          </button>
          <button
            type="button"
            className="btn"
            disabled={modpackImport.busy}
            onClick={() => void modpackImport.pickZip()}
          >
            Archivo ZIP
          </button>
        </div>
      </Card>

      <Card eyebrow="Listo" title="Resumen">
        <div className="grid gap-4 sm:grid-cols-4">
          <Summary label="Nombre" value={name || "—"} />
          <Summary label="Minecraft" value={mc || "—"} />
          <Summary
            label="Loader"
            value={
              loader === "vanilla"
                ? "Vanilla"
                : loader === "custom"
                  ? "Client modificado"
                  : `${capitalize(loader)} ${lv || "(elegir)"}`
            }
          />
          <Summary label="RAM" value={`${ramMin}–${ramMax} MB`} />
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.99 }}
          className="btn-gold mt-6 w-full !py-3.5 text-[14px]"
          onClick={() =>
            tap("Crear instancia", async () => {
              const id = crypto.randomUUID();
              const root = (await appPaths()).launcherRoot;
              const loaderVersion =
                loader === "vanilla" || loader === "custom"
                  ? mc
                  : lv || (loader === "fabric" ? fabList[0] ?? "" : "");
              if (loader !== "vanilla" && loader !== "custom" && !loaderVersion) {
                alert("Selecciona una versión del loader.");
                return;
              }
              if (loader === "custom" && !customJar.trim()) {
                alert("Indica la ruta del client.jar personalizado.");
                return;
              }
              // The launcher will fall back to globalJvmArgs at launch time;
              // we keep per-instance overrides empty by default.
              const row: InstanceRow = {
                id,
                name,
                minecraftVersion: mc,
                loaderType: loader,
                loaderVersion,
                instancePath: "",
                icon: "default",
                minRamMb: ramMin,
                maxRamMb: ramMax,
                javaPath: null,
                jvmArgs: "",
                gameArgs: "",
                gameResolution: null,
                customClientJar: loader === "custom" ? customJar.trim() : null,
                lastPlayedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              const prep = await prepareNewInstancePaths(root, row);
              await instanceSave(prep);
              await logAppend("launcher", "info", `Instancia creada ${name}`, id);
              nav("/instances");
            })
          }
        >
          <IconCubes width={14} height={14} />
          Crear instancia
        </motion.button>
      </Card>
    </div>
  );
}

function RamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="field-label !mb-0">{label}</span>
        <span className="font-display text-[14px] font-semibold tracking-tight text-ink">
          {value} <span className="text-[10px] text-ink-faint">MB</span>
        </span>
      </div>
      <div className="relative h-9 w-full">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-canvas-deep" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-gold-500 to-gold-300 shadow-[0_0_10px_rgba(228,188,60,0.4)]"
          style={{ width: `${pct}%`, left: 0 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:relative
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-ink
            [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.5),0_0_0_4px_rgba(228,188,60,0.18)]
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:duration-150
            hover:[&::-webkit-slider-thumb]:scale-110"
        />
      </div>
    </div>
  );
}

function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 text-[11.5px] text-ink-muted">
      <span className="mt-[1px] text-gold-300">{icon}</span>
      <span className="leading-snug">{text}</span>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas-deep/40 px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div className="mt-1 truncate font-display text-[14px] font-semibold tracking-tight text-ink">
        {value}
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
