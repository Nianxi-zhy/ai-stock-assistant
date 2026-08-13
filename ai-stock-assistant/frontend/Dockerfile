# ---- deps: install node_modules once for layer caching ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile the Next.js app with standalone output ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_API_BASE is baked into the client bundle at build time.
# Because all API calls are made from the browser, it must be reachable
# from the host (not only inside the Docker network).
# Override with: docker build --build-arg NEXT_PUBLIC_API_BASE=http://<host>:8000/api/v1 .
ARG NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE

RUN npm run build

# ---- runner: minimal production image (standalone server only) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# node:22-alpine ships with a non-root "node" user
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server.js is produced by Next.js standalone output
CMD ["node", "server.js"]
