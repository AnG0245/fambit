FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build:selfhost

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install --yes --no-install-recommends gosu ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NUBE_LISTEN_HOST=0.0.0.0 NUBE_DATA_DIR=/var/data/fambit FAMBIT_BACKUP_DIR=/var/data/backups PORT=10000
COPY --from=build /app/selfhost ./selfhost
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json
RUN chmod 755 /app/selfhost/docker-entrypoint.sh
EXPOSE 10000
ENTRYPOINT ["/app/selfhost/docker-entrypoint.sh"]
CMD ["node", "selfhost/server.mjs"]
