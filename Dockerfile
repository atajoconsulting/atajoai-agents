# ---- Stage 1: Build ----
FROM node:22-slim AS builder

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

WORKDIR /app

# Copiar archivos de dependencias primero (cache de layers)
COPY package.json pnpm-lock.yaml ./

# Instalar todas las dependencias (incluyendo devDependencies para el build)
RUN pnpm install --frozen-lockfile

# Copiar el código fuente
COPY tsconfig.json ./
COPY src/ ./src/

# Build de Mastra (genera .mastra/output con bundle standalone)
RUN pnpm run build

# ---- Stage 2: Runtime ----
FROM node:22-slim AS runtime

WORKDIR /app

# Copiar solo el output del build (bundle standalone, no necesita node_modules)
COPY --from=builder /app/.mastra/output ./

# Exponer el puerto por defecto de Mastra
EXPOSE 4111

ENV NODE_ENV=production

CMD ["node", "./index.mjs"]
