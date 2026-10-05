#!/usr/bin/env bash
# ==============================================================================
# Script de déploiement automatique sur Google Cloud Run (Strict 0 €/an)
# Projet : SARL BM Motors ERP
# ==============================================================================

set -euo pipefail

# Paramètres configurables
PROJECT_ID="${GCP_PROJECT_ID:-bm-motors-erp}"
REGION="${GCP_REGION:-europe-west1}"
SERVICE_NAME="bm-motors-erp"

echo "=========================================================="
echo "🚀 Déploiement de l'ERP BM Motors sur Google Cloud Run"
echo "Projet GCP : ${PROJECT_ID}"
echo "Région     : ${REGION}"
echo "=========================================================="

# 1. Vérification de gcloud
if ! command -v gcloud &> /dev/null; then
    echo "❌ Erreur : L'outil CLI 'gcloud' n'est pas installé."
    echo "Installez Google Cloud SDK : https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# 2. Définition du projet actif
gcloud config set project "${PROJECT_ID}"

# 3. Activation des APIs requises (gratuites)
echo "📦 Activation des APIs Cloud Run, Cloud Build et Secret Manager..."
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com

# 4. Compilation du conteneur avec Google Cloud Build (120 min gratuites/mois)
echo "🔨 Construction de l'image de conteneur avec Cloud Build..."
gcloud builds submit --tag "gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest" .

# 5. Déploiement du service sur Cloud Run avec Scale-to-Zero (coût 0.00 €)
echo "🌐 Déploiement sur Google Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --image "gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest" \
    --platform managed \
    --region "${REGION}" \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 2 \
    --memory 512Mi \
    --cpu 1 \
    --concurrency 80 \
    --timeout 300 \
    --port 8080

echo "=========================================================="
echo "✅ Déploiement terminé avec succès !"
URL=$(gcloud run services describe "${SERVICE_NAME}" --platform managed --region "${REGION}" --format 'value(status.url)')
echo "🔗 URL de production : ${URL}"
echo "=========================================================="
