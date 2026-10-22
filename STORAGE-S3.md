# Four-container Pigsty S3 deployment

Compose runs MySQL, Express backend, Vue/frontend Nginx, and Pigsty's Silo
S3-compatible media server. This uses the Silo container published by Pigsty;
it does not install the complete Pigsty Ansible/monitoring platform.
Reference: https://silo.pigsty.io/download/

## Local start
The root .env contains database settings plus:
- SILO_ROOT_USER and SILO_ROOT_PASSWORD: storage administrator login.
- S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY: separate application user.
- S3_BUCKET: lowercase bucket name, default cspc-bh-media.

Use unique long credentials. The initial local setup generated missing credentials
in your ignored root .env without printing them. Do not commit that file.
For a fresh checkout copy .env.example to .env and replace every placeholder.
Keep root and application users different; use letters/numbers for their names.
Use a valid S3 bucket name (lowercase letters, digits, hyphens; 3–63 characters).

Run:
    docker compose up -d --build

There are exactly four services, with no extra provisioning container.
The storage startup script waits for readiness, creates a private bucket,
creates the application user, and grants only GetObject/PutObject on media/*.
The backend waits for successful storage provisioning. Initialization is repeatable.
A failed provisioning step stops the storage container rather than starting the
backend with an unusable bucket.

Compose sets Docker-internal storage settings to use:
    STORAGE_PROVIDER=s3
    S3_ENDPOINT=http://media-storage:9000
    S3_FORCE_PATH_STYLE=true

Bucket and app credentials come from the root .env for both services.
Outside Docker, the backend and Vite also read root .env. Use
http://127.0.0.1:9000 when accessing local storage from a host-run backend.

API: http://127.0.0.1:9000
Admin console: http://127.0.0.1:9001 (root login from root .env).
Both published ports bind to loopback. Browser media requests use the website;
users do not connect to the storage console or receive storage credentials.

## Media flow
Upload: browser -> frontend Nginx -> backend validation -> Silo bucket.
Existing routes save /uploads/s3/media/<category>/<UUID>.<extension> in MySQL.
View: browser -> frontend Nginx -> backend -> Silo -> response.
The private bucket stores actual media in silo_data, a persistent Docker volume.
Container recreation retains this data. Never run docker compose down -v unless
you intend to delete database/media volumes.

Document URLs retain existing URL-based application access. Private bucket
permissions do not add document owner/admin authorization. This remains a
separate required change if documents must be confidential.

## Existing local files
The old media Nginx service is replaced. Its media_uploads volume is retained
on the backend, which serves old /uploads/... URLs through frontend Nginx.
New uploads go to Silo; old files have not been migrated or deleted.
Do not remove media_uploads until migration and reference verification finish.
Local orphan cleanup skips S3 mode, preserving legacy uploads.

## Operations
Back up MySQL, silo_data, legacy media_uploads, and credentials together.
S3 object deletion/reconciliation is not automated; do not configure age-only
expiry on active media. Changing the app key creates a new user; explicitly
revoke retired users via the console after verifying the new key.
Avoid changing bucket names after uploading: stored references use the currently
configured bucket. Pin tested storage releases and rehearse recovery.
Production ICTU deployment needs unique credentials, HTTPS at the website edge,
restricted storage network access, and tested backups. Internal Docker storage
traffic uses HTTP; use TLS if that traffic crosses an untrusted network.

## Checks
    node backend/tests/s3-storage.mjs
    docker compose config --quiet
    docker compose ps

Check actual uploads for profiles, houses, room photos, permit PDFs, old URLs,
missing objects and PDF ranges. The fixture test does not require live storage.
