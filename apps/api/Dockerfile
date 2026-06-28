# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Prisma needs OpenSSL during client generation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm. Keep this pinned: pnpm 11 requires newer Node built-ins than
# the Node 20 runtime used by this image.
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# Copy workspace manifest first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/guards/package.json ./packages/guards/
COPY packages/browser/package.json ./packages/browser/
COPY packages/queue/package.json ./packages/queue/
COPY apps/api/package.json ./apps/api/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client before TypeScript builds that import Prisma enums.
RUN cd packages/db && pnpm exec prisma generate

# Build all workspace packages in dependency order
RUN pnpm --filter @linkedin-automation/db build
RUN pnpm --filter @linkedin-automation/guards build
RUN pnpm --filter @linkedin-automation/browser build
RUN pnpm --filter @linkedin-automation/queue build
RUN pnpm --filter @linkedin-automation/api build


# ── Stage 2: runner ──────────────────────────────────────────────────────────
# Use the Microsoft Playwright image — has all Chromium system dependencies
# pre-installed and is based on Ubuntu Jammy.
FROM mcr.microsoft.com/playwright:v1.44.0-jammy AS runner

# Install Xvfb for virtual display (required when HEADLESS=false)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# Copy workspace manifests for production install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/guards/package.json ./packages/guards/
COPY packages/browser/package.json ./packages/browser/
COPY packages/queue/package.json ./packages/queue/
COPY apps/api/package.json ./apps/api/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile --prod

# Copy compiled output and Prisma schema from builder
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/guards/dist ./packages/guards/dist
COPY --from=builder /app/packages/browser/dist ./packages/browser/dist
COPY --from=builder /app/packages/queue/dist ./packages/queue/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Generate Prisma client
RUN cd packages/db && pnpm exec prisma generate

ENV NODE_ENV=production
ENV PORT=3001
ENV HEADLESS=false

EXPOSE 3001

# xvfb-run starts a virtual X11 display so Chromium can run non-headless.
# The display is only used when HEADLESS=false (which is required in production
# to avoid LinkedIn's bot detection).
CMD ["sh", "-c", "cd packages/db && pnpm exec prisma migrate deploy && cd /app && xvfb-run --server-args='-screen 0 1280x800x24' node apps/api/dist/index.js"]
