import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  instanceGet,
  instanceSave,
  javaDetect,
  recommendedJava,
} from "../services/bridge";
import type { InstanceRow } from "../services/bridge";
import { runInstanceRepair } from "./DiagnosticsPage";
import { instanceBackup } from "../services/bridge";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Field, FieldSelect, FieldTextarea } from "../ui/Field";
import { tap, toastOk } from "../utils/tap";

export function EditInstancePage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [row, setRow] = useState<InstanceRow | null>(null);
  const [javas, setJavas] = useState<Array<{ path: string; version: string | null }>>([]);
  const [recJava, setRecJava] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    setLoaded(false);
    void tap("Leer instancia", async () => {
      const r = await instanceGet(id);
      if (!live) return;
      setRow(r);
      if (r) {
        setRecJava(await recommendedJava(r.minecraftVersion));
      }
    }).finally(() => { if (live) setLoaded(true); });
    void javaDetect().then(j => { if (live) setJavas(j); }).catch(console.warn);
    return () => { live = false; };
  }, [id]);

  if (loaded && !row) return <div className="space-y-4"><h1 className="page-title">Instancia no disponible</h1><button className="btn" onClick={() => nav("/instances")}>Volver a mi biblioteca</button></div>;
  if (!loaded || !row) {
    return (
      <div className="py-20 text-center text-ink-muted">Cargando instancia…</div>
    );
  }

  const save = () =>
    tap("Guardar instancia", async () => {
      if (!row.name.trim()) throw new Error("Escribe el nombre de la instancia.");
      if (!Number.isInteger(row.minRamMb) || !Number.isInteger(row.maxRamMb) || row.minRamMb < 1 || row.maxRamMb < row.minRamMb) throw new Error("Comprueba el mínimo y el máximo de RAM.");
      await instanceSave({
        ...row,
        name: row.name.trim(),
        updatedAt: new Date().toISOString(),
      });
      toastOk("Instancia guardada", row.name);
      nav("/instances");
    });

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Instancia"
        title={`Editar · ${row.name}`}
        subtitle={`${row.loaderType} ${row.loaderVersion} · ${row.minecraftVersion}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => nav("/instances")}>
              Cancelar
            </button>
            <button type="button" className="btn-gold" onClick={() => void save()}>
              Guardar
            </button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="General">
          <div className="space-y-4">
            <Field
              label="Nombre"
              value={row.name}
              onChange={(e) => setRow({ ...row, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="RAM mínima (MB)"
                type="number"
                value={String(row.minRamMb)}
                onChange={(e) =>
                  setRow({ ...row, minRamMb: Number(e.target.value) })
                }
              />
              <Field
                label="RAM máxima (MB)"
                type="number"
                value={String(row.maxRamMb)}
                onChange={(e) =>
                  setRow({ ...row, maxRamMb: Number(e.target.value) })
                }
              />
            </div>
            <Field
              label="Resolución (ancho x alto)"
              placeholder="1920x1080"
              value={row.gameResolution ?? ""}
              onChange={(e) =>
                setRow({ ...row, gameResolution: e.target.value || null })
              }
            />
            {row.loaderType === "custom" && (
              <div className="space-y-2">
                <Field
                  label="Ruta del client.jar"
                  placeholder="shared/versions/26.2/26.2.jar"
                  value={row.customClientJar ?? ""}
                  onChange={(e) =>
                    setRow({ ...row, customClientJar: e.target.value || null })
                  }
                />
                <p className="text-[11px] leading-snug text-ink-muted">
                  JARs con prefijo <code className="text-[10px]">26.2/</code> se
                  reempaquetan al lanzar; no se reemplazan por el client oficial.
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void open({
                      multiple: false,
                      filters: [{ name: "JAR", extensions: ["jar"] }],
                    }).then((sel) => {
                      if (typeof sel === "string") {
                        setRow({ ...row, customClientJar: sel });
                      }
                    })
                  }
                >
                  Examinar…
                </button>
              </div>
            )}
          </div>
        </Card>

        <Card title="Java">
          {recJava != null && (
            <p className="mb-3 text-[12px] text-ink-muted">
              Recomendado para {row.minecraftVersion}:{" "}
              <span className="font-semibold text-gold-300">Java {recJava}</span>
            </p>
          )}
          <FieldSelect
            label="Java de la instancia"
            value={row.javaPath ?? ""}
            onChange={(e) =>
              setRow({ ...row, javaPath: e.target.value || null })
            }
          >
            <option value="">Usar Java global</option>
            {javas.map((j) => (
              <option key={j.path} value={j.path}>
                {j.version ?? "?"} · {j.path}
              </option>
            ))}
          </FieldSelect>
        </Card>

        <Card title="Argumentos JVM" className="lg:col-span-2">
          <FieldTextarea
            label="Uno por línea"
            rows={5}
            value={row.jvmArgs}
            onChange={(e) => setRow({ ...row, jvmArgs: e.target.value })}
          />
        </Card>

        <Card title="Argumentos del juego" className="lg:col-span-2">
          <FieldTextarea
            label="Uno por línea"
            rows={4}
            value={row.gameArgs}
            onChange={(e) => setRow({ ...row, gameArgs: e.target.value })}
          />
        </Card>
      </div>

      <Card title="Mantenimiento">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() =>
              tap("Reparar instancia", async () => {
                const r = await runInstanceRepair(row.instancePath, row.minecraftVersion);
                toastOk(
                  "Reparación completada",
                  `${r.fixed} correcciones · ${r.checks.filter((c) => !c.ok).length} pendientes`,
                );
              })
            }
          >
            Reparar instancia
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              tap("Crear backup", async () => {
                const b = await instanceBackup(row.instancePath, row.name);
                toastOk("Backup creado", b.path);
              })
            }
          >
            Crear backup ZIP
          </button>
        </div>
      </Card>
    </div>
  );
}
