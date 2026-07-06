-- Kestrel KYC — Webhook registration
-- Runs automatically after 003_audit_chain.sql.
--
-- Backs the gateway's /v1/webhooks endpoints (client-scoped webhook
-- registration). Distinct from webhook_deliveries (per-attempt delivery log).

BEGIN;

CREATE TABLE IF NOT EXISTS webhooks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    description TEXT,
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_client ON webhooks(client_id);

COMMIT;
