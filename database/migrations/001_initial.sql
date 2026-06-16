-- Kestrel KYC — Initial schema
-- Runs automatically on first postgres container start via /docker-entrypoint-initdb.d/

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- clients — API customers
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL UNIQUE,
    plan        TEXT        NOT NULL DEFAULT 'sandbox',
    rate_limit  INTEGER     NOT NULL DEFAULT 100,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- api_keys — SHA-256 hashed API keys
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    key_hash    VARCHAR(64) NOT NULL UNIQUE,            -- hex SHA-256 of the raw key
    key_prefix  VARCHAR(16) NOT NULL,                   -- visible prefix for dashboards
    environment TEXT        NOT NULL DEFAULT 'sandbox'
                            CHECK (environment IN ('sandbox', 'live')),
    revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_client ON api_keys(client_id);

-- ---------------------------------------------------------------------------
-- verification_sessions — core session table
-- ---------------------------------------------------------------------------
CREATE TABLE verification_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID        NOT NULL REFERENCES clients(id),
    status              TEXT        NOT NULL DEFAULT 'processing',
    workflow_type       TEXT        NOT NULL DEFAULT 'cdd'
                                    CHECK (workflow_type IN ('cdd', 'edd')),
    country             CHAR(2)     NOT NULL DEFAULT 'LK',
    nic_encrypted       BYTEA,
    name_encrypted      BYTEA,
    dob_encrypted       BYTEA,
    risk_score          NUMERIC(5,2),
    decision            TEXT,
    onfido_applicant_id TEXT,
    onfido_check_id     TEXT,
    ip_address          INET,
    ip_risk_score       NUMERIC(5,2),
    is_vpn              BOOLEAN     NOT NULL DEFAULT FALSE,
    document_s3_key     TEXT,
    selfie_s3_key       TEXT,
    webhook_url         TEXT,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    -- PDPA retention: 5 years from creation.
    -- timestamptz + interval is only STABLE (depends on session TZ), so it is
    -- not allowed in a generated column. The UTC round-trip below is IMMUTABLE.
    retention_until     TIMESTAMPTZ GENERATED ALWAYS AS
                            (timezone('UTC', timezone('UTC', created_at) + INTERVAL '5 years')) STORED
);
CREATE INDEX idx_sessions_client  ON verification_sessions(client_id);
CREATE INDEX idx_sessions_status  ON verification_sessions(status);
CREATE INDEX idx_sessions_created ON verification_sessions(created_at DESC);

-- ---------------------------------------------------------------------------
-- verification_checks — one row per check per session
-- ---------------------------------------------------------------------------
CREATE TABLE verification_checks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        NOT NULL REFERENCES verification_sessions(id) ON DELETE CASCADE,
    check_type  TEXT        NOT NULL,
    provider    TEXT        NOT NULL,
    status      TEXT        NOT NULL,
    score       NUMERIC(5,2),
    result_data JSONB       NOT NULL DEFAULT '{}'::jsonb,
    latency_ms  INTEGER,
    cost_usd    NUMERIC(10,4),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_checks_session ON verification_checks(session_id);

-- ---------------------------------------------------------------------------
-- audit_events — append-only, hash-chained
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
    id          BIGSERIAL PRIMARY KEY,
    session_id  UUID,
    client_id   UUID,
    event_type  TEXT        NOT NULL,
    event_data  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    hash        VARCHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_session ON audit_events(session_id);
CREATE INDEX idx_audit_created ON audit_events(created_at);

-- Immutability: block all UPDATE and DELETE on the audit trail.
CREATE RULE audit_events_no_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING;
CREATE RULE audit_events_no_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING;

-- ---------------------------------------------------------------------------
-- str_reports — Suspicious Transaction Reports
-- ---------------------------------------------------------------------------
CREATE TABLE str_reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID        NOT NULL REFERENCES verification_sessions(id),
    s3_key       TEXT        NOT NULL,
    match_type   TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    filed_at     TIMESTAMPTZ,
    lankafin_ref TEXT
);
CREATE INDEX idx_str_session ON str_reports(session_id);

-- ---------------------------------------------------------------------------
-- webhook_deliveries — outbound webhook attempts
-- ---------------------------------------------------------------------------
CREATE TABLE webhook_deliveries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        NOT NULL REFERENCES verification_sessions(id) ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status_code INTEGER,
    attempt     INTEGER     NOT NULL DEFAULT 0,
    next_retry  TIMESTAMPTZ,
    delivered   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_session   ON webhook_deliveries(session_id);
CREATE INDEX idx_webhook_undelivered ON webhook_deliveries(next_retry) WHERE delivered = FALSE;

COMMIT;
