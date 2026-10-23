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

const DEVICE_KEY = "oneroot.device";
// Used when the browser won't store anything (private mode): one id for this page load
let sessionDeviceId: string | null = null;

/** Random UUID; randomUUID needs HTTPS, so on a plain-http LAN address it is built from getRandomValues */
function newDeviceId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * This browser's device id: made once and kept, so the audit log can tell devices apart.
 * Sent with every request as X-Device-Id; the server adds the device name and IP itself.
 */
export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newDeviceId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    sessionDeviceId ??= newDeviceId();
    return sessionDeviceId;
  }
}

const DEVICE_INFO_KEY = "oneroot.deviceInfo";
let deviceInfo: string | null = null;

/** Client hints Chrome and Edge give a page that asks: phone model, exact OS and browser version (not in Safari / Firefox) */
interface UADataLike {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    model?: string;
    platform?: string;
    platformVersion?: string;
    fullVersionList?: { brand: string; version: string }[];
  }>;
}

/**
 * Reads the device's model, OS version and browser version once and keeps them, so every request can send
 * them (X-Device-Info) and the audit log names the device exactly, e.g. "Samsung SM-A146B · Android 14 · Chrome 141".
 */
async function loadDeviceInfo() {
  try {
    deviceInfo = localStorage.getItem(DEVICE_INFO_KEY);
  } catch {
    /* storage unavailable */
  }
  const ua = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
  if (!ua?.getHighEntropyValues) return;
  try {
    const h = await ua.getHighEntropyValues(["model", "platform", "platformVersion", "fullVersionList"]);
    // The real browser, not the "Not A Brand" / "Chromium" entries
    const brand = h.fullVersionList?.find((b) => !/Not.?A.?Brand|^Chromium$/i.test(b.brand)) ?? h.fullVersionList?.find((b) => b.brand === "Chromium");
    const info = encodeURIComponent(
      JSON.stringify({ model: h.model || undefined, platform: h.platform, platformVersion: h.platformVersion, browser: brand?.brand, browserVersion: brand?.version, mobile: ua.mobile }),
    );
    deviceInfo = info;
    try {
      localStorage.setItem(DEVICE_INFO_KEY, info);
    } catch {
      /* storage unavailable */
    }
  } catch {
    /* the browser declined: the server falls back to the user agent */
  }
}
if (typeof window !== "undefined") void loadDeviceInfo();

/** The X-Device-Id (and X-Device-Info) headers, also for requests made outside the shared client */
export const deviceHeader = (): Record<string, string> => {
  const id = getDeviceId();
  return { ...(id ? { "X-Device-Id": id } : {}), ...(deviceInfo ? { "X-Device-Info": deviceInfo } : {}) };
};

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
      ...deviceHeader(),
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

/** Headers every direct (non-JSON) call needs: sign-in, branch and device */
function authHeaders(): Record<string, string> {
  const token = getToken();
  const branch = getBranch();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch-Id": branch } : {}), ...deviceHeader() };
}

/** POSTs a multipart form (file uploads); errors come back as ApiError like any other call */
async function upload<T>(path: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    // No Content-Type: the browser sets the multipart boundary itself
    res = await fetch(API_URL + path, { method: "POST", headers: authHeaders(), body: form, signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) });
  } catch (e) {
    throw new ApiError(0, e instanceof DOMException && e.name === "TimeoutError" ? "The upload took too long — please try again" : "Network error — check your connection and try again");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new ApiError(res.status, res.status === 413 ? "A file is too large" : msg || `Upload failed (${res.status})`, data);
  }
  return data as T;
}

/** GETs a file as a blob (the API needs the sign-in header, so a plain link can't open it) */
async function blob(path: string): Promise<Blob> {
  const res = await fetch(API_URL + path, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.message || `Download failed (${res.status})`, data);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path + qs(query)),
  upload,
  blob,
  post: <T>(path: string, body?: unknown, opts?: SendOptions) => request<T>("POST", path, body ?? {}, opts),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
};
