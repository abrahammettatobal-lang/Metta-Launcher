import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";

type Wrap = {
  label?: ReactNode;
  hint?: ReactNode;
  /** Class on the outer <label> wrapper (use for layout: flex-1, mt-*, etc.) */
  className?: string;
  /** Class merged into the input/select/textarea itself (font-mono, etc.) */
  inputClassName?: string;
};

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & Wrap;

export function Field({
  label,
  hint,
  className,
  inputClassName,
  ...rest
}: FieldProps) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="field-label">{label}</span>}
      <input {...rest} className={cx("field", inputClassName)} />
      {hint && <p className="mt-1.5 text-[11.5px] text-ink-faint">{hint}</p>}
    </label>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> &
  Wrap & {
    children: ReactNode;
  };

export function FieldSelect({
  label,
  hint,
  className,
  inputClassName,
  children,
  ...rest
}: SelectProps) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="field-label">{label}</span>}
      <select {...rest} className={cx("field", inputClassName)}>
        {children}
      </select>
      {hint && <p className="mt-1.5 text-[11.5px] text-ink-faint">{hint}</p>}
    </label>
  );
}

type AreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> &
  Wrap;

export function FieldTextarea({
  label,
  hint,
  className,
  inputClassName,
  ...rest
}: AreaProps) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="field-label">{label}</span>}
      <textarea {...rest} className={cx("field", inputClassName)} />
      {hint && <p className="mt-1.5 text-[11.5px] text-ink-faint">{hint}</p>}
    </label>
  );
}
