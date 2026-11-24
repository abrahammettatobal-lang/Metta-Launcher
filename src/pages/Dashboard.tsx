import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { Link, useNavigate } from "react-router-dom";
import {
  accountsList,
  instancesList,
  launchHistoryList,
  type AccountRow,
  type InstanceRow,
  type LaunchHistoryRow,
} from "../services/bridge";
import {
  subscribeLaunchProgress,
  type LaunchProgress,
} from "../services/launchProgress";
import {
  subscribeDownloadProgress,
  onNativeEvent,
} from "../services/downloads/downloadEvents";
import {
  cancelCurrentLaunch,
  launchInstance,
} from "../services/launchInstance";
import { fetchMojangNews, type MojangNewsEntry } from "../services/mojangNews";
import { listMods } from "../services/modsService";
import {
  IconClock,
  IconCubes,
  IconFolder,
  IconPlay,
  IconPlus,
  IconPuzzle,
  IconRecord,
  IconSliders,
  IconX,
} from "../ui/icons";
import { Hero } from "../ui/Hero";
import { formatBytes, loaderLabel, relativeTime } from "../utils/format";
import { fullPath } from "../utils/full-path";
import { tap } from "../utils/tap";

const shortcuts = [
  {
    path: "/instances",
    title: "Mis instancias",
    art: "grass",
    icon: IconCubes,
    detail: "Versiones y modpacks",
  },
  {
    path: "/mods",
    title: "Gestor de mods",
    art: "redstone",
    icon: IconPuzzle,
    detail: "Complementos instalados",
  },
  {
    path: "/recording",
    title: "Grabaciones",
    art: "amethyst",
    icon: IconRecord,
    detail: "Captura y galería",
  },
];
const selectionKey = "metta.selectedInstance";
export function Dashboard() {
  const nav = useNavigate();
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [selected, setSelected] = useState("");
  const [account, setAccount] = useState<AccountRow>();
  const [history, setHistory] = useState<LaunchHistoryRow[]>([]);
  const [news, setNews] = useState<MojangNewsEntry[] | null>(null);
  const [progress, setProgress] = useState<LaunchProgress | null>(null);
  const [pending, setPending] = useState(false);
  const [mods, setMods] = useState<number | null>(null);
  const [download, setDownload] = useState("");
  const [loadError, setLoadError] = useState("");
  const cur = instances.find((row) => row.id === selected);
  const reload = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [rows, accounts, sessions] = await Promise.all([
        instancesList(),
        accountsList(),
        launchHistoryList(4),
      ]);
      setInstances(rows);
      setSelected((previous) => {
        const id = previous || localStorage.getItem(selectionKey);
        return rows.find((row) => row.id === id)?.id ?? rows[0]?.id ?? "";
      });
      setAccount(accounts.find((a) => a.isActive));
      setHistory(sessions);
      setLoadError("");
    } catch (e) {
      setLoadError(String(e));
    }
  }, []);
  useEffect(() => {
    void reload();
    window.addEventListener("metta-session-ended", reload);
    return () => window.removeEventListener("metta-session-ended", reload);
  }, [reload]);
  useEffect(
    () =>
      subscribeLaunchProgress((p) =>
        setProgress(p.phase === "idle" ? null : p),
      ),
    [],
  );
  useEffect(() => {
    if (!isTauri()) return;
    return onNativeEvent(
      subscribeDownloadProgress((p) =>
        setDownload(
          p.state === "downloading"
            ? formatBytes(p.received) +
                (p.total ? " / " + formatBytes(p.total) : "")
            : "",
        ),
      ),
    );
  }, []);
  useEffect(() => {
    let live = true;
    setMods(null);
    if (cur)
      void listMods(cur.instancePath)
        .then((files) => {
          if (live) setMods(files.filter((f) => f.enabled).length);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [cur?.instancePath]);
  useEffect(() => {
    let live = true;
    void fetchMojangNews().then((items) => {
      if (live) setNews(items);
    });
    return () => {
      live = false;
    };
  }, []);

  const playing = progress?.phase === "running";
  const busy =
    pending ||
    !!(progress && !["error", "done", "idle"].includes(progress.phase));
  const play = async () => {
    if (!cur) {
      nav("/create");
      return;
    }
    if (!account) {
      nav("/accounts");
      return;
    }
    setPending(true);
    try {
      await tap("Iniciar Minecraft", () => launchInstance(cur.id));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="dashboard">
      <header className="home-heading">
        <h1>Centro de juego</h1>
        <span className="home-date">
          {new Intl.DateTimeFormat("es-MX", {
            weekday: "short",
            day: "2-digit",
            month: "short",
          }).format(new Date())}
        </span>
      </header>
      {loadError && (
        <div className="feedback" role="alert">
          No se pudo leer tu biblioteca.{" "}
          <button onClick={() => void reload()}>Reintentar</button>
        </div>
      )}
      <Hero>
        <p>
          {cur ? (
            <>
              <strong>{cur.name}</strong> <span> / </span>{" "}
              {loaderLabel(cur.loaderType)} · {cur.minecraftVersion}
            </>
          ) : (
            "Crea una instancia para elegir tu versión y empezar a jugar."
          )}
        </p>
        <div className="launch-actions">
          <button
            className="btn-gold hero-action"
            disabled={busy}
            onClick={() => void play()}
          >
            {cur ? (
              <IconPlay width={15} height={15} />
            ) : (
              <IconPlus width={16} height={16} />
            )}
            {playing
              ? "En juego"
              : busy
                ? "Preparando…"
                : !cur
                  ? "Crear instancia"
                  : !account
                    ? "Elegir perfil"
                    : "Jugar ahora"}
          </button>
          {cur && (
            <>
              <select
                aria-label="Instancia activa"
                className="instance-picker"
                disabled={busy}
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  localStorage.setItem(selectionKey, e.target.value);
                }}
              >
                {instances.map((i) => (
                  <option value={i.id} key={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <Link
                to={"/instances/" + cur.id + "/edit"}
                className="cover-edit"
                aria-label="Editar instancia activa"
              >
                <IconSliders width={17} height={17} />
              </Link>
            </>
          )}
        </div>
      </Hero>
      {(busy || progress?.phase === "error") && (
        <div className="launch-feedback" role="status">
          <div>
            <b>{progress?.label ?? "Preparando"}</b>
            <span>{progress?.detail || download}</span>
          </div>
          {busy && (
            <button
              className="btn"
              onClick={() => void tap("Detener", cancelCurrentLaunch)}
            >
              <IconX width={14} height={14} />
              {playing ? "Detener juego" : "Cancelar"}
            </button>
          )}
          {progress?.percent != null && !playing && (
            <progress max={100} value={progress.percent} />
          )}
        </div>
      )}
      {cur && (
        <div className="instance-strip">
          <span>
            RAM <b>{formatBytes(cur.maxRamMb * 1024 * 1024)}</b>
          </span>
          <span>
            Mods activos <b>{mods ?? "—"}</b>
          </span>
          <span>
            Perfil <b>{account?.username ?? "Sin elegir"}</b>
          </span>
          <div>
            {["", "mods", "config"].map((sub, i) => (
              <button
                key={sub}
                onClick={() =>
                  void tap("Abrir carpeta", async () =>
                    openPath(
                      await fullPath(cur.instancePath + (sub ? "/" + sub : "")),
                    ),
                  )
                }
              >
                <IconFolder width={13} height={13} />
                {["Carpeta", "Mods", "Config"][i]}
              </button>
            ))}
          </div>
        </div>
      )}
      <section>
        <div className="section-heading">
          <h2>Mi biblioteca</h2>
          <Link to="/create">
            <IconPlus width={14} height={14} /> Nueva instancia
          </Link>
        </div>
        <div className="library-links">
          {shortcuts.map(({ path, title, art, icon: Icon, detail }) => (
            <Link to={path} key={path} className={"library-card art-" + art}>
              <img src={"./art/" + art + ".webp"} alt="" />
              <div className="library-caption">
                <Icon width={17} height={17} />
                <div>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
              </div>
              <span className="card-arrow" aria-hidden>
                ↗
              </span>
            </Link>
          ))}
        </div>
      </section>
      <div className="home-bottom">
        <section>
          <div className="section-heading">
            <h2>Actividad reciente</h2>
            <Link to="/history">
              Ver historial <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="activity-list">
            {history.length ? (
              history.map((h) => (
                <div key={h.id}>
                  <IconClock />
                  <span>
                    <b>{h.instanceName ?? "Instancia"}</b>
                    <small>
                      {h.finishedAt
                        ? h.success
                          ? "Completada"
                          : "Finalizó con un error"
                        : "En curso"}
                    </small>
                  </span>
                  <time>{relativeTime(h.startedAt)}</time>
                </div>
              ))
            ) : (
              <div>
                <IconClock />
                <span>
                  <b>Aún no hay partidas</b>
                  <small>Aquí verás tus últimas sesiones de Minecraft.</small>
                </span>
              </div>
            )}
          </div>
        </section>
        <section>
          <div className="section-heading">
            <h2>Noticias de Minecraft</h2>
          </div>
          <div className="news-list">
            {news === null ? (
              <p>Cargando noticias…</p>
            ) : news.length ? (
              news.slice(0, 2).map((item) => (
                <button
                  key={item.id}
                  disabled={!item.link}
                  onClick={() =>
                    void tap("Abrir noticia", async () => {
                      if (item.link && isTauri()) await openUrl(item.link);
                      else if (item.link)
                        window.open(item.link, "_blank", "noopener,noreferrer");
                    })
                  }
                >
                  {item.image && <img alt="" src={item.image} />}
                  <b>{item.title}</b>
                  <span aria-hidden>↗</span>
                </button>
              ))
            ) : (
              <p>
                Las noticias de Mojang no están disponibles en este momento.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
