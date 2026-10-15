import { existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Local stand-in for Vercel Functions: during `npm run dev`, a request to
 * /api/<name> runs the GET/POST export of api/<name>.ts, exactly as Vercel
 * does in production. Nothing here ships in the build.
 */
function localApi(): Plugin {
  return {
    name: "sigma-local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();
        const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
        const name = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
        const file = path.resolve(server.config.root, "api", `${name}.ts`);
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        };
        if (!name || name.includes("..") || !existsSync(file)) return send(404, { error: "Not found" });
        try {
          const mod = (await server.ssrLoadModule(file)) as Record<string, unknown>;
          const method = req.method ?? "GET";
          const handler = mod[method];
          if (typeof handler !== "function") return send(405, { error: `${method} not allowed` });
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const h of ["content-type", "accept"]) {
            const v = req.headers[h];
            if (typeof v === "string") headers.set(h, v);
          }
          const request = new Request(url.href, {
            method,
            headers,
            body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
          });
          const response = (await (handler as (r: Request) => Promise<Response>)(request)) as Response;
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          if (response.body) Readable.fromWeb(response.body as never).pipe(res);
          else res.end();
        } catch (err) {
          server.config.logger.error(`[api/${name}] ${err instanceof Error ? err.stack : String(err)}`);
          send(500, { error: "Local API crashed. See the terminal." });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load .env.local (all keys, not only VITE_*) into process.env for the local API only.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  return { plugins: [react(), localApi()] };
});
