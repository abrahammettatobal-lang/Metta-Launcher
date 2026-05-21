import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  const [row, setRow] = useState<InstanceRow | null>(null);
  const [javas, setJavas] = useState<Array<{ path: string; version: string | null }>>([]);
  const [recJava, setRecJava] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const r = await instanceGet(id);
      setRow(r);
      if (r) {
        setRecJava(await recommendedJava(r.minecraftVersion));
      }
    })();
    void javaDetect().then(setJavas);
  }, [id]);

  if (!row) {
    return (
      <div className="py-20 text-center text-ink-muted">Cargando instancia…</div>
    );
  }

  const save = () =>
    tap("Guardar instancia", async () => {
      await instanceSave({
        ...row,
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
