import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  accountAddOffline,
  accountsList,
  appPaths,
  javaDetect,
  launcherSetRoot,
  settingSet,
} from "../services/bridge";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { tap, toastOk } from "../utils/tap";

export function SetupPage() {
  const nav = useNavigate();
  const [root, setRoot] = useState("");
  const [original, setOriginal] = useState("");
  const [name, setName] = useState("");
  const [java, setJava] = useState("Buscando Java…");
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    void tap("Leer carpeta", async () => {
      const p = await appPaths();
      setRoot(p.launcherRoot);
      setOriginal(p.launcherRoot);
    });
    void javaDetect()
      .then((rows) => setJava(rows[0]?.version ?? "Se instalará al jugar."))
      .catch(() => setJava("No se pudo detectar Java."));
  }, []);
  const finish = async () => {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    try {
      await tap("Configurar launcher", async () => {
        if (root.trim() && root.trim() !== original)
          await launcherSetRoot(root.trim());
        if (name.trim()) {
          const accounts = await accountsList();
          if (
            !accounts.some(
              (a) => a.kind === "offline" && a.username === name.trim(),
            )
          )
            await accountAddOffline(name.trim());
          window.dispatchEvent(new Event("metta-accounts-changed"));
        }
        await settingSet("onboardingComplete", "true");
        toastOk("Configuración guardada");
        nav("/");
      });
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };
  return (
    <div>
      <Topbar
        eyebrow="Perfiles"
        title="Configuración inicial"
        subtitle="Elige la carpeta del juego y, si quieres, crea un perfil local."
      />
      <Card className="max-w-xl">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void finish();
          }}
        >
          <Field
            label="Carpeta del launcher"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            required
          />
          <Field
            label="Jugador local (opcional)"
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
          />
          <div>
            <span className="field-label">Java detectado</span>
            <p className="text-sm text-ink-soft">{java}</p>
          </div>
          <button
            className="btn-gold"
            type="submit"
            disabled={saving || !root.trim()}
          >
            {saving ? "Guardando…" : "Guardar configuración"}
          </button>
        </form>
      </Card>
    </div>
  );
}
