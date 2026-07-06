// Config validates WEBHOOK_SECRET at import time; it must be present before any
// src module is required. DATABASE_URL is intentionally left unset so the store
// factory returns null (tests use an in-memory fake store instead).
process.env.WEBHOOK_SECRET = 'test-secret';
process.env.LOG_LEVEL = 'silent';
