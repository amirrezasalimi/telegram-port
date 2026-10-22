import { timingSafeEqual } from "node:crypto";

const key = Bun.env.TELEGRAM_PROXY_KEY || "";
if (key.length < 32) throw new Error("TELEGRAM_PROXY_KEY must contain at least 32 characters");

// Only fixed Telegram origins are reachable. This is not an open HTTP/SOCKS proxy.
export function telegramTarget(path: string): URL | null {
  if (!/^\/(?:bot\d+:[A-Za-z0-9_-]+\/[A-Za-z][A-Za-z0-9_]*|file\/bot\d+:[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+)$/.test(path)) return null;
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return null;
  return new URL(path, "https://api.telegram.org");
}

let count = 0;
let reset = Date.now() + 60_000;
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: Number(Bun.env.PORT || 3000),
  maxRequestBodySize: 50 * 1024 * 1024,
  idleTimeout: 90,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true });
    }
    const provided = Buffer.from(request.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${key}`);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["GET", "POST"].includes(request.method)) {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, POST" } });
    }
    const target = telegramTarget(url.pathname);
    if (!target) return Response.json({ error: "Invalid Telegram API path" }, { status: 400 });
    target.search = url.search;
    if (Date.now() > reset) { count = 0; reset = Date.now() + 60_000; }
    if (++count > 300) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
    const headers = new Headers();
    // Never forward the proxy key, cookies, host or hop-by-hop headers.
    for (const name of ["content-type", "accept", "range"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "POST" ? request.body : undefined,
        redirect: "error",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(75_000)]),
      });
      const responseHeaders = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      for (const name of ["content-type", "content-range", "accept-ranges", "retry-after"]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      // Paths contain bot tokens: never log URLs or raw network errors.
      return Response.json({ error: "Telegram upstream unavailable" }, { status: 502 });
    }
  },
  error() { return Response.json({ error: "Proxy request failed" }, { status: 500 }); },
});
process.on("SIGTERM", () => { void server.stop(); });
