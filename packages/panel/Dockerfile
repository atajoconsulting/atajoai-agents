# ---- Stage 1: Build ----
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json packages/db/
COPY packages/panel/package.json packages/panel/

RUN pnpm install --frozen-lockfile

COPY packages/db/ packages/db/
RUN pnpm --filter @atajoai/db build

COPY packages/panel/ packages/panel/
RUN pnpm --filter @atajoai/panel build

# ---- Stage 2: Runtime ----
FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/packages/panel/.next/standalone ./
COPY --from=builder /app/packages/panel/.next/static ./packages/panel/.next/static

EXPOSE 3000

CMD ["node", "packages/panel/server.js"]
