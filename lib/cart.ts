"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The POS bill's lines, kept for this browser tab so the bill (and the top bar's cart count) survives leaving the
 * POS page: Next.js may drop a page it has hidden, and a refresh starts it again. One bill per user + branch, so a
 * branch switch or another sign-in never shows someone else's cart. Signing out clears them all.
 */
const STORAGE_KEY = "oneroot.posBill";

type Saved = Record<string, { count: number; lines: unknown[] }>;

let saved: Saved | null = null;
const listeners = new Set<() => void>();
const openers = new Set<() => void>();

function load(): Saved {
  if (saved) return saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Saved;
  } catch {
    saved = {};
  }
  return saved;
}

function store(next: Saved) {
  saved = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Whose bill: the signed-in user in the current branch */
export const cartOwner = (userId: string | undefined, branchId: string | undefined) => (userId ? `${userId}:${branchId ?? ""}` : "");

/** Items on this owner's POS bill (total quantity), 0 when there is none */
export function useCartCount(owner: string) {
  return useSyncExternalStore(subscribe, () => (owner ? (load()[owner]?.count ?? 0) : 0), () => 0);
}

/** The lines saved for this owner (empty when none) */
export function savedBillLines<T>(owner: string): T[] {
  return owner ? ((load()[owner]?.lines ?? []) as T[]) : [];
}

/** Save this owner's bill lines and item count; an empty bill is removed */
export function saveBill(owner: string, lines: unknown[], count: number) {
  if (!owner) return;
  const next = { ...load() };
  if (lines.length) next[owner] = { count, lines };
  else delete next[owner];
  store(next);
}

/** On sign-out: no bill is left behind for the next person on this tab */
export function clearSavedBills() {
  saved = {};
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((cb) => cb());
}

/** POS page: open the bill when the top bar's cart is clicked */
export function useOpenBillHandler(openBill: () => void) {
  useEffect(() => {
    openers.add(openBill);
    return () => {
      openers.delete(openBill);
    };
  }, [openBill]);
}

/** Opens the bill on the POS page; false when no POS page is showing to do it */
export function requestOpenBill() {
  openers.forEach((open) => open());
  return openers.size > 0;
}
