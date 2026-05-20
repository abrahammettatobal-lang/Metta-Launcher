import Image from "next/image";
import {
  IconApple,
  IconGithub,
  IconLinux,
  IconWindows,
} from "./Icons";
import {
  downloads,
  RELEASE_URL,
  REPO_URL,
} from "@/data/downloads";

const year = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="relative pt-16 pb-10">
      <div className="container-page">
        <div className="divider" />
        <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg ring-1 ring-gold-500/30">
                <Image
                  src="/metta-logo.png"
                  alt=""
                  width={36}
                  height={36}
                  className="h-7 w-7 object-contain"
                />
              </span>
              <span className="font-display text-[15px] font-semibold tracking-tight">
                Metta <span className="gold-text">Launcher</span>
              </span>
            </div>
            <p className="muted mt-4 max-w-xs text-pretty">
              Launcher moderno para Minecraft. Multi-loader en Java y soporte
              nativo para Bedrock en Windows.
            </p>
          </div>

          <FooterCol title="Proyecto">
            <FooterLink href={REPO_URL}>
              <IconGithub width={12} height={12} /> GitHub
            </FooterLink>
            <FooterLink href={`${REPO_URL}/releases`}>Releases</FooterLink>
            <FooterLink href={RELEASE_URL}>Última versión</FooterLink>
            <FooterLink href={`${REPO_URL}/issues`}>Reportar un bug</FooterLink>
          </FooterCol>

          <FooterCol title="Descargas">
            <FooterLink href={downloads.windows.assets[0].url}>
              <IconWindows width={12} height={12} /> Windows
            </FooterLink>
            <FooterLink href={downloads.macos.assets[0].url}>
              <IconApple width={12} height={12} /> macOS
            </FooterLink>
            <FooterLink href={downloads.linux.assets[0].url}>
              <IconLinux width={12} height={12} /> Linux
            </FooterLink>
          </FooterCol>

          <FooterCol title="Información">
            <FooterLink href="#features">Características</FooterLink>
            <FooterLink href="#install">Instalación</FooterLink>
            <FooterLink href="#security">Seguridad</FooterLink>
            <FooterLink href="#faq">FAQ</FooterLink>
          </FooterCol>
        </div>

        <div className="divider mt-12" />

        <div className="mt-6 flex flex-col items-start justify-between gap-3 text-[11.5px] text-ink-faint sm:flex-row sm:items-center">
          <div>© {year} Metta Launcher · Hecho con cariño para la comunidad.</div>
          <div className="text-pretty sm:text-right">
            Metta Launcher no está afiliado con Mojang, Microsoft ni Minecraft.{" "}
            <span className="text-ink-muted">
              Minecraft es una marca registrada de Mojang Studios.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="eyebrow">{title}</div>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith("http");
  return (
    <li>
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft transition-colors hover:text-gold-200"
      >
        {children}
      </a>
    </li>
  );
}
