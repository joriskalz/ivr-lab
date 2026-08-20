FROM oven/bun:1.3.4 AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app

COPY . .
RUN bun run build

# Runtime only needs production dependencies (drizzle-orm for migrations);
# dev tooling (vite, typescript, eslint, drizzle-kit) stays out of the image.
FROM oven/bun:1.3.4 AS prod-deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.4 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_FILE_NAME=/app/data/app.db

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.mjs ./server.mjs

# Mount persistent storage at /app/data or the SQLite DB dies with the container.
RUN mkdir -p /app/data && chown -R bun:bun /app/data

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch(\"http://localhost:\" + (process.env.PORT || 3000) + \"/api/health\").then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# exec replaces the shell so bun receives SIGTERM and shuts down gracefully.
CMD ["sh", "-c", "bun run db:migrate && exec bun server.mjs"]
