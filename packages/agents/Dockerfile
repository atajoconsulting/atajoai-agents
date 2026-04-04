# ---- Stage 1: Build ----
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json for each workspace package (cache layer)
COPY packages/db/package.json packages/db/
COPY packages/agents/package.json packages/agents/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy db package (needed for prisma generate + shared types)
COPY packages/db/ packages/db/

# Generate Prisma client
RUN pnpm --filter @atajoai/db build

# Copy agents source
COPY packages/agents/tsconfig.json packages/agents/
COPY packages/agents/src/ packages/agents/src/

# Build Mastra (generates .mastra/output with standalone bundle)
RUN cd packages/agents && pnpm run build

# ---- Stage 2: Runtime ----
FROM node:22-slim AS runtime

WORKDIR /app

# Copy only the build output (standalone bundle, no node_modules needed)
COPY --from=builder /app/packages/agents/.mastra/output ./

EXPOSE 4111

ENV NODE_ENV=production

CMD ["node", "./index.mjs"]
