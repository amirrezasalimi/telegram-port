FROM oven/bun:1.3.11-alpine
WORKDIR /app
COPY --chown=bun:bun server.ts ./server.ts
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
