// Ship's UI kit: parchment panels, brass buttons, tabs and form fields.

import { useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { IconClose } from "./icons.js";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "seafoam";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-transparent text-[var(--page-ink)] border-0 shadow-none hover:underline underline-offset-4",
  seafoam: "bg-transparent text-[#386657] border-0 shadow-none hover:underline underline-offset-4",
  secondary: "bg-transparent text-[var(--page-ink)] border-0 shadow-none hover:underline underline-offset-4",
  ghost: "bg-transparent text-current border-0 shadow-none hover:underline underline-offset-4",
  danger: "bg-transparent text-[#8A3B31] border-0 shadow-none hover:underline underline-offset-4",
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
        "inline-flex items-center justify-center gap-1.5 font-serif font-normal tracking-wide transition select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
        "disabled:cursor-not-allowed disabled:text-[var(--muted-ink)]",
        size === "sm" && "px-1.5 py-0.5 text-sm",
        size === "md" && "px-2 py-1 text-[15px]",
        size === "lg" && "px-2.5 py-1 text-base",
        BUTTON[variant],
        className,
      )}
      {...rest}
    />
  );
}

/**
 * A full-height parchment panel over the scene. Escape closes it; focus moves in and back out. If
 * what opened it has gone meanwhile (a banner's button hides while its panel is open), the focus
 * goes back to the panel's own button instead (`opener`: an element with data-panel-opener="…").
 */
export function Panel({ title, subtitle, icon, onClose, children, wide = false, opener }: { title: string; subtitle?: string; icon?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; opener?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      if (previous?.isConnected && previous !== document.body) previous.focus?.();
      else if (opener) document.querySelector<HTMLElement>(`[data-panel-opener="${opener}"]`)?.focus();
    };
  }, [opener]);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[rgb(0_0_0_/_0.26)] p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "modal-enter relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--surface-1)] font-serif text-[var(--page-ink)] shadow-sm outline-none sm:rounded-3xl sm:p-2",
          wide ? "sm:max-w-5xl" : "sm:max-w-3xl",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:rounded-[16px]">
          <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-2)] px-5 py-3">
            {icon && <span className="grid size-10 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[#FFF7D6] text-[#5C544B]">{icon}</span>}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-serif text-xl font-normal tracking-wide leading-tight">
                {title}
              </h2>
              {subtitle && <p className="truncate text-sm text-[var(--muted-ink)]">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-[var(--muted-ink)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]">
              <IconClose />
            </button>
          </header>
          {/* relative: anything positioned inside stays inside the scrolling body, not the clipped dialog around it. */}
          <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** `tone="pastel"` gives the Ink & Paper look (a butter-yellow active tab) used by the newer panels. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  tone = "kit",
}: {
  tabs: { id: T; label: string; badge?: number }[];
  value: T;
  onChange: (id: T) => void;
  tone?: "kit" | "pastel";
}) {
  const active = tone === "pastel" ? "bg-[#FFF1B8] text-[#5B460F] shadow-[0_2px_0_#F1E3A0]" : "bg-navy-900 text-cream-50 shadow-sm";
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "flex items-center gap-1.5 rounded-[12px] px-3 py-1.5 font-display text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
            tone === "pastel" ? "font-normal" : "font-bold",
            value === t.id ? active : "text-[var(--muted-ink)] hover:bg-[var(--surface-1)] hover:text-[var(--page-ink)]",
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
      <span className="mb-1 block text-sm font-bold text-[var(--page-ink)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--muted-ink)]">{hint}</span>}
    </label>
  );
}

const INPUT = "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--page-ink)] placeholder:text-[var(--muted-ink)] focus-visible:border-navy-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass-400";

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
  return <div className={cx("rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4", className)}>{children}</div>;
}

export function Badge({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "brass" | "seafoam" | "coral" | "navy"; className?: string }) {
  const tones = {
    plain: "bg-[rgb(0_0_0_/_0.06)] text-[var(--page-ink)]",
    brass: "bg-brass-300 text-[#4D453E]",
    seafoam: "bg-seafoam-500 text-white",
    coral: "bg-coral-500 text-white",
    navy: "bg-navy-800 text-cream-50",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", tones[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, color = "var(--color-seafoam-500)", label, className }: { value: number; color?: string; label?: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label} className={cx("h-3 w-full overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[rgb(0_0_0_/_0.08)]", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-6 py-8 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="mt-1 text-sm text-[var(--muted-ink)]">{children}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block font-bold">{label}</span>
        {hint && <span className="block text-sm text-[var(--muted-ink)]">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-7 w-12 shrink-0 rounded-full border border-[var(--border-subtle)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
          checked ? "bg-seafoam-500" : "bg-[rgb(0_0_0_/_0.14)]",
        )}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full border border-[rgb(0_0_0_/_0.2)] bg-cream-50 transition-[left] duration-150", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

/** Reads a file the sailor picked as bytes (binary formats) or text. */
export async function readFile(file: File): Promise<{ name: string; data: Uint8Array | string }> {
  const binary = /\.(parchment|plist|bin|pdf|docx|pptx|doc|ppt|key|pages|odt|odp|png|jpe?g|webp|heic|heif|gif|bmp|tiff?)$/i.test(file.name);
  return { name: file.name, data: binary ? new Uint8Array(await file.arrayBuffer()) : await file.text() };
}
