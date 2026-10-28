// Ship's UI kit: parchment panels, brass buttons, tabs and form fields.

import { useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { IconClose } from "./icons.js";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "seafoam";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-brass-400 text-ink border-ink hover:bg-brass-300 shadow-[0_3px_0_0_var(--color-ink)] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--color-ink)]",
  seafoam: "bg-seafoam-500 text-white border-ink hover:bg-seafoam-400 shadow-[0_3px_0_0_var(--color-ink)] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--color-ink)]",
  secondary: "bg-cream-50 text-ink border-ink/70 hover:bg-white shadow-[0_2px_0_0_rgb(42_34_56/0.5)] active:translate-y-[1px]",
  ghost: "bg-transparent text-current border-transparent hover:bg-ink/8",
  danger: "bg-coral-500 text-white border-ink hover:bg-coral-400 shadow-[0_3px_0_0_var(--color-ink)] active:translate-y-[2px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border-2 font-display font-bold transition select-none",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brass-400",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:translate-y-0",
        size === "sm" && "px-2.5 py-1 text-sm",
        size === "md" && "px-3.5 py-1.5 text-[15px]",
        size === "lg" && "px-5 py-2.5 text-lg",
        BUTTON[variant],
        className,
      )}
      {...rest}
    />
  );
}

/** A full-height parchment panel over the scene. Escape closes it; focus moves in and back out. */
export function Panel({ title, subtitle, icon, onClose, children, wide = false }: { title: string; subtitle?: string; icon?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-navy-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border-[3px] border-ink bg-cream-100 text-ink shadow-card outline-none sm:rounded-3xl",
          wide ? "sm:max-w-5xl" : "sm:max-w-3xl",
        )}
      >
        <header className="flex items-center gap-3 border-b-[3px] border-ink/15 bg-cream-200 px-5 py-3">
          {icon && <span className="grid size-10 place-items-center rounded-xl border-2 border-ink bg-brass-400 text-ink">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-xl font-extrabold leading-tight">
              {title}
            </h2>
            {subtitle && <p className="truncate text-sm text-ink/70">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full border-2 border-ink/20 hover:bg-ink/10 focus-visible:outline-3 focus-visible:outline-brass-400">
            <IconClose />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1.5 rounded-2xl bg-cream-200 p-1.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-display text-sm font-bold transition",
            value === t.id ? "bg-navy-900 text-cream-50 shadow" : "text-ink/70 hover:bg-cream-50",
          )}
        >
          {t.label}
          {t.badge ? <span className="rounded-full bg-coral-500 px-1.5 text-xs text-white">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/60">{hint}</span>}
    </label>
  );
}

const INPUT = "w-full rounded-xl border-2 border-ink/25 bg-cream-50 px-3 py-2 text-ink placeholder:text-ink/40 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-brass-300";

// React 19 passes `ref` through as an ordinary prop, so these need no forwardRef.
export function TextInput(props: ComponentProps<"input">) {
  return <input {...props} className={cx(INPUT, props.className)} />;
}

export function TextArea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(INPUT, "min-h-28 resize-y leading-relaxed", props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(INPUT, "cursor-pointer", props.className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border-2 border-ink/15 bg-cream-50 p-4", className)}>{children}</div>;
}

export function Badge({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "brass" | "seafoam" | "coral" | "navy"; className?: string }) {
  const tones = {
    plain: "bg-ink/8 text-ink/80",
    brass: "bg-brass-300 text-ink",
    seafoam: "bg-seafoam-500 text-white",
    coral: "bg-coral-500 text-white",
    navy: "bg-navy-800 text-cream-50",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", tones[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, color = "var(--color-seafoam-500)", label, className }: { value: number; color?: string; label?: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label} className={cx("h-3 w-full overflow-hidden rounded-full border-2 border-ink/30 bg-ink/10", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-ink/20 px-6 py-8 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="mt-1 text-sm text-ink/70">{children}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block font-bold">{label}</span>
        {hint && <span className="block text-sm text-ink/60">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-7 w-12 shrink-0 rounded-full border-2 border-ink transition", checked ? "bg-seafoam-500" : "bg-ink/20")}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full border-2 border-ink bg-cream-50 transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

/** Reads a file the sailor picked as bytes (binary formats) or text. */
export async function readFile(file: File): Promise<{ name: string; data: Uint8Array | string }> {
  const binary = /\.(parchment|plist|bin)$/i.test(file.name);
  return { name: file.name, data: binary ? new Uint8Array(await file.arrayBuffer()) : await file.text() };
}
