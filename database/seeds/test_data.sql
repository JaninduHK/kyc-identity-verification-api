-- Kestrel KYC — Test seed data (sandbox only)
-- Load with: make db-seed   (or psql -f this file)
--
-- Raw sandbox API keys (hand these to the SDK as X-API-Key):
--   ksk_sandbox_test_alpha_0001
--   ksk_sandbox_test_alpha_0002   (Acme Financial)
--   ksk_sandbox_test_beta_0001
--   ksk_sandbox_test_beta_0002    (Lanka Pay)
-- key_hash below = hex(sha256(raw_key)).

BEGIN;

INSERT INTO clients (id, name, email, plan, rate_limit) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Acme Financial (Pvt) Ltd', 'dev@acmefinancial.lk', 'sandbox', 100),
    ('22222222-2222-2222-2222-222222222222', 'Lanka Pay Solutions',      'dev@lankapay.lk',      'sandbox', 200)
ON CONFLICT (id) DO NOTHING;

INSERT INTO api_keys (client_id, key_hash, key_prefix, environment, revoked) VALUES
    ('11111111-1111-1111-1111-111111111111', 'cd8e238224a4bf08e64355bc9944ff370b1924b461637c2de6a1c60451af9203', 'ksk_sandbox_al', 'sandbox', FALSE),
    ('11111111-1111-1111-1111-111111111111', '61f9e35e7ffd9b1587bee63b620c1f5eca1688fadd42ecae7e8a871e82a9d64e', 'ksk_sandbox_al', 'sandbox', FALSE),
    ('22222222-2222-2222-2222-222222222222', 'ddb162399647abb1f55788d68d8f95292efdfb2e2f59b01e2687c7e738ae0b65', 'ksk_sandbox_be', 'sandbox', FALSE),
    ('22222222-2222-2222-2222-222222222222', '252744ad252cea8a96fdb3ffb2bc2dc1c3b68f4fbf7a26091456e2c720ea9273', 'ksk_sandbox_be', 'sandbox', FALSE)
ON CONFLICT (key_hash) DO NOTHING;

COMMIT;
