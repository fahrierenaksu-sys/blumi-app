#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BLUMI_EXPECTED_PROJECT_REF:?BLUMI_EXPECTED_PROJECT_REF is required}"
: "${BLUMI_BACKUP_BUCKET:?BLUMI_BACKUP_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"

if [[ "${NODE_ENV:-}" != "production" || "${BLUMI_DEPLOY_ENV:-}" != "production" ]]; then
  echo "Backup job requires the production environment." >&2
  exit 2
fi
if [[ ! "$BLUMI_EXPECTED_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] ||
   [[ ! "$DATABASE_URL" =~ ^postgres(ql)?://postgres\.${BLUMI_EXPECTED_PROJECT_REF}: ]] ||
   [[ "$DATABASE_URL" != *"sslmode=require"* && "$DATABASE_URL" != *"sslmode=verify-full"* ]]; then
  echo "Database identity or TLS setting does not match the expected Supabase project." >&2
  exit 2
fi
if [[ ! "$BLUMI_BACKUP_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{2,62}$ ]]; then
  echo "Invalid backup bucket name." >&2
  exit 2
fi

task_dir="$(mktemp -d)"
backup_file="$task_dir/public.dump"
trap 'rm -f "$backup_file" "$task_dir/receipt.json"; rmdir "$task_dir"' EXIT
chmod 0700 "$task_dir"

pg_dump --dbname="$DATABASE_URL" --no-password --schema=public \
  --format=custom --no-owner --no-acl --file="$backup_file"
pg_restore --list "$backup_file" >/dev/null

backup_hash="$(sha256sum "$backup_file" | cut -d ' ' -f 1)"
backup_bytes="$(wc -c < "$backup_file" | tr -d ' ')"
if (( backup_bytes > 5368709120 )); then
  echo "Single PUT limit exceeded; switch to a reviewed multipart backup uploader." >&2
  exit 1
fi
backup_time="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
backup_key="${BLUMI_EXPECTED_PROJECT_REF}/${backup_time}/public.dump"
receipt_key="${BLUMI_EXPECTED_PROJECT_REF}/${backup_time}/receipt.json"

encryption="$(aws s3api put-object --bucket "$BLUMI_BACKUP_BUCKET" --key "$backup_key" \
  --body "$backup_file" --server-side-encryption AES256 \
  --query ServerSideEncryption --output text)"
if [[ "$encryption" != "AES256" ]]; then
  echo "Backup upload did not confirm AES256 encryption." >&2
  exit 1
fi

printf '{"projectRef":"%s","createdAt":"%s","sha256":"%s","bytes":%s,"schema":"public"}\n' \
  "$BLUMI_EXPECTED_PROJECT_REF" "$backup_time" "$backup_hash" "$backup_bytes" \
  > "$task_dir/receipt.json"
receipt_encryption="$(aws s3api put-object --bucket "$BLUMI_BACKUP_BUCKET" --key "$receipt_key" \
  --body "$task_dir/receipt.json" --server-side-encryption AES256 \
  --query ServerSideEncryption --output text)"
if [[ "$receipt_encryption" != "AES256" ]]; then
  echo "Receipt upload did not confirm AES256 encryption." >&2
  exit 1
fi
echo "Backup upload acknowledged: ${backup_time}, ${backup_bytes} local bytes."
