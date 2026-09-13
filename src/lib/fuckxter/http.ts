const API_BASE = (import.meta.env.PUBLIC_FUCKXTER_API_URL ?? "").replace(
  /\/+$/,
  "",
);

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function apiEndpoint(path: string): string {
  if (!API_BASE) {
    throw new ApiError(
      "未配置 PUBLIC_FUCKXTER_API_URL，无法连接 FuckXter 后端。",
      0,
      "API_NOT_CONFIGURED",
    );
  }
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Fuckxter-Client", "web");
  if (typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiEndpoint(path), {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const error = (body ?? {}) as ApiErrorBody;
    throw new ApiError(
      error.error?.message ?? error.message ?? `请求失败（${response.status}）`,
      response.status,
      error.error?.code,
    );
  }

  return body as T;
}
