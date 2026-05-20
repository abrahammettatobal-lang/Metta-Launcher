import { motion } from "framer-motion";
import { cx } from "./cx";

interface ProgressProps {
  value: number | null;
  label?: string;
  detail?: string;
  className?: string;
}

export function Progress({ value, label, detail, className }: ProgressProps) {
  const indet = value === null;
  return (
    <div className={cx("w-full", className)}>
      {(label || value !== null) && (
        <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.18em]">
          {label && <span className="text-ink-faint">{label}</span>}
          {value !== null && <span className="text-gold-300">{value}%</span>}
        </div>
      )}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-canvas-deep">
        {indet ? (
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-gold-300 to-transparent"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-gold-300 via-gold-200 to-gold-400 shadow-[0_0_14px_rgba(228,188,60,0.55)]"
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 0.4 }}
          />
        )}
      </div>
      {detail && (
        <p className="mt-1.5 truncate text-[10.5px] text-ink-faint">{detail}</p>
      )}
    </div>
  );
}
