# S3 media storage

The four services are MySQL, Express, Vue/frontend Nginx, and Pigsty Silo. Silo is Pigsty's maintained S3-compatible object store, not the full Pigsty database/monitoring platform. Static frontend logos remain in the frontend image.

## Configuration
Copy .env.example to .env beside docker-compose.yml. Keep it private. All database, backend, storage and public VITE_* settings now come from this root file. Existing three-file configurations must be consolidated before updating; preserve database passwords, JWT_SECRET and the payment encryption key.

Use separate administrator credentials (SILO_ROOT_USER/SILO_ROOT_PASSWORD) and application credentials (S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY). Names use letters, digits, underscore or hyphen, 3-64 characters. Secrets must be different and at least 16 characters. S3_BUCKET uses lowercase letters, digits and hyphens, 3-63 characters. Keep the bucket name stable after uploading.

    docker compose config --quiet
    docker compose up -d --build
    docker compose ps

Compose selects S3 storage and http://media-storage:9000 automatically. Startup creates a private bucket and an app user with only GetObject/PutObject on media/*. Provisioning must finish before the backend starts. Initialization is repeatable. The pinned standard Silo image includes silo, mcli and curl.

The S3 API (127.0.0.1:9000) and administration console (127.0.0.1:9001) are loopback-only. Access the console locally or through an authorized SSH tunnel. Do not expose administrator credentials or the console to browsers.

## Upload and delivery
Uploads follow browser -> frontend -> backend validation -> Silo. MySQL stores a stable /uploads/s3/media/<category>/<UUID>.<extension> reference. New files are not written into the backend filesystem. Uploads still use memory buffering with the existing request limits; this change does not eliminate upload-processing load.

For retrieval the browser requests that reference. The backend issues a five-minute signed link, then the browser downloads from /storage/... through Nginx directly from Silo. Express does not stream the file bytes. Nginx strips /storage, forwards the signed internal Host value, and removes browser Authorization/Cookie headers. Keep that mapping intact; rewriting signed paths or Host incorrectly invalidates signatures.

House/room/profile images remain publicly viewable through unguessable references. New S3 permits require a current admin session, owning active owner, or verified pending applicant with a matching document reference; revoked tracking sessions are rejected. Signed URLs are temporary bearer capabilities: protect them while valid. The database stores stable references, not expiring links. PDF ranges and HEAD requests are supported by Silo delivery.

## Existing files
The previous media_uploads volume remains attached to the backend, serving old /uploads/... URLs. Cloudinary URLs remain external. This update neither migrates nor deletes existing files. Existing legacy/external document URLs retain their previous access behavior; migrate/restrict those separately when required. Do not remove media_uploads until migration and reference verification finish. Local orphan cleanup skips S3 mode.

## Development and hosted services
For direct host development, use STORAGE_PROVIDER=s3, S3_ENDPOINT=http://127.0.0.1:9000 and FRONTEND_URL=http://localhost:5173; Vite forwards /storage to the local S3 API. Restart development servers after env changes.

Render/Vercel do not automatically run this Compose storage service. Their existing cloudinary/local provider settings continue to apply; do not enable S3 there without a reachable object-storage service and the corresponding signed-delivery proxy. Deploy the new frontend alongside backend document-access changes.

## Operations and acceptance
Back up MySQL, silo_data, legacy media_uploads and credentials together onto independent storage. A named Docker volume is not a backup. Never run docker compose down -v on an existing installation.

Verify an image upload, multi-attachment image/PDF requirement, allowed/denied document access, range delivery, legacy URL, and persistence after container recreation. Keep test data outside the real installation. Rehearse backup restoration. S3 object deletion/reconciliation is not automatic; do not enable age-only expiry for active objects. Changing application keys creates another user; revoke retired users only after confirming replacement access.

Production needs HTTPS at the website edge, restricted backend/storage ports, unique credentials and tested backups. Use TLS for storage traffic across untrusted networks. Internal storage uses the private Docker network.

Official reference: https://github.com/pgsty/silo
