#!/bin/sh
set -eu
rm -f /tmp/storage-ready
# Provision inside the storage container so the stack remains four services.
silo server /data --console-address ":9001" &
server_pid=$!
trap 'kill -TERM "$server_pid" 2>/dev/null || true' TERM INT
cleanup() { kill -TERM "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT
attempt=0
until curl -fsS http://127.0.0.1:9000/minio/health/ready >/dev/null; do
    kill -0 "$server_pid"
    attempt=$((attempt + 1))
    [ "$attempt" -lt 120 ] || { echo "Storage startup timed out" >&2; exit 1; }
    sleep 1
done
# Alias contains administrator credentials; never echo commands or config.
mcli alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mcli mb --ignore-existing "local/$S3_BUCKET" >/dev/null
mcli anonymous set none "local/$S3_BUCKET" >/dev/null
mcli admin user add local "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
# Environment values are validated before Compose starts (see setup guide).
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject"],"Resource":["arn:aws:s3:::%s/media/*"]}]}' "$S3_BUCKET" > /tmp/media-policy.json
mcli admin policy create local cspc-media /tmp/media-policy.json >/dev/null
mcli admin policy attach local cspc-media --user "$S3_ACCESS_KEY_ID" >/dev/null
touch /tmp/storage-ready
echo "Private media bucket and application access are ready."
wait "$server_pid"
