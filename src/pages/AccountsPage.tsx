import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  accountAddOffline,
  accountDelete,
  accountSetActive,
  accountsList,
  applyMicrosoftSkin,
  instancesList,
  microsoftDevicePoll,
  microsoftDeviceStart,
  resetMicrosoftSkin,
  resolveMinecraftSkin,
} from "../services/bridge";
import type {
  AccountRow,
  InstanceRow,
  ResolvedSkin,
} from "../services/bridge";
import { applySkinAsResourcePack } from "../services/minecraft/skinManager";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Field, FieldSelect } from "../ui/Field";
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

  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [skinName, setSkinName] = useState("");
  const [skinInstance, setSkinInstance] = useState<string>("");
  const [skinBusy, setSkinBusy] = useState(false);
  const [resolved, setResolved] = useState<ResolvedSkin | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const activeAccount = useMemo(() => rows.find((r) => r.isActive), [rows]);
  const trimmedName = skinName.trim();

  const load = useCallback(async () => {
    const [accs, ins] = await Promise.all([accountsList(), instancesList()]);
    setRows(accs);
    setInstances(ins);
    setSkinInstance((prev) =>
      prev && ins.some((i) => i.id === prev) ? prev : ins[0]?.id ?? "",
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!trimmedName) {
      setResolved(null);
      setResolveError(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError(null);
    const handle = setTimeout(async () => {
      try {
        const r = await resolveMinecraftSkin(trimmedName);
        if (!cancelled) {
          setResolved(r);
          setResolveError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setResolved(null);
          setResolveError(String(e));
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmedName]);

  const uuidWithDashes = useMemo(() => {
    const u = resolved?.uuid ?? "";
    if (!u || u.includes("-")) return u;
    return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
  }, [resolved]);

  const skinBlobUrl = useMemo(() => {
    if (!resolved) return null;
    const blob = new Blob([new Uint8Array(resolved.skinBytes)], {
      type: "image/png",
    });
    return URL.createObjectURL(blob);
  }, [resolved]);

  useEffect(() => {
    return () => {
      if (skinBlobUrl) URL.revokeObjectURL(skinBlobUrl);
    };
  }, [skinBlobUrl]);

  const remoteRenderUrls = useMemo(() => {
    if (!resolved) return [];
    return [
      `https://api.mineatar.io/body/full/${resolved.uuid}?scale=8`,
      `https://mc-heads.net/body/${uuidWithDashes}/right`,
      `https://crafatar.com/renders/body/${uuidWithDashes}?overlay&scale=8`,
    ];
  }, [resolved, uuidWithDashes]);

  const [remoteIdx, setRemoteIdx] = useState(0);
  const [remoteFailed, setRemoteFailed] = useState(false);

  useEffect(() => {
    setRemoteIdx(0);
    setRemoteFailed(false);
  }, [resolved?.uuid]);

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

      <Card
        eyebrow="Personalización"
        title="Selector de skin"
        action={
          <span className="text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
            Fuente · sessionserver.mojang.com
          </span>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          Busca cualquier jugador real (Premium o histórico). La skin se
          obtiene directamente de Mojang en formato canónico 64×64, así que
          se ve igual que en el juego. El modelo (clásico o slim) se detecta
          automáticamente del perfil.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[260px,1fr]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-canvas-raised/60 p-5">
            {resolved ? (
              <>
                <div className="flex h-64 w-full items-center justify-center">
                  {!remoteFailed && remoteIdx < remoteRenderUrls.length ? (
                    <img
                      key={remoteRenderUrls[remoteIdx]}
                      src={remoteRenderUrls[remoteIdx]}
                      alt={`Skin de ${resolved.name}`}
                      className="h-64 w-auto drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)] [image-rendering:pixelated]"
                      onError={() => {
                        if (remoteIdx + 1 < remoteRenderUrls.length) {
                          setRemoteIdx(remoteIdx + 1);
                        } else {
                          setRemoteFailed(true);
                        }
                      }}
                    />
                  ) : skinBlobUrl ? (
                    <img
                      src={skinBlobUrl}
                      alt={`Skin de ${resolved.name}`}
                      className="h-56 w-56 [image-rendering:pixelated] drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)]"
                    />
                  ) : null}
                </div>
                <div className="text-center">
                  <div className="font-display text-[15px] font-semibold tracking-tight text-ink">
                    {resolved.name}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-gold-500/30 bg-gold-haze/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-200">
                    Modelo {resolved.model === "slim" ? "Slim (3px)" : "Classic (4px)"}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-64 w-full items-center justify-center text-center text-[11.5px] text-ink-faint">
                {resolving
                  ? "Buscando jugador…"
                  : resolveError
                    ? resolveError
                    : "Escribe un nombre para previsualizar."}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Field
              label="Nombre de jugador"
              placeholder="Ej. Notch, Dream, MrBeast…"
              value={skinName}
              onChange={(e) => setSkinName(e.target.value)}
            />

            <div className="rounded-2xl border border-gold-500/25 bg-gold-haze/30 p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-300">
                Cuenta Microsoft
              </div>
              <p className="mt-1 text-[12px] text-ink-muted">
                {activeAccount && activeAccount.kind === "microsoft" ? (
                  <>
                    Se aplicará permanentemente a{" "}
                    <span className="font-semibold text-ink">
                      {activeAccount.username}
                    </span>
                    {resolved ? (
                      <>
                        {" "}
                        usando el modelo{" "}
                        <span className="font-semibold text-ink">
                          {resolved.model}
                        </span>
                        .
                      </>
                    ) : (
                      "."
                    )}
                  </>
                ) : (
                  <>Activa una cuenta Microsoft arriba para cambiar tu skin real.</>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-gold"
                  disabled={
                    skinBusy ||
                    !resolved ||
                    !activeAccount ||
                    activeAccount.kind !== "microsoft"
                  }
                  onClick={() =>
                    tap("Aplicar skin Microsoft", async () => {
                      if (!activeAccount || !resolved) return;
                      setSkinBusy(true);
                      try {
                        await applyMicrosoftSkin({
                          accountId: activeAccount.id,
                          skinUrl: resolved.skinUrl,
                          variant: resolved.model,
                        });
                        alert(
                          `Skin de ${resolved.name} aplicada a tu cuenta Microsoft.`,
                        );
                      } finally {
                        setSkinBusy(false);
                      }
                    })
                  }
                >
                  <IconCheck width={13} height={13} /> Aplicar a Microsoft
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={
                    skinBusy ||
                    !activeAccount ||
                    activeAccount.kind !== "microsoft"
                  }
                  onClick={() =>
                    tap("Restablecer skin", async () => {
                      if (!activeAccount) return;
                      if (!confirm("¿Restablecer la skin por defecto?")) return;
                      setSkinBusy(true);
                      try {
                        await resetMicrosoftSkin(activeAccount.id);
                        alert("Skin restablecida.");
                      } finally {
                        setSkinBusy(false);
                      }
                    })
                  }
                >
                  <IconX width={13} height={13} /> Restablecer
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-canvas-raised/60 p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
                Resource pack local (cuentas offline)
              </div>
              <p className="mt-1 text-[12px] text-ink-muted">
                Reemplaza la textura por defecto en una instancia. Sólo es
                visible para ti en partidas offline o servidores propios; en
                servidores Premium cada jugador ve su skin real.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,auto]">
                <FieldSelect
                  value={skinInstance}
                  onChange={(e) => setSkinInstance(e.target.value)}
                >
                  {instances.length === 0 ? (
                    <option value="">Sin instancias</option>
                  ) : (
                    instances.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} · {i.minecraftVersion}
                      </option>
                    ))
                  )}
                </FieldSelect>
                <button
                  type="button"
                  className="btn"
                  disabled={skinBusy || !resolved || !skinInstance}
                  onClick={() =>
                    tap("Aplicar skin (pack)", async () => {
                      const ins = instances.find((i) => i.id === skinInstance);
                      if (!ins || !resolved) return;
                      setSkinBusy(true);
                      try {
                        const bytes = new Uint8Array(resolved.skinBytes);
                        await applySkinAsResourcePack(
                          ins.instancePath,
                          bytes,
                          resolved.model,
                        );
                        alert(
                          `Skin de ${resolved.name} instalada en "${ins.name}". Si Minecraft ya estaba abierto, reinícialo para verla.`,
                        );
                      } finally {
                        setSkinBusy(false);
                      }
                    })
                  }
                >
                  <IconCheck width={13} height={13} /> Aplicar al pack
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
