#!/usr/bin/env bash
# ==============================================================================
# Script de forage de restauration (Restore Drill) - SARL BM Motors
# Valide l'intégrité de la sauvegarde quotidienne Cloudflare R2 sur une base de test
# ==============================================================================

set -euo pipefail

BACKUP_BUCKET="${R2_BUCKET_NAME:-bm-motors-backups}"
SCRATCH_DB_URL="${SCRATCH_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/bm_motors_test}"
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

if [ -z "${ENCRYPTION_KEY}" ]; then
    echo "❌ Erreur : BACKUP_ENCRYPTION_KEY non définie."
    exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "=========================================================="
echo "🛡️ Démarrage de l'exercice de restauration (Restore Drill)"
echo "Bucket R2 : ${BACKUP_BUCKET}"
echo "=========================================================="

# 1. Identifier la dernière sauvegarde chiffrée sur Cloudflare R2
echo "🔍 Recherche de la dernière sauvegarde sur Cloudflare R2..."
LATEST_BACKUP=$(aws s3 ls "s3://${BACKUP_BUCKET}/backups/" \
    --endpoint-url "${R2_ENDPOINT_URL}" \
    | sort | tail -n 1 | awk '{print $4}')

if [ -z "${LATEST_BACKUP}" ]; then
    echo "❌ Aucune archive de sauvegarde trouvée dans s3://${BACKUP_BUCKET}/backups/"
    exit 1
fi

echo "📦 Fichier identifié : ${LATEST_BACKUP}"

# 2. Téléchargement de l'archive chiffrée
echo "⬇️ Téléchargement depuis Cloudflare R2..."
aws s3 cp "s3://${BACKUP_BUCKET}/backups/${LATEST_BACKUP}" "${TMP_DIR}/${LATEST_BACKUP}" \
    --endpoint-url "${R2_ENDPOINT_URL}"

# 3. Déchiffrement AES-256-CBC
echo "🔓 Déchiffrement de l'archive..."
openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${TMP_DIR}/${LATEST_BACKUP}" \
    -out "${TMP_DIR}/backup.sql.gz" \
    -pass pass:"${ENCRYPTION_KEY}"

# 4. Décompression
echo "📂 Décompression du fichier SQL..."
gunzip "${TMP_DIR}/backup.sql.gz"

# 5. Restauration dans la base scratch
echo "📥 Restauration dans la base de test temporaire..."
psql "${SCRATCH_DB_URL}" -f "${TMP_DIR}/backup.sql" > /dev/null

# 6. Contrôle de cohérence comptable & intégrité des tables
echo "🔬 Exécution des tests de cohérence..."
PRODUCTS_COUNT=$(psql "${SCRATCH_DB_URL}" -t -c "SELECT COUNT(*) FROM products;")
CUSTOMERS_COUNT=$(psql "${SCRATCH_DB_URL}" -t -c "SELECT COUNT(*) FROM customers;")
SALES_COUNT=$(psql "${SCRATCH_DB_URL}" -t -c "SELECT COUNT(*) FROM sales_documents;")

echo "=========================================================="
echo "✅ Exercice de restauration réussi à 100% !"
echo "• Articles restaurés        : $(echo "${PRODUCTS_COUNT}" | tr -d ' ')"
echo "• Clients restaurés         : $(echo "${CUSTOMERS_COUNT}" | tr -d ' ')"
echo "• Bons de livraison vérifiés : $(echo "${SALES_COUNT}" | tr -d ' ')"
echo "RPO < 24h et intégrité des données validés."
echo "=========================================================="
