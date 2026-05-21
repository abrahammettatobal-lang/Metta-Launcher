import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  accountAddOffline,
  accountDelete,
  accountLogout,
  accountSetActive,
  accountsList,
  applyMicrosoftSkin,
  instancesList,
  logAppend,
  microsoftDevicePoll,
  microsoftDeviceStart,
  resetMicrosoftSkin,
  resolveMinecraftSkin,
} from "../services/bridge";
import type { AccountRow, InstanceRow, ResolvedSkin } from "../services/bridge";
import { applySkinAsResourcePack } from "../services/minecraft/skinManager";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Field, FieldSelect } from "../ui/Field";
import { Avatar } from "../ui/Avatar";
import { Empty } from "../ui/Empty";
import {
  IconCheck,
  IconLink,
  IconLoader,
  IconShield,
  IconTrash,
  IconUser,
  IconX,
} from "../ui/icons";
import { tap, toastOk } from "../utils/tap";
import { cx } from "../ui/cx";
import { relativeTime } from "../utils/format";

interface AuthLog {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export function AccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [off, setOff] = useState("");
  const [dc, setDc] = useState<{
    userCode: string;
    uri: string;
    deviceCode: string;
    interval: number;
  } | null>(null);
  const [msBusy, setMsBusy] = useState(false);
  const [authLogs, setAuthLogs] = useState<AuthLog[]>([]);
  const pollRef = useRef(false);

  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [skinName, setSkinName] = useState("");
  const [skinInstance, setSkinInstance] = useState<string>("");
  const [skinBusy, setSkinBusy] = useState(false);
  const [resolved, setResolved] = useState<ResolvedSkin | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const activeAccount = useMemo(() => rows.find((r) => r.isActive), [rows]);
  const trimmedName = skinName.trim();

  const pushAuthLog = useCallback((level: AuthLog["level"], message: string) => {
    setAuthLogs((prev) =>
      [{ at: new Date().toISOString(), level, message }, ...prev].slice(0, 8),
    );
    void logAppend("auth", level, message);
  }, []);

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
    return () => {
      pollRef.current = false;
    };
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
    ];
  }, [resolved, uuidWithDashes]);

  const [remoteIdx, setRemoteIdx] = useState(0);
  const [remoteFailed, setRemoteFailed] = useState(false);

  useEffect(() => {
    setRemoteIdx(0);
    setRemoteFailed(false);
  }, [resolved?.uuid]);

  const cancelPoll = () => {
    pollRef.current = false;
    setDc(null);
    setMsBusy(false);
    pushAuthLog("info", "Inicio de sesión cancelado.");
  };

  const startMicrosoftLogin = () =>
    tap("Microsoft", async () => {
      pollRef.current = false;
      setMsBusy(true);
      pushAuthLog("info", "Solicitando código de dispositivo…");
      try {
        const s = await microsoftDeviceStart();
        setDc({
          userCode: s.userCode,
          uri: s.verificationUri,
          deviceCode: s.deviceCode,
          interval: s.interval || 5,
        });
        pushAuthLog("info", `Código generado: ${s.userCode}`);
        try {
          await openUrl(s.verificationUri);
          pushAuthLog("info", "Navegador abierto para autorizar.");
        } catch {
          pushAuthLog("warn", "No se pudo abrir el navegador. Usa el enlace manual.");
        }
        pollRef.current = true;
        const tick = async () => {
          if (!pollRef.current) return;
          try {
            const r = await microsoftDevicePoll(s.deviceCode);
            if (r.kind === "success") {
              pollRef.current = false;
              setDc(null);
              pushAuthLog("info", `Sesión iniciada como ${r.username}.`);
              toastOk("Sesión iniciada", r.username);
              await load();
              setMsBusy(false);
            } else if (r.kind === "error") {
              pollRef.current = false;
              setDc(null);
              pushAuthLog("error", r.message);
              setMsBusy(false);
            } else {
              setTimeout(tick, (s.interval || 5) * 1000);
            }
          } catch (e) {
            pollRef.current = false;
            setDc(null);
            pushAuthLog("error", String(e));
            setMsBusy(false);
          }
        };
        setTimeout(tick, (s.interval || 5) * 1000);
      } catch (e) {
        pushAuthLog("error", String(e));
        setMsBusy(false);
      }
    });

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Cuentas"
        title="Identidad de juego"
        subtitle="Microsoft para servidores Premium o perfil local para modo offline."
      />

      {activeAccount && (
        <Card padding="none" className="overflow-hidden">
          <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold-500/12 blur-3xl" />
            <Avatar
              name={activeAccount.username}
              src={
                activeAccount.kind === "microsoft"
                  ? `https://minotar.net/body/${activeAccount.username}/128.png`
                  : undefined
              }
              size={72}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                  {activeAccount.username}
                </h2>
                <span className="pill-gold">activa</span>
                <span className="pill">
                  {activeAccount.kind === "microsoft" ? "Microsoft" : "Local"}
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
                {activeAccount.uuid}
              </p>
              <p className="mt-2 text-[12px] text-ink-muted">
                Sesión lista para lanzar instancias.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeAccount.kind === "microsoft" && (
                <button
                  type="button"
                  className="btn"
                  disabled={msBusy}
                  onClick={() => startMicrosoftLogin()}
                >
                  Cambiar cuenta
                </button>
              )}
              {activeAccount.kind === "microsoft" && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() =>
                    tap("Cerrar sesión", async () => {
                      await accountLogout(activeAccount.id);
                      pushAuthLog("info", "Sesión Microsoft cerrada.");
                      await load();
                    })
                  }
                >
                  Cerrar sesión
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          eyebrow="Premium"
          title="Microsoft"
          action={
            <span className="pill-gold">
              <IconShield width={11} height={11} /> Recomendado
            </span>
          }
        >
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Autoriza en{" "}
            <span className="font-mono text-ink-soft">microsoft.com/link</span>.
            Las credenciales se guardan en el llavero del sistema, nunca la
            contraseña.
          </p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.99 }}
            className="btn-gold mt-4"
            disabled={msBusy}
            onClick={() => startMicrosoftLogin()}
          >
            {msBusy ? (
              <IconLoader width={14} height={14} className="animate-spin" />
            ) : (
              <IconUser width={14} height={14} />
            )}
            {msBusy ? "Esperando autorización…" : "Iniciar con Microsoft"}
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
                <span>Introduce el código en el navegador para continuar.</span>
                <button
                  type="button"
                  className="btn-ghost !text-gold-300 hover:!text-gold-200"
                  onClick={() => tap("Abrir enlace", async () => openUrl(dc.uri))}
                >
                  <IconLink width={13} height={13} /> Abrir enlace
                </button>
              </div>
              <button
                type="button"
                onClick={cancelPoll}
                className="btn-ghost mt-2 !text-ink-faint hover:!text-ink"
              >
                <IconX width={12} height={12} /> Cancelar
              </button>
            </motion.div>
          )}

          {authLogs.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-canvas-deep/50 p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                Registro de autenticación
              </div>
              <ul className="space-y-1">
                {authLogs.map((l) => (
                  <li
                    key={l.at + l.message}
                    className={cx(
                      "font-mono text-[10.5px]",
                      l.level === "error"
                        ? "text-red-300"
                        : l.level === "warn"
                          ? "text-amber-200"
                          : "text-ink-muted",
                    )}
                  >
                    {new Date(l.at).toLocaleTimeString("es")} · {l.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card eyebrow="Local" title="Cuenta offline">
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Para servidores offline o partidas en solitario sin verificación
            Premium.
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
                  toastOk("Cuenta local añadida", off.trim());
                  await load();
                })
              }
            >
              <IconCheck width={14} height={14} /> Añadir
            </button>
          </div>
        </Card>
      </div>

      <Card eyebrow="Perfiles" title="Todas las cuentas">
        {rows.length === 0 ? (
          <Empty
            icon={<IconUser width={22} height={22} />}
            title="Sin cuentas"
            description="Inicia sesión con Microsoft o crea un perfil local."
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
                      {a.kind === "microsoft" ? "Microsoft" : "Local"}
                    </span>
                    {a.isActive && <span className="pill-gold">activa</span>}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-faint">
                    {a.uuid} · {relativeTime(a.createdAt)}
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
                        if (a.kind === "microsoft") await accountLogout(a.id);
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

      <Card eyebrow="Personalización" title="Selector de skin">
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          Busca un jugador Premium y aplica su skin a tu cuenta Microsoft o a
          un resource pack local para cuentas offline.
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
                    Modelo {resolved.model === "slim" ? "Slim" : "Classic"}
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
              placeholder="Nombre en Mojang"
              value={skinName}
              onChange={(e) => setSkinName(e.target.value)}
            />

            <div className="rounded-2xl border border-gold-500/25 bg-gold-haze/30 p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-300">
                Cuenta Microsoft
              </div>
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
                        toastOk("Skin aplicada", resolved.name);
                      } finally {
                        setSkinBusy(false);
                      }
                    })
                  }
                >
                  Aplicar a Microsoft
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
                      setSkinBusy(true);
                      try {
                        await resetMicrosoftSkin(activeAccount.id);
                        toastOk("Skin restablecida");
                      } finally {
                        setSkinBusy(false);
                      }
                    })
                  }
                >
                  Restablecer
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-canvas-raised/60 p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
                Resource pack local (offline)
              </div>
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
                        toastOk("Skin instalada en instancia", ins.name);
                      } finally {
                        setSkinBusy(false);
                      }
                    })
                  }
                >
                  Aplicar al pack
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
