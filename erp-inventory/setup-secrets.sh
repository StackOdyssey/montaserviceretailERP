#!/usr/bin/env bash
# ==============================================================================
# Script de configuration sécurisée des secrets dans Google Secret Manager
# ==============================================================================

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-bm-motors-erp}"

echo "🔐 Configuration des secrets Google Secret Manager pour le projet : ${PROJECT_ID}"

# 1. Enregistrement de l'URL Neon PostgreSQL
read -sp "Entrez la chaîne de connexion DATABASE_URL (Neon) : " DB_URL
echo ""
echo -n "${DB_URL}" | gcloud secrets create NEON_DATABASE_URL --data-file=- --project="${PROJECT_ID}" || \
echo -n "${DB_URL}" | gcloud secrets versions add NEON_DATABASE_URL --data-file=- --project="${PROJECT_ID}"

# 2. Enregistrement de la clé API Resend
read -sp "Entrez la clé RESEND_API_KEY (re_...) : " RESEND_KEY
echo ""
echo -n "${RESEND_KEY}" | gcloud secrets create RESEND_API_KEY --data-file=- --project="${PROJECT_ID}" || \
echo -n "${RESEND_KEY}" | gcloud secrets versions add RESEND_API_KEY --data-file=- --project="${PROJECT_ID}"

echo "✅ Tous les secrets ont été enregistrés avec succès dans Secret Manager."
