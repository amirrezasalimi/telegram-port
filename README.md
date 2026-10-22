# Telegram Port

General-purpose Telegram Bot API reverse proxy in **Bun + TypeScript**, for an Iran application server to reach Telegram through a Germany server. No notification-specific handlers and no bot tokens stored on the proxy.

## Run

Copy `.env.example` to `.env`, set `TELEGRAM_PROXY_KEY` to a random secret (at least 32 characters, e.g. `openssl rand -hex 32`). Run `docker compose -f compose.yml up -d` on a Dokploy host with `dokploy-network`. Configure service `telegram-port`, port `3000`, domain `tg-port.jollune.ir`, HTTPS with Let's Encrypt. Point DNS at the Germany host. Port 3000 is not published publicly.

Dokploy builds from this GitHub repository using `compose.yml` and `Dockerfile`. The image copies `server.ts` into `/app/server.ts` and runs it with Bun. No application source is embedded in Compose commands or Docker configs. Secrets are injected at runtime from Dokploy environment settings and excluded from the image build context.

## API

Use Telegram's usual API paths and include `Authorization: Bearer <proxy-key>`:

```
GET  https://tg-port.jollune.ir/bot<TOKEN>/getMe
POST https://tg-port.jollune.ir/bot<TOKEN>/sendMessage
POST https://tg-port.jollune.ir/bot<TOKEN>/sendDocument
GET  https://tg-port.jollune.ir/bot<TOKEN>/getUpdates?timeout=60
GET  https://tg-port.jollune.ir/file/bot<TOKEN>/<file_path>
```

All Telegram Bot API methods are forwarded without interpreting message payloads. JSON, form URL-encoded, multipart uploads, query strings, file downloads, upstream statuses, and response bodies are supported. This is an HTTP reverse proxy for the Bot API, not MTProto or a general CONNECT/SOCKS proxy. Configure SDKs to use this base URL plus the authorization header. The proxy strips its own credentials before forwarding.

Limits: 50 MiB request bodies, 75-second upstream timeout (supports 60-second long polling), 300 authenticated requests/minute per instance. Adjust these constants for larger files or workloads. Telegram's own limits and permissions still apply.

## Testalyse integration

Set on the **Iran application server** (not this proxy):

```
TELEGRAM_PROXY_URL=https://tg-port.jollune.ir
TELEGRAM_PROXY_KEY=<same proxy key>
TELEGRAM_BOT_TOKEN=<your bot token>
TELEGRAM_ADMIN_BASE_URL=https://testalyse.com
```

Enable notifications in admin Settings with chat ID and optional forum thread ID. Add the bot to the destination with permission to post. New tickets/reports send a summary and exact-ticket admin link. Ticket bodies are truncated to 2800 characters; replies and historical tickets are not forwarded. Delivery is best-effort, with a bounded timeout and no retry queue; an outage can lose notifications but never deletes the saved ticket. Review app logs for `[telegram] Ticket notification failed`.

## Security and verification

TLS is mandatory. Only `api.telegram.org` is reachable; arbitrary destinations, redirects, traversal paths and methods other than GET/POST are rejected. Constant-time bearer-key validation, bounded bodies/timeouts, credential stripping, non-root read-only container, dropped capabilities and resource limits are enabled. No raw errors, URLs, tokens, or payloads are logged by the proxy. Do not enable access logs containing full paths on the reverse proxy: Telegram embeds bot tokens in paths. Keep all keys out of Git; rotate if exposed. Edge rate limiting/firewalling is recommended; the application limiter is not DDoS protection.

`GET /healthz` verifies process health only. Unauthenticated requests must return 401; authenticated `getMe` verifies Telegram connectivity without sending a message. Create a real ticket after configuring the destination to verify delivery and the admin button.
