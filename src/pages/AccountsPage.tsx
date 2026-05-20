import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  accountAddOffline,
  accountDelete,
  accountSetActive,
  accountsList,
  microsoftDevicePoll,
  microsoftDeviceStart,
} from "../services/bridge";
import type { AccountRow } from "../services/bridge";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { Avatar } from "../ui/Avatar";
import { Empty } from "../ui/Empty";
import {
  IconCheck,
  IconLink,
  IconShield,
  IconTrash,
  IconUser,
  IconX,
} from "../ui/icons";
import { tap } from "../utils/tap";
import { cx } from "../ui/cx";
import { relativeTime } from "../utils/format";

export function AccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [off, setOff] = useState("");
  const [dc, setDc] = useState<{
    userCode: string;
    uri: string;
    deviceCode: string;
  } | null>(null);

  const load = useCallback(() => accountsList().then(setRows), []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Cuentas"
        title="Tus identidades de juego"
        subtitle="Inicia con Microsoft para servidores Premium o usa una cuenta local."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          eyebrow="Premium"
          title="Iniciar sesión con Microsoft"
          action={
            <span className="pill-gold">
              <IconShield width={11} height={11} /> Recomendado
            </span>
          }
        >
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Recibirás un código corto que deberás introducir en{" "}
            <span className="font-mono text-ink-soft">microsoft.com/link</span>.
            Las credenciales se almacenan en el llavero del sistema.
          </p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.99 }}
            className="btn-gold mt-4"
            onClick={() =>
              tap("Microsoft", async () => {
                const s = await microsoftDeviceStart();
                setDc({
                  userCode: s.userCode,
                  uri: s.verificationUri,
                  deviceCode: s.deviceCode,
                });
                const tick = async () => {
                  const r = await microsoftDevicePoll(s.deviceCode);
                  if (r.kind === "success") {
                    setDc(null);
                    await load();
                  } else if (r.kind === "error") {
                    alert(r.message);
                    setDc(null);
                  } else setTimeout(tick, (s.interval || 5) * 1000);
                };
                setTimeout(tick, (s.interval || 5) * 1000);
              })
            }
          >
            <IconUser width={14} height={14} /> Iniciar con Microsoft
          </motion.button>

          {dc && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 overflow-hidden rounded-2xl border border-gold-500/30 bg-gold-haze/40 p-5"
            >
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-300">
                Código de dispositivo
              </div>
              <div className="mt-2 font-mono text-3xl font-bold tracking-[0.42em] text-ink">
                {dc.userCode}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-muted">
                <span>
                  Abre el enlace y pega el código para autorizar la cuenta.
                </span>
                <button
                  type="button"
                  className="btn-ghost !text-gold-300 hover:!text-gold-200"
                  onClick={() => tap("Abrir enlace", async () => openUrl(dc.uri))}
                >
                  <IconLink width={13} height={13} /> {dc.uri}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDc(null)}
                className="btn-ghost mt-2 !text-ink-faint hover:!text-ink"
              >
                <IconX width={12} height={12} /> Cancelar
              </button>
            </motion.div>
          )}
        </Card>

        <Card eyebrow="Local" title="Cuenta offline">
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Útil para servidores en modo offline o partidas en solitario sin
            verificación.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Field
              className="flex-1"
              placeholder="Nombre de jugador"
              value={off}
              onChange={(e) => setOff(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={!off.trim()}
              onClick={() =>
                tap("Cuenta offline", async () => {
                  await accountAddOffline(off);
                  setOff("");
                  await load();
                })
              }
            >
              <IconCheck width={14} height={14} /> Añadir
            </button>
          </div>
        </Card>
      </div>

      <Card eyebrow="Tus cuentas" title="Gestionar">
        {rows.length === 0 ? (
          <Empty
            icon={<IconUser width={22} height={22} />}
            title="Aún no tienes cuentas"
            description="Inicia sesión con Microsoft o crea una cuenta local arriba."
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-1"
              >
                <Avatar
                  name={a.username}
                  src={
                    a.kind === "microsoft"
                      ? `https://minotar.net/helm/${a.username}/64.png`
                      : undefined
                  }
                  size={42}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[14px] font-semibold tracking-tight text-ink">
                      {a.username}
                    </span>
                    <span
                      className={cx(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                        a.kind === "microsoft"
                          ? "border-gold-500/40 bg-gold-haze text-gold-200"
                          : "border-line bg-canvas-raised text-ink-muted",
                      )}
                    >
                      {a.kind}
                    </span>
                    {a.isActive && (
                      <span className="pill-gold">activa</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-faint">
                    {a.uuid} · creada {relativeTime(a.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!a.isActive && (
                    <button
                      type="button"
                      className="btn-ghost text-[11.5px] !text-gold-300 hover:!text-gold-200"
                      onClick={() =>
                        tap("Activar cuenta", async () => {
                          await accountSetActive(a.id);
                          await load();
                        })
                      }
                    >
                      <IconCheck width={13} height={13} /> Usar
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() =>
                      tap("Eliminar cuenta", async () => {
                        if (!confirm(`¿Eliminar la cuenta "${a.username}"?`))
                          return;
                        await accountDelete(a.id);
                        await load();
                      })
                    }
                  >
                    <IconTrash width={13} height={13} /> Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
