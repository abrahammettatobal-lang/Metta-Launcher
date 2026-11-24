import { isWindowsClient } from "../services/bedrock";
import {
  IconActivity,
  IconBedrock,
  IconClock,
  IconCubes,
  IconHome,
  IconPlus,
  IconPuzzle,
  IconRecord,
  IconSliders,
  IconTerminal,
  IconUser,
} from "./icons";

export const sections = [
  {
    label: "Launcher",
    items: [
      { to: "/", label: "Inicio", icon: IconHome },
      { to: "/instances", label: "Instancias", icon: IconCubes },
      { to: "/mods", label: "Mods", icon: IconPuzzle },
      ...(isWindowsClient()
        ? [{ to: "/bedrock", label: "Bedrock", icon: IconBedrock }]
        : []),
    ],
  },
  {
    label: "Herramientas",
    items: [
      { to: "/recording", label: "Grabación", icon: IconRecord },
      { to: "/history", label: "Historial", icon: IconClock },
      { to: "/logs", label: "Registros", icon: IconTerminal },
      { to: "/diagnostics", label: "Diagnóstico", icon: IconActivity },
    ],
  },
  {
    label: "Preferencias",
    items: [
      { to: "/accounts", label: "Perfiles", icon: IconUser },
      { to: "/settings", label: "Ajustes", icon: IconSliders },
    ],
  },
];
export const destinations = [
  ...sections.flatMap((section) => section.items),
  { to: "/create", label: "Nueva instancia", icon: IconPlus },
];
