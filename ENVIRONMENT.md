# One root environment file

Copy root .env.example to root .env. Edit all database, backend, storage,
and public frontend settings there. No per-service env files are needed.

Docker: docker compose up -d --build
Backend settings: docker compose up -d --force-recreate backend
Storage credentials: docker compose up -d --force-recreate media_storage backend
VITE_* changes: docker compose up -d --build frontend

Direct development: backend/config/env.js and Vite resolve root .env regardless
of the working directory. Restart dev servers after changes.
For a host-run backend with Docker storage use STORAGE_PROVIDER=s3 and
S3_ENDPOINT=http://127.0.0.1:9000. Compose overrides the endpoint with internal DNS.

Only four explicitly public VITE_* build arguments enter the frontend build.
Never prefix private secrets with VITE_. Root .env stays outside Docker build
contexts and is ignored by Git. Backend variables are explicitly mapped in
Compose; add a mapping for any newly introduced backend variable.

Old env files are backed up under ignored _not-for-deploy/env-backup-*.
The old per-service example templates are consolidated into root .env.example.
