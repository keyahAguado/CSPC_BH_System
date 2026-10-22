#!/bin/sh
set -eu
# Use shell builtins: the storage image does not include grep or wc.
case "$S3_BUCKET" in ''|*[!a-z0-9-]*|-*|*-) echo 'Invalid storage bucket name' >&2; exit 1;; esac
[ "${#S3_BUCKET}" -ge 3 ] && [ "${#S3_BUCKET}" -le 63 ] || { echo 'Invalid bucket name length' >&2; exit 1; }
for storage_user in "$MINIO_ROOT_USER" "$S3_ACCESS_KEY_ID"; do
    case "$storage_user" in ''|*[!A-Za-z0-9_-]*) echo 'Invalid storage user name' >&2; exit 1;; esac
    [ "${#storage_user}" -ge 3 ] && [ "${#storage_user}" -le 64 ] || { echo 'Invalid storage user name length' >&2; exit 1; }
done
[ "$MINIO_ROOT_USER" != "$S3_ACCESS_KEY_ID" ] || { echo 'Storage admin and app users must differ' >&2; exit 1; }
[ "${#MINIO_ROOT_PASSWORD}" -ge 16 ] && [ "${#S3_SECRET_ACCESS_KEY}" -ge 16 ] || { echo 'Storage secrets must contain at least 16 characters' >&2; exit 1; }
[ "$MINIO_ROOT_PASSWORD" != "$S3_SECRET_ACCESS_KEY" ] || { echo 'Storage admin and app secrets must differ' >&2; exit 1; }
rm -f /tmp/storage-ready
silo server /data --console-address ":9001" &
server_pid=$!
trap 'kill -TERM "$server_pid" 2>/dev/null || true' TERM INT
cleanup() { kill -TERM "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT
attempt=0
until curl -fsS http://127.0.0.1:9000/minio/health/ready >/dev/null; do
    kill -0 "$server_pid"
    attempt=$((attempt + 1))
    [ "$attempt" -lt 120 ] || { echo 'Storage startup timed out' >&2; exit 1; }
    sleep 1
done
# Credentials remain inside the storage container; do not echo commands or config.
mcli alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mcli mb --ignore-existing "local/$S3_BUCKET" >/dev/null
mcli anonymous set none "local/$S3_BUCKET" >/dev/null
mcli admin user add local "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject"],"Resource":["arn:aws:s3:::%s/media/*"]}]}' "$S3_BUCKET" > /tmp/media-policy.json
mcli admin policy create local cspc-media /tmp/media-policy.json >/dev/null
mcli admin policy attach local cspc-media --user "$S3_ACCESS_KEY_ID" >/dev/null
touch /tmp/storage-ready
echo 'Private media bucket and application access are ready.'
wait "$server_pid"
