// Same as /api/health?check=1, at a path without a query string (easy to open or share).
import { GET as health } from "./health.js";

export function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  url.searchParams.set("check", "1");
  return health(new Request(url.href, { method: "GET", headers: request.headers }));
}
