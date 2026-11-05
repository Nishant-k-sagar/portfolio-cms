import type { ApiErrorBody } from "../../shared/types";

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorJson(
  code: string,
  message: string,
  status: number,
  fields?: Record<string, string>,
): Response {
  const body: ApiErrorBody = {
    error: { code, message, ...(fields ? { fields } : {}) },
  };
  return json(body, { status });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function toErrorResponse(
  error: unknown,
  fallback = "Request failed.",
): Response {
  if (error instanceof HttpError) {
    return errorJson(error.code, error.message, error.status, error.fields);
  }
  console.error(
    JSON.stringify({ level: "error", message: fallback, error: String(error) }),
  );
  return errorJson("upstream_error", fallback, 500);
}

export async function readJson<T = unknown>(
  request: Request,
  maxBytes: number,
): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    throw new HttpError(400, "bad_request", "Could not read request body.");
  }
  if (buffer.byteLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as T;
  } catch {
    throw new HttpError(400, "bad_request", "Request body must be valid JSON.");
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
