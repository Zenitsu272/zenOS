import { clearToken, getToken } from "../lib/storage";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Only invite routes can be used as an authentication return destination.
// Never navigate to an arbitrary URL supplied in the query string.
export function getInvitePath(value: string | null | undefined): string | null {
  return value && value.trim() === value && /^\/join\/[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  auth?: boolean;
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ApiError";
  }
}

function retryAfterSeconds(value: string | null): number | null {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.ceil(seconds) : null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (options.auth !== false) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && options.auth !== false) {
    clearToken();
    const next = getInvitePath(window.location.pathname)
      ?? getInvitePath(new URLSearchParams(window.location.search).get("next"));
    window.location.assign(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map((item: { msg: string }) => item.msg).join("; ")
            : message;
    } catch {
      message = response.statusText;
    }
    throw new ApiError(message, response.status, retryAfterSeconds(response.headers.get("Retry-After")));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
