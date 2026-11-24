import { useLayoutEffect, useRef, type ReactNode } from "react";
import { IconCubes } from "./icons";

const panorama = "./art/cordillera.webp";

export function Hero({ children }: { children: ReactNode }) {
  const scene = useRef<HTMLElement>(null);
  const lens = useRef<HTMLButtonElement>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const panel = scene.current,
      control = lens.current;
    if (!panel || !control) return;
    // Sample the same point of the panorama at a higher magnification inside the lens.
    const sample = () => {
      const a = panel.getBoundingClientRect(),
        b = control.getBoundingClientRect();
      const scale = Math.max(a.width / 1536, a.height / 644);
      const width = 1536 * scale,
        height = 644 * scale;
      const x = b.left - a.left + b.width / 2 + (width - a.width) / 2;
      const y = b.top - a.top + b.height / 2 + (height - a.height) / 2;
      const zoom = 1.14;
      control.style.setProperty(
        "--sample-size",
        width * zoom + "px " + height * zoom + "px",
      );
      control.style.setProperty(
        "--sample-position",
        b.width / 2 - x * zoom + "px " + (b.height / 2 - y * zoom) + "px",
      );
    };
    sample();
    const observer = new ResizeObserver(sample);
    observer.observe(panel);
    observer.observe(control);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <section className="launch-cover" ref={scene}>
        <div className="cover-content">
          <div className="cover-tag">
            <i />
            <IconCubes width={14} height={14} /> Java Edition
          </div>
          <h2>Minecraft</h2>
          {children}
        </div>
        <button
          className="panorama-lens"
          ref={lens}
          title="Ampliar panorama"
          aria-label="Ampliar panorama de la cordillera"
          onClick={() => viewer.current?.showModal()}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty(
              "--shine",
              Math.round(((e.clientX - rect.left) / rect.width) * 100) + "%",
            );
          }}
          onPointerLeave={(e) =>
            e.currentTarget.style.removeProperty("--shine")
          }
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5" />
          </svg>
        </button>
      </section>
      <dialog
        ref={viewer}
        className="panorama-view"
        aria-label="Panorama de la cordillera"
        onClick={() => viewer.current?.close()}
      >
        <img
          src={panorama}
          alt="Cordillera nevada y una cabaña junto a un lago de Minecraft"
        />
        <button className="btn" onClick={() => viewer.current?.close()}>
          Cerrar panorama
        </button>
      </dialog>
    </>
  );
}
