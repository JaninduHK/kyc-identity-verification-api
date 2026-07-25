## What does this PR do?
Brief description of the change.

Closes #(issue number)

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] Infrastructure / CI

## Service(s) changed
- [ ] gateway
- [ ] orchestrator
- [ ] document
- [ ] biometric
- [ ] aml
- [ ] risk
- [ ] audit
- [ ] notification
- [ ] sdk
- [ ] infra / CI

## Testing
- [ ] I added tests for this change
- [ ] All existing tests pass: `make test`
- [ ] I tested this manually with Docker Compose

## Compliance checklist (required for AML/risk/audit changes)
- [ ] This change does not log PII (NIC numbers, names, biometric data)
- [ ] This change does not weaken audit log tamper detection
- [ ] This change does not bypass or weaken PDPA data erasure
- [ ] This change does not hardcode credentials
- [ ] If this changes risk scoring or AML logic, I have documented why

## Breaking changes
Does this change the API contract, database schema, or environment variables?
- [ ] No breaking changes
- [ ] Yes — describe what changes and migration path:
