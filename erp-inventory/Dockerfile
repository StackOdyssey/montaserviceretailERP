# syntax=docker/dockerfile:1
# Dockerfile multi-stage ultra-optimisé pour Next.js 16 Standalone sur Google Cloud Run (Strict 0 €/an)

# Stage 1: Base Alpine avec compatibilité musl/glibc
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Stage 2: Installation des dépendances de production
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 3: Compilation du projet Next.js en mode standalone
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Désactiver la télémétrie Next.js pour accélérer la compilation
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 4: Image finale allégée pour exécution sur Cloud Run (scale-to-zero)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Port 8080 standard pour Google Cloud Run
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Utilisateur système non-privilégié pour la sécurité
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copier les fichiers statiques publics
COPY --from=builder /app/public ./public

# Copier le build standalone et les assets statiques avec les bonnes permissions
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
