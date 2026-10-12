# syntax=docker/dockerfile:1

# ---- 1. Build the React dashboard ------------------------------------------------
FROM node:22-alpine AS client-build
WORKDIR /app
# Manifests first, so dependencies are cached until they change.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client
COPY client/ client/
RUN npm run build --workspace client

# ---- 2. Runtime: Express API + the built dashboard -------------------------------
FROM node:22-alpine
# iputils ping uses unprivileged ICMP sockets, so the health checks work as a non-root user.
RUN apk add --no-cache iputils-ping
WORKDIR /app
ENV NODE_ENV=production \
    PORT=6030
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY server/src server/src
COPY --from=client-build /app/client/dist client/dist
# Custom devices (the servers you add) are stored here; mount a volume to keep them.
RUN mkdir -p server/data && chown node:node server/data
USER node
EXPOSE 6030
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
# Settings (FORTIGATE_HOST, FORTIGATE_TOKEN, ...) come from the environment at run time.
CMD ["node", "server/src/server.js"]
