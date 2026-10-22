import { afterAll, expect, test } from "bun:test";

// Exercise the actual HTTP handler without contacting Telegram or requiring real credentials.
const key = "test-key-not-for-production-1234567890";
const process = Bun.spawn(["bun", "run", "server.ts"], {
  cwd: import.meta.dir,
  env: { ...Bun.env, TELEGRAM_PROXY_KEY: key, PORT: "18793" },
  stdout: "ignore", stderr: "ignore",
});
afterAll(() => process.kill());
const base = "http://127.0.0.1:18793";
for (let attempt = 0; attempt < 50; attempt++) {
  try { if ((await fetch(`${base}/healthz`)).ok) break; } catch {}
  await Bun.sleep(20);
}
test("health endpoint", async () => {
  expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ ok: true });
});
test("requires proxy authorization", async () => {
  expect((await fetch(`${base}/bot123:abc/getMe`)).status).toBe(401);
});
test("does not allow arbitrary destinations or methods", async () => {
  const headers = { authorization: `Bearer ${key}` };
  expect((await fetch(`${base}/https://example.com`, { headers })).status).toBe(400);
  expect((await fetch(`${base}/bot123:abc/getMe`, { method: "DELETE", headers })).status).toBe(405);
});
