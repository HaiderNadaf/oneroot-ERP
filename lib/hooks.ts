"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { isNetworkError, persistGet, persistSet, shouldPersist } from "./offline";

type Query = Record<string, string | number | boolean | undefined | null>;

// ───────────────────────── Request cache ─────────────────────────
// The API is a long round trip away, so recent GET results are kept in memory:
// revisiting a page shows the last data instantly while a fresh copy loads
// (stale-while-revalidate), and identical requests made at the same time share one call.

const MAX_ENTRIES = 200;
const responses = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();

function remember(key: string, data: unknown) {
  responses.delete(key);
  responses.set(key, data);
  if (responses.size > MAX_ENTRIES) responses.delete(responses.keys().next().value!);
}

function cacheKey(path: string, query?: Query) {
  const clean = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return path + JSON.stringify(clean);
}

/** GET with request de-duplication; result is remembered for instant revisits */
export function cachedGet<T>(path: string, query?: Query): Promise<T> {
  const key = cacheKey(path, query);
  let pending = inFlight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = api
      .get<T>(path, query)
      .then((data) => {
        remember(key, data);
        if (shouldPersist(key)) persistSet(key, data);
        return data;
      })
      .catch((e) => {
        // Offline: fall back to the copy saved on this device, if there is one
        const saved = isNetworkError(e) && shouldPersist(key) ? persistGet<T>(key) : null;
        if (saved === null) throw e;
        remember(key, saved);
        return saved;
      });
    inFlight.set(key, pending);
    const done = () => inFlight.delete(key);
    pending.then(done, done);
  }
  return pending;
}

/** Forget cached responses (all, or those whose path starts with a prefix) — e.g. after signing out */
export function clearApiCache(prefix?: string) {
  for (const key of [...responses.keys()]) if (!prefix || key.startsWith(prefix)) responses.delete(key);
}

/**
 * GET a resource and re-fetch whenever `path` or `query` change.
 * Shows the last cached copy immediately (if any) and refreshes it in the background.
 * Pass `null` as path to skip fetching.
 */
export function useApi<T>(path: string | null, query?: Query) {
  const key = path ? cacheKey(path, query) : null;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ for: string | null; data: T | null; error: string | null }>({
    for: null,
    data: null,
    error: null,
  });
  const requestKey = key ? `${key}#${version}` : null;

  useEffect(() => {
    if (!path || !requestKey) return;
    let cancelled = false;
    cachedGet<T>(path, query)
      .then((data) => !cancelled && setState({ for: requestKey, data, error: null }))
      .catch(
        (e) =>
          !cancelled &&
          setState((s) => ({ for: requestKey, data: s.data, error: e instanceof Error ? e.message : "Failed to load" })),
      );
    return () => {
      cancelled = true;
    };
    // `requestKey` captures path, query and reload version
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const reload = useCallback(async () => {
    // After a save, never reuse a request that started before it
    if (key) inFlight.delete(key);
    setVersion((v) => v + 1);
  }, [key]);
  const setData = useCallback(
    (fn: T | null | ((d: T | null) => T | null)) =>
      setState((s) => {
        const data = typeof fn === "function" ? (fn as (d: T | null) => T | null)(s.data) : fn;
        if (key) remember(key, data);
        return { ...s, data };
      }),
    [key],
  );

  const fresh = state.for === requestKey;
  // While a new request is in flight, show the cached copy for this exact query if we have one,
  // otherwise keep showing whatever was on screen (e.g. the previous page of a list)
  const cached = key && !fresh && responses.has(key) ? (responses.get(key) as T) : undefined;

  return {
    data: fresh ? state.data : (cached ?? state.data),
    error: fresh ? state.error : null,
    /** True only when there is nothing cached to show yet */
    loading: !!requestKey && !fresh && cached === undefined,
    /** True while any request is running, including background refreshes */
    refreshing: !!requestKey && !fresh,
    reload,
    setData,
  };
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
