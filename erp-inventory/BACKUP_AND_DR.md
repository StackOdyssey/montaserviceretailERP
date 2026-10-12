# Backup & Disaster Recovery — SARL BM Motors ERP

Region: Neon `production` branch → Cloud Run `erp-system` (europe-west1).

## Objectives (RTO / RPO)

| Data | RPO (max loss) | RTO (max downtime) |
| --- | --- | --- |
| Postgres (Neon) | ≤ 24 h via nightly logical export; **minutes** via Neon PITR/instant branch | < 1 h (instant restore to a branch + repoint) |
| Media (Cloudflare R2) | 0 (object storage, versioned) | N/A (served by CDN) |
| App (Cloud Run) | 0 (stateless, image in Artifact Registry) | minutes (redeploy / rollback revision) |

## Strategy (two layers)

1. **Primary — Neon point-in-time restore / branching.** Neon keeps a history of the branch; any
   point in the retention window can be materialized instantly as a branch. This is the fast path
   for "someone deleted/overwrote data an hour ago".
2. **Secondary — nightly logical export to Cloudflare R2** (`.github/workflows/backup.yml`):
   `pg_dump` → `gzip` → GPG AES-256 → upload to an R2 bucket. Off-site, provider-independent,
   used if the Neon project itself is compromised/lost.

## Restore procedures

### A. Fast restore (Neon) — verify then cut over
```powershell
# 1. Materialize production at a past instant into a scratch branch
neon branches restore drill-now production@2026-10-11T12:00:00Z --project-id twilight-pine-29350562
# 2. Verify counts, then either repoint the app DATABASE_URL to that branch,
#    or restore production in place:
neon branches restore production production@2026-10-11T12:00:00Z --project-id twilight-pine-29350562
```
- `neon branches create --name <b> --parent production` gives an instant copy at "now".
- Retention window depends on the Neon plan (free ~short, paid up to 7 days) — **confirm the plan**.

### B. Drill (run 2×/year) — non-destructive
```powershell
node erp-inventory/scripts/dr-restore-drill.mjs
```
Creates a branch from `production`, checks `information_schema.tables` + row counts, deletes it.
Last run: OK (32 tables, 427 products).

### C. Logical restore (off-site export)
```bash
# Download the latest encrypted dump from R2, decrypt, decompress, restore
bash erp-inventory/restore-drill.sh   # see script for env vars
```

## Nightly backup workflow — required setup (TODO)
`.github/workflows/backup.yml` runs daily at 02:00 UTC. It needs GitHub Secrets + a bucket:
- Secrets: `DATABASE_URL` (Neon **unpooled**), `BACKUP_ENCRYPTION_KEY`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`, `CLOUDFLARE_ACCOUNT_ID`.
- Create the R2 backup bucket (e.g. `bm-motors-backups`) and keep the dump retention (e.g. 30 days
  daily + 12 monthly).

## Notes
- All sensitive runtime config lives in **Secret Manager** (`DATABASE_URL`, `R2_*`, `ADMIN_PIN`, `SESSION_SECRET`).
- R2 media is served via the bucket public URL; keep a weekly export of the object inventory if needed.
