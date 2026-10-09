"use client";

import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Info, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AppNotification, NotificationType, Paged } from "@/lib/types";
import { cx } from "./ui";

const POLL_MS = 30_000;

interface Counts {
  unread: number;
  approvals: number;
  refresh: () => void;
}

const CountsContext = createContext<Counts>({ unread: 0, approvals: 0, refresh: () => {} });

/** Polls unread notifications and the user's pending PO approvals for badges */
export function CountsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ unread: 0, approvals: 0 });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () =>
      Promise.all([
        api.get<{ unread: number }>("/notifications/count"),
        api.get<{ mine: number }>("/purchase-orders/approvals/count").catch(() => ({ mine: 0 })),
      ])
        .then(([n, a]) => !cancelled && setCounts({ unread: n.unread, approvals: a.mine }))
        .catch(() => {});
    void load();
    const t = setInterval(load, POLL_MS);
    // Refresh when the tab comes back into view
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, tick]);

  return <CountsContext.Provider value={{ ...counts, refresh }}>{children}</CountsContext.Provider>;
}

export const useCounts = () => useContext(CountsContext);

const TYPE_STYLE: Record<NotificationType, { icon: ReactNode; dot: string }> = {
  INFO: { icon: <Info className="size-4 text-sky-600" />, dot: "bg-sky-500" },
  SUCCESS: { icon: <CheckCircle2 className="size-4 text-brand-600" />, dot: "bg-brand-500" },
  WARNING: { icon: <AlertTriangle className="size-4 text-amber-600" />, dot: "bg-amber-500" },
  DANGER: { icon: <XCircle className="size-4 text-red-600" />, dot: "bg-red-500" },
};

/** "5 min ago", "Yesterday", "12 Oct" */
export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 172_800) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NotificationRow({
  n,
  onOpen,
  compact,
}: {
  n: AppNotification;
  onOpen: (n: AppNotification) => void;
  compact?: boolean;
}) {
  const style = TYPE_STYLE[n.type] ?? TYPE_STYLE.INFO;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cx(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50",
        !n.isRead && "bg-brand-50/40",
      )}
    >
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-sm", n.isRead ? "text-slate-600" : "font-medium text-slate-900")}>{n.title}</span>
        {n.message && <span className={cx("mt-0.5 block text-xs text-slate-500", compact && "line-clamp-2")}>{n.message}</span>}
        <span className="mt-1 block text-[11px] text-slate-400">
          {n.module} · {timeAgo(n.createdAt)}
        </span>
      </span>
      {!n.isRead && <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", style.dot)} aria-label="Unread" />}
    </button>
  );
}

/** Bell button with unread badge and a dropdown of the latest notifications */
export function NotificationBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { unread, refresh } = useCounts();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get<Paged<AppNotification>>("/notifications", { pageSize: 8 })
      .then((r) => !cancelled && setItems(r.items))
      .catch(() => !cancelled && setItems([]));
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, unread]);

  async function openNote(n: AppNotification) {
    setOpen(false);
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      refresh();
    }
    if (n.link) router.push(n.link);
  }

  async function readAll() {
    await api.post("/notifications/read-all").catch(() => {});
    setItems((list) => list?.map((x) => ({ ...x, isRead: true })) ?? null);
    refresh();
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className={cx(
          "relative rounded-lg p-2 transition-colors",
          tone === "dark" ? "text-brand-100 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100",
        )}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="num absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <div className="flex items-center gap-3 text-xs">
              {unread > 0 && (
                <button onClick={readAll} className="font-medium text-slate-500 hover:text-slate-800">
                  Mark all read
                </button>
              )}
              <Link href="/notifications" onClick={() => setOpen(false)} className="font-medium text-brand-700 hover:underline">
                See all
              </Link>
            </div>
          </div>
          <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CheckCheck className="mx-auto size-6 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">You&apos;re all caught up</p>
              </div>
            ) : (
              items.map((n) => <NotificationRow key={n.id} n={n} onOpen={openNote} compact />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
