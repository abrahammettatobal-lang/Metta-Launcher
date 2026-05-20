import { cx } from "./cx";

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full border transition-all duration-200 ease-soft",
        checked
          ? "border-gold-500/55 bg-gradient-to-r from-gold-500 to-gold-400 shadow-gold-soft"
          : "border-line bg-canvas-raised",
      )}
    >
      <span
        className={cx(
          "absolute top-[2px] h-[16px] w-[16px] rounded-full bg-canvas-deep transition-all duration-300 ease-soft",
          checked
            ? "left-[21px] bg-gradient-to-br from-ink to-ink-soft shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
            : "left-[2px] bg-ink-muted/80",
        )}
      />
    </button>
  );
}
