"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Search, X } from "lucide-react";
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ───────────────────────── Buttons ─────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  loadingText = "Loading…",
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  /** Label shown next to the spinner while loading (icon-only buttons show just the spinner) */
  loadingText?: ReactNode;
  icon?: ReactNode;
}) {
  const hasLabel = children !== undefined && children !== null && children !== false && children !== "";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        buttonStyles[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {hasLabel && loadingText}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}

// ───────────────────────── Form controls ─────────────────────────

const control =
  "rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-500";

/** Full width unless the caller passes its own width class (w-24, min-w-…, etc.) */
const width = (className?: string) => (/(^|\s)!?(min-)?w-/.test(className ?? "") ? "" : "w-full");

/** `isPassword` hides the text and adds an eye button at the right end to show / hide it */
export function Input({ className, isPassword = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { isPassword?: boolean }) {
  const [shown, setShown] = useState(false);
  if (!isPassword) return <input className={cx(control, width(className), "h-9", className)} {...props} />;

  const classes = (className ?? "").split(/\s+/).filter(Boolean);
  const outer = classes.filter((c) => LAYOUT_CLASS.test(c)).join(" ");
  const inner = classes.filter((c) => !LAYOUT_CLASS.test(c)).join(" ");
  return (
    <div className={cx("relative", width(outer), outer)}>
      <input {...props} type={shown ? "text" : "password"} className={cx(control, "h-9 w-full pr-9", inner)} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        disabled={props.disabled}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-600 focus:text-brand-600 focus:outline-none disabled:cursor-not-allowed"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/**
 * Drop-in replacement for a native <select>: same `value`, `onChange={(e) => … e.target.value}` and
 * <option>/<optgroup> children, rendered with the common Dropdown. Lists over 10 options get a search box
 * unless `isSearch` says otherwise.
 */
export function Select({
  className,
  children,
  value,
  onChange,
  disabled,
  isSearch,
  "aria-label": ariaLabel,
  title,
  id,
}: SelectHTMLAttributes<HTMLSelectElement> & { isSearch?: boolean }) {
  const options = optionsFrom(children);
  const current = value === undefined || value === null ? "" : String(value);
  // Like a native select, show the first option when the value matches none
  const fallback = options.some((o) => o.value === current) ? undefined : options[0]?.label;
  return (
    <Dropdown
      options={options}
      value={current}
      onChange={(v) => onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>)}
      placeholder={fallback}
      isSearch={isSearch ?? options.length > 10}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
      title={title}
      id={id}
    />
  );
}

/** Text inside an <option>, e.g. {code} · {name} */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** <option> and <optgroup> children → Dropdown options (fragments and arrays included) */
function optionsFrom(children: ReactNode, group?: string): DropdownOption[] {
  const out: DropdownOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: unknown; label?: string; children?: ReactNode }>(child)) return;
    if (child.type === "option") {
      const label = textOf(child.props.children);
      out.push({ value: child.props.value === undefined ? label : String(child.props.value), label, group });
    } else if (child.type === "optgroup") {
      out.push(...optionsFrom(child.props.children, child.props.label));
    } else if (child.type === Fragment) {
      out.push(...optionsFrom(child.props.children, group));
    }
  });
  return out;
}

export interface DropdownOption {
  value: string;
  label: string;
  /** Muted text shown after the label (and searched too), e.g. a code or city */
  hint?: string;
  /** Heading the option is listed under */
  group?: string;
}

/** Classes that place or size the control (kept on the wrapper); the rest style the button */
const LAYOUT_CLASS = /^(?:[a-z0-9]+:)*!?(?:(?:min-|max-)?w-|col-span|row-span|-?m[trblxy]?-|flex-|shrink|grow|basis-|self-|order-)/;

/**
 * Styled single-choice dropdown. `isSearch` adds a filter box at the top of the list.
 * The list opens in a layer above the page, so modals and scrolling tables don't clip it.
 * A value missing from `options` (e.g. a legacy one) still shows as the selection.
 */
export function Dropdown({
  options,
  value,
  onChange,
  placeholder = "Select…",
  isSearch = false,
  searchPlaceholder = "Search…",
  emptyText = "No options",
  allowClear = false,
  bare = false,
  anchor,
  disabled,
  className,
  title,
  id,
  "aria-label": ariaLabel,
}: {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isSearch?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Adds a "None" row that clears the value */
  allowClear?: boolean;
  /** No border or background, for a dropdown sitting inside its own styled box (e.g. the top bar) */
  bare?: boolean;
  /** Element the list lines up with (left edge and width) instead of the button, e.g. the box a bare dropdown sits in */
  anchor?: RefObject<HTMLElement | null>;
  disabled?: boolean;
  className?: string;
  title?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top: number; maxHeight: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();

  const classes = (className ?? "").split(/\s+/).filter(Boolean);
  const outer = classes.filter((c) => LAYOUT_CLASS.test(c)).join(" ");
  const inner = classes.filter((c) => !LAYOUT_CLASS.test(c)).join(" ");

  const q = query.trim().toLowerCase();
  const matches = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q),
      )
    : options;
  const rows: DropdownOption[] = allowClear && !q ? [{ value: "", label: "None" }, ...matches] : matches;
  const selected = options.find((o) => o.value === value);

  // Keep the list pinned right under the button (or `anchor`), exactly as wide as it
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = (anchor?.current ?? trigger.current)?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 8;
      setPos({ left: r.left, width: r.width, top: r.bottom + 4, maxHeight: Math.min(320, Math.max(120, below)) });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !popup.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show() {
    if (disabled) return;
    setQuery("");
    setPos(null);
    const all = allowClear ? [{ value: "" }, ...options] : options;
    setActive(Math.max(0, all.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function pick(o: DropdownOption) {
    if (o.value !== value) onChange(o.value);
    close();
  }

  // Popup key presses bubble here too (React portals follow the component tree)
  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) pick(rows[active]);
    } else if (e.key === "Escape") {
      // Close just the list, not the modal around it
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={box} className={cx("relative", width(outer), outer)} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => (open ? close() : show())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={cx(
          bare ? "bg-transparent text-sm focus:outline-none disabled:opacity-50" : control,
          "flex w-full items-center gap-2 text-left",
          !bare && !/(^|\s)h-/.test(inner) && "h-9",
          inner,
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", !selected && !value && "text-slate-400")}>
          {selected?.label ?? (value || placeholder)}
          {selected?.hint && <span className="ml-1.5 text-xs text-slate-400">{selected.hint}</span>}
        </span>
        <ChevronDown className={cx("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popup}
            style={{ left: pos.left, width: pos.width, top: pos.top, maxHeight: pos.maxHeight }}
            className="no-print fixed z-[70] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            {isSearch && (
              <div className="relative shrink-0 border-b border-slate-100 p-1.5">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  aria-controls={listId}
                  className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
                />
              </div>
            )}
            <div ref={list} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
              {rows.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">{q ? "No matches" : emptyText}</p>}
              {rows.map((o, i) => (
                <Fragment key={`${o.group ?? ""}:${o.value || "__none"}:${i}`}>
                  {o.group && o.group !== rows[i - 1]?.group && (
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{o.group}</p>
                  )}
                  <button
                    type="button"
                    role="option"
                    data-index={i}
                    aria-selected={o.value === value}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    className={cx(
                      "flex w-full items-center gap-2 py-2 pr-3 text-left text-sm",
                      o.group ? "pl-5" : "pl-3",
                      i === active ? "bg-brand-50" : "hover:bg-slate-50",
                      !o.value && "text-slate-500",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {o.label}
                      {o.hint && <span className="ml-1.5 text-xs text-slate-400">{o.hint}</span>}
                    </span>
                    {o.value === value && <Check className="size-4 shrink-0 text-brand-600" />}
                  </button>
                </Fragment>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(control, width(className), "py-2", className)} rows={3} {...props} />;
}

export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  indeterminate = false,
  disabled,
  title,
  "aria-label": ariaLabel,
}: {
  /** Leave out for a bare checkbox (e.g. table row selection) and pass aria-label instead */
  label?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Partly-ticked state, e.g. a "select all" box when only some rows are picked */
  indeterminate?: boolean;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <label
      className={cx(
        "inline-flex items-center gap-2 text-sm text-slate-700",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
      title={title}
    >
      <input
        ref={ref}
        type="checkbox"
        className="size-4 rounded border-slate-300 accent-brand-600 disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cx("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
        autoFocus={autoFocus}
      />
    </div>
  );
}

// ───────────────────────── Layout ─────────────────────────

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-brand-50 text-brand-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className={cx("rounded-lg p-1.5 [&>svg]:size-4", tones[tone])}>{icon}</span>}
      </div>
      <p className="num mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ───────────────────────── Data display ─────────────────────────

type Tone = "slate" | "green" | "amber" | "red" | "blue" | "violet";

const badgeTones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-brand-50 text-brand-700 ring-brand-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-slate-500/10",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

const statusTones: Record<string, Tone> = {
  PAID: "green",
  PARTIAL: "amber",
  UNPAID: "red",
  COMPLETED: "green",
  CANCELLED: "slate",
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  SENT_BACK: "amber",
  APPROVED: "blue",
  PARTIALLY_RECEIVED: "violet",
  RECEIVED: "green",
  REJECTED: "red",
  SENT: "green",
  SEED: "green",
  FERTILIZER: "blue",
  PESTICIDE: "violet",
  EQUIPMENT: "amber",
  OTHER: "slate",
  ADMIN: "violet",
  MANAGER: "blue",
  CASHIER: "green",
  ACCOUNTANT: "amber",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTones[status] ?? "slate"}>{status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ")}</Badge>;
}

/** Wrapper giving tables consistent styling; use <Th>/<Td> inside */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return (
    <th
      className={cx(
        "whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500",
        right && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  right,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  right?: boolean;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cx("border-b border-slate-100 px-3 py-2.5 text-slate-700", right && "num text-right", className)}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children = "Nothing here yet" }: { colSpan: number; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-400">
        {children}
      </td>
    </tr>
  );
}

export function LoadingRow({ colSpan, text = "Loading…" }: { colSpan: number; text?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center">
        <span className="inline-flex items-center gap-2 text-sm text-slate-500" role="status">
          <Loader2 className="size-5 animate-spin text-slate-400" />
          {text}
        </span>
      </td>
    </tr>
  );
}

export function Spinner({ className, text = "Loading…" }: { className?: string; text?: ReactNode }) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-2 py-16", className)} role="status">
      <Loader2 className="size-6 animate-spin text-brand-600" />
      {text && <span className="text-sm text-slate-500">{text}</span>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {message}
      {onRetry && (
        <button className="ml-3 font-medium underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return <p className="px-3 py-2.5 text-xs text-slate-500">{total} record{total === 1 ? "" : "s"}</p>;
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-xs text-slate-500">
      <span>
        {total} records · page {page} of {totalPages}
      </span>
      <div className="flex gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="size-4" />} aria-label="Previous page" />
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} icon={<ChevronRight className="size-4" />} aria-label="Next page" />
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === t.value
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Label/value pair for detail pages */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{children || "—"}</dd>
    </div>
  );
}

// ───────────────────────── Modal ─────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    // A dropdown inside the modal handles its own Escape (defaultPrevented)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" };
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh]">
      <div className="fixed inset-0" onClick={onClose} />
      <div className={cx("relative w-full rounded-xl bg-white shadow-xl", widths[size])}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/** Promise-based confirm dialog: `if (await confirm("Delete?")) …` */
const ConfirmContext = createContext<(message: string, opts?: { danger?: boolean; confirmLabel?: string }) => Promise<boolean>>(
  async () => false,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    message: string;
    danger?: boolean;
    confirmLabel?: string;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (message: string, opts?: { danger?: boolean; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => setState({ message, ...opts, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title="Please confirm"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{state?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

// ───────────────────────── Toasts ─────────────────────────

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastContext = createContext<{ success: (m: string) => void; error: (m: string) => void }>({
  success: () => {},
  error: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3000);
  }, []);
  const value = {
    success: useCallback((m: string) => push(m, "success"), [push]),
    error: useCallback((m: string) => push(m, "error"), [push]),
  };
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-lg px-4 py-3 text-sm shadow-lg",
              t.tone === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Extract a message from an unknown error */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
