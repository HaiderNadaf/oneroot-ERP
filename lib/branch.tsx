"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getBranch, setBranchId } from "./api";
import { useAuth } from "./auth";
import { cachedGet, clearApiCache } from "./hooks";

export interface BranchLite {
  id: string;
  code: string;
  name: string;
  city?: string | null;
}

interface BranchState {
  /** Branches this user may pick (staff: only their own) */
  branches: BranchLite[];
  /** Selected branch id, or "all" */
  currentId: string;
  /** Selected branch, null for "All branches" */
  current: BranchLite | null;
  /** Staff locked to their home branch can't switch */
  locked: boolean;
  /** Admins / multi-branch users may view "All branches" */
  canViewAll: boolean;
  setBranch: (id: string) => void;
  /** Reload the branch list (after an admin adds, renames or deactivates a branch) */
  refresh: () => void;
  /** Bumps when the branch changes; use as a React key to reload a page */
  version: number;
}

const BranchContext = createContext<BranchState | null>(null);

/**
 * Loads the branches the user may work in and keeps the top-bar choice
 * (saved in the browser and sent to the API as X-Branch-Id).
 * Children render only once the branch is known, so the first requests already carry it.
 */
export function BranchProvider({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<{ branches: BranchLite[]; locked: boolean; restricted: boolean; currentId: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [reloads, setReloads] = useState(0);
  const refresh = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // cachedGet keeps a copy on the device, so the branch is known even when offline
    cachedGet<{ locked: boolean; restricted?: boolean; homeBranchId: string | null; branches: BranchLite[] }>("/branches/mine")
      .then((r) => {
        if (cancelled) return;
        const stored = getBranch();
        // Users limited to some branches never get "All branches"
        const restricted = r.restricted ?? r.locked;
        const allowed = (id: string | null) => !!id && (r.branches.some((b) => b.id === id) || (id === "all" && !restricted));
        // Staff: always their branch. Others: last choice, else home branch, else the first branch.
        const currentId = r.locked
          ? (r.homeBranchId ?? r.branches[0]?.id ?? "all")
          : allowed(stored)
            ? stored!
            : (r.homeBranchId ?? r.branches[0]?.id ?? "all");
        setBranchId(currentId);
        setState({ branches: r.branches, locked: r.locked, restricted, currentId });
      })
      .catch(() => !cancelled && setState({ branches: [], locked: false, restricted: false, currentId: "all" }));
    return () => {
      cancelled = true;
    };
  }, [user, reloads]);

  const setBranch = useCallback((id: string) => {
    setBranchId(id);
    // Cached responses belong to the old branch
    clearApiCache();
    setState((s) => (s ? { ...s, currentId: id } : s));
    setVersion((v) => v + 1);
  }, []);

  if (!state) return <>{fallback ?? null}</>;
  const current = state.branches.find((b) => b.id === state.currentId) ?? null;
  return (
    <BranchContext.Provider
      value={{
        branches: state.branches,
        currentId: state.currentId,
        current,
        locked: state.locked,
        canViewAll: !state.restricted && state.branches.length > 1,
        setBranch,
        refresh,
        version,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside <BranchProvider>");
  return ctx;
}
