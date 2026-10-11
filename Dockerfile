# syntax=docker/dockerfile:1
# Cloud Build uses the REPOSITORY ROOT as build context and expects ./Dockerfile.
# The Next.js app lives in erp-inventory/, so this root Dockerfile builds from there.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- dependencies ---
FROM base AS deps
COPY erp-inventory/package.json erp-inventory/package-lock.json ./
RUN npm ci

# --- build (Next.js standalone) ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY erp-inventory/ ./
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# --- runtime (Cloud Run) ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
