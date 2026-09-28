#!/usr/bin/env bash
set -euo pipefail

: "${BLUMI_EXPECTED_PROJECT_REF:?BLUMI_EXPECTED_PROJECT_REF is required}"
: "${BLUMI_BACKUP_BUCKET:?BLUMI_BACKUP_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"

latest_key="$(aws s3api list-objects-v2 --bucket "$BLUMI_BACKUP_BUCKET" \
  --prefix "${BLUMI_EXPECTED_PROJECT_REF}/" \
  --query 'sort_by(Contents,&LastModified)[-1].Key' --output text)"
if [[ -z "$latest_key" || "$latest_key" == "None" || "$latest_key" != */receipt.json ]]; then
  echo "No completed backup receipt found as the latest object." >&2
  exit 1
fi
latest="$(aws s3api head-object --bucket "$BLUMI_BACKUP_BUCKET" --key "$latest_key" \
  --query LastModified --output text)"
receipt_file="$(mktemp)"
trap 'rm -f "$receipt_file"' EXIT
aws s3api get-object --bucket "$BLUMI_BACKUP_BUCKET" --key "$latest_key" \
  "$receipt_file" >/dev/null
expected_bytes="$(python3 -c '
import json, re, sys
with open(sys.argv[1], encoding="utf-8") as source:
    receipt = json.load(source)
assert receipt.get("projectRef") == sys.argv[2]
assert receipt.get("schema") == "public"
assert isinstance(receipt.get("bytes"), int) and receipt["bytes"] > 0
assert re.fullmatch(r"[0-9a-f]{64}", receipt.get("sha256", ""))
print(receipt["bytes"])
' "$receipt_file" "$BLUMI_EXPECTED_PROJECT_REF")"
backup_key="${latest_key%receipt.json}public.dump"
read -r remote_bytes remote_encryption < <(aws s3api head-object \
  --bucket "$BLUMI_BACKUP_BUCKET" --key "$backup_key" \
  --query '[ContentLength,ServerSideEncryption]' --output text)
if [[ "$remote_bytes" != "$expected_bytes" || "$remote_encryption" != "AES256" ]]; then
  echo "Backup archive size or encryption differs from its receipt." >&2
  exit 1
fi

latest_epoch="$(date -u -d "$latest" +%s)"
now_epoch="$(date -u +%s)"
age_seconds="$((now_epoch - latest_epoch))"
if (( age_seconds < 0 || age_seconds > 93600 )); then
  echo "Backup freshness gate failed: age ${age_seconds}s, limit 93600s." >&2
  exit 1
fi
echo "Backup freshness passed: age ${age_seconds}s."
