// Config loads (and validates) from the environment at import time, so these
// must be present before any src module is required.
process.env.COMPLIANCE_EMAIL = 'compliance@test.local';
process.env.COMPLY_ADVANTAGE_KEY = 'test-key';
process.env.LOG_LEVEL = 'silent';
