export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

const TOKEN_KEY = "oneroot.token";

export function getToken() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The error body, e.g. { code: "APPROVAL_REQUIRED", kind, amount } */
    public data?: Record<string, unknown> | null,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Query) {
  if (!params) return "";
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

const BRANCH_KEY = "oneroot.branch";

/** Branch picked in the top bar ("all" = every branch). Sent with every request as X-Branch-Id. */
export function getBranch(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(BRANCH_KEY);
  } catch {
    return null;
  }
}

export function setBranchId(id: string | null) {
  try {
    if (id) localStorage.setItem(BRANCH_KEY, id);
    else localStorage.removeItem(BRANCH_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The API's reply when X-Branch-Id names a branch that no longer exists (see backend auth.guard.ts) */
const STALE_BRANCH_MESSAGE = "That branch does not exist or is inactive";

interface SendOptions {
  /** Override the top-bar branch (queued offline bills belong to the branch they were made in) */
  branchId?: string | null;
}

/**
 * Longest a request may take before the page gives up and shows an error instead of loading forever.
 * The API drops a dead database connection after 25s and retries a read up to twice, so a read gets 90s;
 * writes (imports, postings) get longer.
 */
const READ_TIMEOUT_MS = 90_000;
const WRITE_TIMEOUT_MS = 180_000;

class RequestTimeout extends Error {}

async function send(method: string, path: string, body?: unknown, opts?: SendOptions) {
  const token = getToken();
  const branch = opts?.branchId ?? getBranch();
  const ms = method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  return fetch(API_URL + path, {
    method,
    signal: AbortSignal.timeout(ms),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(branch ? { "X-Branch-Id": branch } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((e: unknown) => {
    throw e instanceof DOMException && e.name === "TimeoutError" ? new RequestTimeout(`No answer from the server in ${ms / 1000}s`) : e;
  });
}

async function request<T>(method: string, path: string, body?: unknown, opts?: SendOptions): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body, opts);
    // A dropped database connection shows up as a 5xx: retry reads once (never writes)
    if (method === "GET" && res.status >= 500) {
      await new Promise((r) => setTimeout(r, 400));
      res = await send(method, path, body, opts);
    }
  } catch (e) {
    // Already waited the full time: retrying would only make the page load for longer
    if (e instanceof RequestTimeout) throw new ApiError(0, "The server is taking too long to answer — please try again");
    if (method !== "GET") throw new ApiError(0, "Network error — check your connection and try again");
    await new Promise((r) => setTimeout(r, 400));
    try {
      res = await send(method, path, body, opts);
    } catch {
      throw new ApiError(0, e instanceof Error ? `Network error: ${e.message}` : "Network error");
    }
  }
  let data = await res.json().catch(() => null);
  // The branch saved in this browser was deleted or deactivated: forget it and retry without it
  if (res.status === 403 && data?.message === STALE_BRANCH_MESSAGE && !opts?.branchId && getBranch()) {
    setBranchId(null);
    res = await send(method, path, body, opts);
    data = await res.json().catch(() => null);
  }
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") {
      setToken(null);
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new ApiError(res.status, msg || `Request failed (${res.status})`, data && typeof data === "object" ? data : null);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path + qs(query)),
  post: <T>(path: string, body?: unknown, opts?: SendOptions) => request<T>("POST", path, body ?? {}, opts),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
};
