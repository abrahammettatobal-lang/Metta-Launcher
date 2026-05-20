import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://abrahammettatobal-lang.github.io/Metta-Launcher";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Metta Launcher — Launcher moderno para Minecraft",
    template: "%s · Metta Launcher",
  },
  description:
    "Descarga Metta Launcher para Windows, Linux y macOS. Soporte para Vanilla, Fabric, Forge, NeoForge y Bedrock en Windows.",
  applicationName: "Metta Launcher",
  keywords: [
    "Minecraft launcher",
    "Metta Launcher",
    "Fabric",
    "Forge",
    "NeoForge",
    "Bedrock",
    "Minecraft Java",
    "launcher Windows",
    "launcher macOS",
    "launcher Linux",
  ],
  authors: [{ name: "Metta" }],
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "Metta Launcher",
    title: "Metta Launcher — Tu mundo. Tu forma de jugar.",
    description:
      "Launcher moderno para Minecraft con soporte para Vanilla, Fabric, Forge, NeoForge y Bedrock en Windows.",
    images: [
      {
        url: "/og-image.png",
        width: 1280,
        height: 800,
        alt: "Metta Launcher",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Metta Launcher — Tu mundo. Tu forma de jugar.",
    description:
      "Launcher moderno para Minecraft con soporte para Vanilla, Fabric, Forge, NeoForge y Bedrock en Windows.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    shortcut: ["/favicon.png"],
    apple: [{ url: "/favicon.png" }],
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080807",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className="relative">
        <link
          rel="preconnect"
          href="https://rsms.me/"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
