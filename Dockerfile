# syntax=docker/dockerfile:1

# Runtime image for the NestJS API, for the server (docs/DEPLOY.md). Build: docker compose build.
# Env vars come from compose at run time (/opt/backend/.env); nothing secret is baked in.
# Batch JSON (data/precomputed) is baked in: a new batch result means commit, rebuild, deploy.

ARG NODE_IMAGE=node:26.13.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
# HUSKY=0: the prepare script would try to install git hooks, and there is no .git here.
ENV HUSKY=0 \
    CI=true
COPY package.json pnpm-lock.yaml ./
# Node 25+ no longer ships corepack, so install the exact pnpm pinned in packageManager.
RUN npm install -g "$(node -p "require('./package.json').packageManager")" \
 && npm cache clean --force

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS prod-deps
# --ignore-scripts: husky (prepare) is a devDependency and is not installed here.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Files stay root-owned and read-only for the node user, so the app cannot rewrite itself.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# PRECOMPUTED_DIR defaults to the project root's data/precomputed, i.e. /app/data/precomputed.
COPY data/precomputed ./data/precomputed
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
