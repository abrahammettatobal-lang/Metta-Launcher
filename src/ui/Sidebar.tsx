import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { accountsList, type AccountRow } from "../services/bridge";
import { IconUser, MettaMark } from "./icons";
import { sections } from "./navigation";
import { Avatar } from "./Avatar";
import { version as buildVersion } from "../../package.json";

export interface SidebarStatus {
  text: string;
  variant: "idle" | "playing" | "busy" | "error";
}

export function Sidebar() {
  const { pathname } = useLocation();
  const [account, setAccount] = useState<AccountRow>();
  const [version, setVersion] = useState(buildVersion);
  useEffect(() => {
    if (isTauri())
      void getVersion()
        .then(setVersion)
        .catch(() => {});
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let live = true;
    const refresh = () =>
      void accountsList()
        .then((rows) => {
          if (live) setAccount(rows.find((row) => row.isActive));
        })
        .catch(() => {});
    refresh();
    window.addEventListener("metta-accounts-changed", refresh);
    return () => {
      live = false;
      window.removeEventListener("metta-accounts-changed", refresh);
    };
  }, [pathname]);

  return (
    <aside className="rail">
      <NavLink to="/" className="wordmark" aria-label="Metta Launcher, inicio">
        <MettaMark size={46} />
        <span>
          <b>METTA</b>
          <small>LAUNCHER</small>
        </span>
      </NavLink>
      <nav
        aria-label="Navegación principal"
        className="rail-nav scrollbar-thin"
      >
        {sections.map((group) => (
          <div className="rail-group" key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                to={to}
                end={to === "/"}
                key={to}
                title={label}
                className={({ isActive }) =>
                  isActive ? "rail-link current" : "rail-link"
                }
              >
                <Icon width={17} height={17} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="rail-footer">
        <NavLink
          to="/accounts"
          className="rail-profile"
          title={account?.username ?? "Abrir perfiles"}
        >
          {account ? (
            <Avatar name={account.username} size={34} />
          ) : (
            <i>
              <IconUser width={17} height={17} />
            </i>
          )}
          <span>
            <b>{account?.username ?? "Mi perfil"}</b>
            <small>
              {account
                ? account.kind === "microsoft"
                  ? "Microsoft"
                  : "Cuenta local"
                : "Elegir cuenta"}
            </small>
          </span>
          <em aria-hidden>›</em>
        </NavLink>
        <div className="rail-build">
          <span>METTA LAUNCHER</span>
          <span>v{version}</span>
        </div>
      </div>
    </aside>
  );
}
