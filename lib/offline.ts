"use client";

import { useSyncExternalStore } from "react";
import { api, ApiError } from "./api";

// ───────────────────────── Persisted responses ─────────────────────────
// A copy of the data the POS needs is kept in the browser so billing works when the
// internet drops: catalogue, categories, store settings, branches and customer lookups.

const PERSIST_PREFIXES = ["/products", "/categories", "/settings", "/branches/mine", "/customers", "/auth/me", "/schemes/active", "/roles/mine", "/shifts/current"];
const PKEY = "oneroot.cache:";

export const shouldPersist = (key: string) => PERSIST_PREFIXES.some((p) => key.startsWith(p));

export function persistGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PKEY + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function persistSet(key: string, data: unknown) {
  try {
    localStorage.setItem(PKEY + key, JSON.stringify(data));
  } catch {
    /* quota exceeded or storage blocked — the live copy still works */
  }
}

export function persistClear() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PKEY)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;

// ───────────────────────── Online state ─────────────────────────

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

// ───────────────────────── Offline sales queue ─────────────────────────

export interface QueuedSale {
  /** Also sent as offlineId so a retried sync never bills twice */
  id: string;
  createdAt: string;
  branchId: string;
  payload: Record<string, unknown>;
  summary: { total: number; items: number; customerName: string | null; phone: string | null };
  /** Receipt data for reprinting while the bill is still queued */
  receipt: unknown;
  error: string | null;
  attempts: number;
}

const QKEY = "oneroot.posQueue";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const EMPTY: QueuedSale[] = [];
/** In-memory copy of the queue; the same array is returned until something changes (for useSyncExternalStore) */
let snapshot: QueuedSale[] | null = null;

function readStorage(): QueuedSale[] {
  try {
    return JSON.parse(localStorage.getItem(QKEY) ?? "[]") as QueuedSale[];
  } catch {
    return [];
  }
}

export function queueList(): QueuedSale[] {
  if (typeof window === "undefined") return EMPTY;
  if (!snapshot) snapshot = readStorage();
  return snapshot;
}

function queueSave(list: QueuedSale[]) {
  localStorage.setItem(QKEY, JSON.stringify(list));
  snapshot = list;
  emit();
}

export function queueAdd(q: QueuedSale) {
  queueSave([...queueList(), q]);
}

export function queueRemove(id: string) {
  queueSave(queueList().filter((q) => q.id !== id));
}

export function queueUpdate(id: string, patch: Partial<QueuedSale>) {
  queueSave(queueList().map((q) => (q.id === id ? { ...q, ...patch } : q)));
}

export const newOfflineId = () =>
  `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let syncing = false;

/**
 * Sends queued bills to the server, oldest first. Stops at the first network failure (still offline);
 * a bill the server rejects (e.g. stock ran out) stays in the queue with its error for a person to fix.
 */
export async function syncQueue(): Promise<{ synced: number; failed: number; offline: boolean }> {
  if (syncing) return { synced: 0, failed: 0, offline: false };
  syncing = true;
  let synced = 0;
  let failed = 0;
  let offline = false;
  try {
    for (const q of queueList()) {
      try {
        await api.post("/sales", { ...q.payload, offlineId: q.id, saleDate: q.createdAt }, { branchId: q.branchId });
        queueRemove(q.id);
        synced++;
      } catch (e) {
        if (isNetworkError(e)) {
          offline = true;
          break;
        }
        failed++;
        queueUpdate(q.id, { error: e instanceof Error ? e.message : "Rejected by server", attempts: q.attempts + 1 });
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed, offline };
}

function subscribeQueue(cb: () => void) {
  // Another tab may change the queue: re-read storage before notifying
  const onStorage = (e: StorageEvent) => {
    if (e.key === QKEY) {
      snapshot = readStorage();
      cb();
    }
  };
  listeners.add(cb);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Live view of the queue for the POS */
export const useQueue = () => useSyncExternalStore(subscribeQueue, queueList, () => EMPTY);
