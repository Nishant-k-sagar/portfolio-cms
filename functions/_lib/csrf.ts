import { HttpError } from "./http";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireCsrf(request: Request): void {
  if (!MUTATING_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  if (!origin || origin !== url.origin) {
    throw new HttpError(403, "forbidden", "Request origin is not allowed.");
  }
  const requestedWith = request.headers.get("x-requested-with");
  if (requestedWith !== "portfolio-cms") {
    throw new HttpError(403, "forbidden", "Missing required request header.");
  }
}
