<#
.SYNOPSIS
    Script PowerShell de déploiement automatique sur Google Cloud Run (Strict 0 €/an)
    Projet : SARL BM Motors ERP
#>

$ErrorActionPreference = "Stop"

$ProjectId = if ($env:GCP_PROJECT_ID) { $env:GCP_PROJECT_ID } else { "bm-motors-erp" }
$Region = if ($env:GCP_REGION) { $env:GCP_REGION } else { "europe-west1" }
$ServiceName = "bm-motors-erp"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 Déploiement de l'ERP BM Motors sur Google Cloud Run" -ForegroundColor Green
Write-Host "Projet GCP : $ProjectId"
Write-Host "Région     : $Region"
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Vérification de gcloud
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Error "L'outil CLI 'gcloud' n'est pas installé. Veuillez installer Google Cloud SDK : https://cloud.google.com/sdk/docs/install"
    exit 1
}

# 2. Définition du projet
gcloud config set project $ProjectId

# 3. Activation des APIs requises
Write-Host "📦 Activation des APIs Cloud Run, Cloud Build et Secret Manager..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

# 4. Compilation du conteneur avec Cloud Build
Write-Host "🔨 Construction de l'image Docker avec Cloud Build (120 min gratuites/mois)..." -ForegroundColor Yellow
gcloud builds submit --tag "gcr.io/$ProjectId/${ServiceName}:latest" .

# 5. Déploiement sur Cloud Run avec Scale-to-Zero
Write-Host "🌐 Déploiement du conteneur sur Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image "gcr.io/$ProjectId/${ServiceName}:latest" `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --min-instances 0 `
    --max-instances 2 `
    --memory 512Mi `
    --cpu 1 `
    --concurrency 80 `
    --timeout 300 `
    --port 8080

$ServiceUrl = gcloud run services describe $ServiceName --platform managed --region $Region --format 'value(status.url)'
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "✅ Déploiement terminé avec succès !" -ForegroundColor Green
Write-Host "🔗 URL de production : $ServiceUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
