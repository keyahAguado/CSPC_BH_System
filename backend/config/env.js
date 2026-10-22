import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
// Compose supplies environment variables; direct development reads root .env.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
